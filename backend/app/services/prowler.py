import asyncio
import json
import os
import subprocess
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from app.core.config import settings
from app.db import load_all_scans, load_findings_json, save_findings_json, upsert_scan
from app.models.scan import (
    FindingSummary,
    ScanRequest,
    ScanResult,
    ScanStatus,
)
from app.services.translation import translate_findings_batch

logger = logging.getLogger(__name__)

_scans: Dict[str, ScanResult] = {}


async def restore_scans_from_db() -> None:
    """서버 기동 시 DB에서 스캔 이력을 복원합니다."""
    rows = await load_all_scans()
    for row in rows:
        scan = _row_to_scan_result(row)
        _scans[scan.scan_id] = scan
    logger.info(f"DB에서 스캔 이력 {len(rows)}건 복원 완료")


def get_scan(scan_id: str) -> Optional[ScanResult]:
    scan = _scans.get(scan_id)
    if scan and scan.status == ScanStatus.COMPLETED and not scan.findings:
        _load_findings_into_scan(scan)
    return scan


def _load_findings_into_scan(scan: ScanResult) -> None:
    if not scan.json_path:
        return
    raw_findings = load_findings_json(scan.json_path)
    scan.findings = [
        FindingSummary(**{k: v for k, v in f.items() if k != "raw"})
        for f in raw_findings
        if f
    ]


def list_scans() -> list[ScanResult]:
    return list(_scans.values())


async def start_scan(request: ScanRequest) -> str:
    """Prowler 스캔을 비동기로 시작하고 scan_id를 반환합니다."""
    scan_id = str(uuid.uuid4())

    scan_result = ScanResult(
        scan_id=scan_id,
        status=ScanStatus.PENDING,
        provider=request.provider,
        started_at=datetime.now(),
    )
    _scans[scan_id] = scan_result
    await upsert_scan(_scan_to_dict(scan_result))

    # 백그라운드에서 실행
    asyncio.create_task(_run_prowler(scan_id, request))

    return scan_id


async def _run_prowler(scan_id: str, request: ScanRequest) -> None:
    """Prowler를 subprocess로 실행합니다."""
    scan = _scans[scan_id]
    scan.status = ScanStatus.RUNNING

    output_dir = Path(settings.prowler_output_dir) / scan_id
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = _build_prowler_command(request, str(output_dir))
    logger.info(f"[{scan_id}] Prowler 실행: {' '.join(cmd)}")

    env = _build_env()

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        stdout, stderr = await proc.communicate()

        if proc.returncode not in (0, 3):  # 3 = FAIL findings 있음
            logger.error(f"[{scan_id}] Prowler 오류 (exit {proc.returncode}): {stderr.decode()}")
            scan.status = ScanStatus.FAILED
            scan.error_message = stderr.decode()[:500]
            scan.completed_at = datetime.now()
            await upsert_scan(_scan_to_dict(scan))
            return

        # JSON 결과 파싱
        findings = await _parse_prowler_output(output_dir)

        # 한국어 번역 (API 키 없으면 스킵)
        if settings.translation_enabled:
            logger.info(f"[{scan_id}] {len(findings)}개 항목 번역 시작")
        else:
            logger.info(f"[{scan_id}] 번역 비활성화 — 영문 결과 사용 ({len(findings)}개 항목)")
        translated = await translate_findings_batch(findings)

        # 결과 집계
        _aggregate_results(scan, translated, compliance=request.compliance)
        scan.status = ScanStatus.COMPLETED
        scan.completed_at = datetime.now()
        logger.info(f"[{scan_id}] 스캔 완료: 전체={scan.total}, 통과={scan.passed}, 실패={scan.failed}")

        # findings JSON 파일 저장 후 DB upsert
        started_at_str = scan.started_at.isoformat() if scan.started_at else ""
        json_path = save_findings_json(scan_id, [
            {**f, "raw": None} for f in translated
        ], started_at=started_at_str)
        scan.json_path = json_path
        await upsert_scan(_scan_to_dict(scan))

        # 메모리에서 findings 제거 — 조회 시 JSON 파일에서 lazy load
        scan.findings = []

    except FileNotFoundError:
        logger.error(f"[{scan_id}] prowler 명령어를 찾을 수 없습니다. 설치 여부를 확인하세요.")
        scan.status = ScanStatus.FAILED
        scan.error_message = "prowler가 설치되지 않았습니다. 'pip install prowler'로 설치하세요."
        scan.completed_at = datetime.now()
        await upsert_scan(_scan_to_dict(scan))
    except Exception as e:
        logger.exception(f"[{scan_id}] 스캔 오류: {e}")
        scan.status = ScanStatus.FAILED
        scan.error_message = str(e)
        scan.completed_at = datetime.now()
        await upsert_scan(_scan_to_dict(scan))


def _build_prowler_command(request: ScanRequest, output_dir: str) -> list[str]:
    """Prowler CLI 명령어를 구성합니다."""
    cmd = [
        "prowler",
        request.provider,
        "--output-formats", "json-ocsf",
        "--output-directory", output_dir,
        "--no-banner",
    ]

    # --compliance와 --service는 동시 사용 불가
    if request.compliance:
        cmd.extend(["--compliance", request.compliance])
    else:
        if request.services:
            cmd.extend(["--service"] + request.services)
        if request.checks:
            cmd.extend(["--check"] + request.checks)

    if request.severity:
        cmd.extend(["--severity"] + [s.value for s in request.severity])

    if request.region and request.provider == "aws":
        cmd.extend(["--region", request.region])

    return cmd


def _build_env() -> dict:
    """Prowler 실행에 필요한 환경변수를 구성합니다."""
    env = os.environ.copy()

    if settings.aws_access_key_id:
        env["AWS_ACCESS_KEY_ID"] = settings.aws_access_key_id
    if settings.aws_secret_access_key:
        env["AWS_SECRET_ACCESS_KEY"] = settings.aws_secret_access_key
    if settings.aws_default_region:
        env["AWS_DEFAULT_REGION"] = settings.aws_default_region

    return env


async def _parse_prowler_output(output_dir: Path) -> list[dict]:
    """Prowler JSON 출력을 파싱합니다 (json-ocsf 형식)."""
    findings = []

    # Prowler v4는 *.ocsf.json 파일 생성
    json_files = list(output_dir.rglob("*.json"))
    if not json_files:
        logger.warning(f"JSON 출력 파일을 찾을 수 없음: {output_dir}")
        return findings

    for json_file in json_files:
        try:
            content = json_file.read_text(encoding="utf-8")
            data = json.loads(content)

            items = data if isinstance(data, list) else [data]
            for item in items:
                finding = _parse_finding(item)
                if finding:
                    findings.append(finding)
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"JSON 파일 파싱 오류 {json_file}: {e}")

    logger.info(f"파싱된 findings 수: {len(findings)}")
    return findings


# OCSF status → PASS/FAIL 매핑
_OCSF_STATUS_MAP = {
    "New": "FAIL",
    "Suppressed": "PASS",
    "Resolved": "PASS",
    "Other": "FAIL",
}


def _parse_finding(item: dict) -> Optional[dict]:
    """Prowler json-ocsf 항목을 내부 포맷으로 변환합니다."""
    try:
        # ── OCSF 형식 (Prowler v4) ──────────────────────────────────
        if "finding_info" in item or "class_uid" in item:
            finding_info = item.get("finding_info", {})
            cloud = item.get("cloud", {})
            resources = item.get("resources", [{}])
            resource = resources[0] if resources else {}
            remediation = item.get("remediation", {})

            # check_id: metadata.event_code 또는 finding_info.uid에서 마지막 세그먼트
            metadata = item.get("metadata", {})
            check_id = metadata.get("event_code", "")
            if not check_id:
                uid = finding_info.get("uid", "")
                check_id = uid.split("-")[-1] if uid else ""

            # 서비스명: resource group 또는 check_id 첫 세그먼트
            service_name = (resource.get("group") or {}).get("name", "")
            if not service_name and check_id:
                service_name = check_id.split("_")[0]

            # status: status_code(PASS/FAIL) → OCSF status 문자열로 폴백
            raw_status = item.get("status_code", "")
            if not raw_status:
                raw_status = _OCSF_STATUS_MAP.get(item.get("status", ""), "FAIL")

            remediation_text = remediation.get("desc", "")
            refs = remediation.get("references", [])
            if refs:
                remediation_text += f"\n참고: {', '.join(refs[:2])}"

            # account_id, namespace, cluster
            account_id = cloud.get("account", {}).get("uid", "")
            namespace = resource.get("namespace", "")
            resource_type = resource.get("type", "")
            cluster = resource.get("name", "") if "cluster" in resource_type.lower() else ""

            return {
                "check_id": check_id,
                "check_title": finding_info.get("title", ""),
                "service_name": service_name,
                "severity": item.get("severity", "medium").lower(),
                "status": raw_status.upper(),
                "resource_id": resource.get("name", ""),
                "resource_arn": resource.get("uid", ""),
                "region": cloud.get("region", resource.get("region", "")),
                "description": finding_info.get("desc", ""),
                "remediation": remediation_text,
                "raw": item,
                "account_id": account_id,
                "namespace": namespace,
                "cluster": cluster,
            }

        # ── 레거시 형식 (Prowler v3) ────────────────────────────────
        check_metadata = item.get("CheckMetadata", {}) or {}
        resource_info = item.get("ResourceDetails", {}) or {}

        remediation = check_metadata.get("Remediation", {})
        if isinstance(remediation, dict):
            remediation_text = remediation.get("Recommendation", {}).get("Text", "")
        else:
            remediation_text = str(remediation) if remediation else ""

        return {
            "check_id": item.get("CheckID", item.get("check_id", "")),
            "check_title": check_metadata.get("CheckTitle", item.get("check_title", "")),
            "service_name": check_metadata.get("ServiceName", item.get("service_name", "")),
            "severity": item.get("Severity", item.get("severity", "medium")).lower(),
            "status": item.get("Status", item.get("status", "FAIL")),
            "resource_id": item.get("ResourceId", resource_info.get("id", "")),
            "resource_arn": item.get("ResourceArn", resource_info.get("arn", "")),
            "region": item.get("Region", item.get("region", "")),
            "description": check_metadata.get("Description", item.get("description", "")),
            "remediation": remediation_text,
            "raw": item,
        }

    except Exception as e:
        logger.error(f"finding 파싱 오류: {e}")
        return None


def _aggregate_results(scan: ScanResult, findings: list[dict], compliance: Optional[str] = None) -> None:
    """스캔 결과를 집계합니다."""
    scan.findings = []
    scan.total = len(findings)
    scan.passed = 0
    scan.failed = 0
    scan.error_count = 0
    scan.services_summary = {}
    scan.severity_summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
    scan.compliance = compliance

    account_ids_set: set = set()
    regions_set: set = set()

    for f in findings:
        status = f.get("status", "").upper()
        severity = f.get("severity", "medium").lower()
        service = f.get("service_name", "unknown")

        if status == "PASS":
            scan.passed += 1
        elif status == "FAIL":
            scan.failed += 1
        elif status in ("ERROR", "MUTED"):
            scan.error_count += 1

        # 심각도별 집계
        if severity in scan.severity_summary:
            scan.severity_summary[severity] += 1

        # 서비스별 집계
        if service not in scan.services_summary:
            scan.services_summary[service] = {"total": 0, "passed": 0, "failed": 0}
        scan.services_summary[service]["total"] += 1
        if status == "PASS":
            scan.services_summary[service]["passed"] += 1
        elif status == "FAIL":
            scan.services_summary[service]["failed"] += 1

        # account_ids / regions 수집
        account_id = f.get("account_id", "")
        if account_id:
            account_ids_set.add(account_id)
        region = f.get("region", "")
        if region:
            regions_set.add(region)

        # FindingSummary 생성
        scan.findings.append(
            FindingSummary(
                check_id=f.get("check_id", ""),
                check_title=f.get("check_title", ""),
                check_title_ko=f.get("check_title_ko"),
                service_name=service,
                severity=severity,
                status=status,
                resource_id=f.get("resource_id"),
                resource_arn=f.get("resource_arn"),
                region=region or None,
                description=f.get("description"),
                description_ko=f.get("description_ko"),
                remediation=f.get("remediation"),
                remediation_ko=f.get("remediation_ko"),
                account_id=account_id or None,
                namespace=f.get("namespace") or None,
                cluster=f.get("cluster") or None,
            )
        )

    scan.account_ids = sorted(account_ids_set)
    scan.regions = sorted(regions_set)


def _scan_to_dict(scan: ScanResult) -> dict:
    return {
        "scan_id":          scan.scan_id,
        "status":           scan.status.value,
        "provider":         scan.provider,
        "started_at":       scan.started_at.isoformat() if scan.started_at else None,
        "completed_at":     scan.completed_at.isoformat() if scan.completed_at else None,
        "error_message":    scan.error_message,
        "total":            scan.total,
        "passed":           scan.passed,
        "failed":           scan.failed,
        "error_count":      scan.error_count,
        "compliance":       scan.compliance,
        "regions":          scan.regions,
        "account_ids":      scan.account_ids,
        "severity_summary": scan.severity_summary,
        "services_summary": scan.services_summary,
        "json_path":        scan.json_path,
    }


def _row_to_scan_result(row: dict) -> ScanResult:
    from datetime import datetime as dt
    def _parse_dt(val):
        return dt.fromisoformat(val) if val else None

    return ScanResult(
        scan_id=row["scan_id"],
        status=ScanStatus(row["status"]),
        provider=row["provider"],
        started_at=_parse_dt(row.get("started_at")),
        completed_at=_parse_dt(row.get("completed_at")),
        error_message=row.get("error_message"),
        total=row.get("total", 0),
        passed=row.get("passed", 0),
        failed=row.get("failed", 0),
        error_count=row.get("error_count", 0),
        compliance=row.get("compliance"),
        regions=row.get("regions", []),
        account_ids=row.get("account_ids", []),
        severity_summary=row.get("severity_summary", {}),
        services_summary=row.get("services_summary", {}),
        json_path=row.get("json_path"),
    )
