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
from app.models.scan import (
    FindingSummary,
    ScanRequest,
    ScanResult,
    ScanStatus,
)
from app.services.translation import translate_findings_batch

logger = logging.getLogger(__name__)

# 메모리 내 스캔 상태 저장소 (프로덕션에서는 DB/Redis 사용)
_scans: Dict[str, ScanResult] = {}


def get_scan(scan_id: str) -> Optional[ScanResult]:
    return _scans.get(scan_id)


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
            return

        # JSON 결과 파싱
        findings = await _parse_prowler_output(output_dir)

        # 한국어 번역
        logger.info(f"[{scan_id}] {len(findings)}개 항목 번역 시작")
        translated = await translate_findings_batch(findings)

        # 결과 집계
        _aggregate_results(scan, translated)
        scan.status = ScanStatus.COMPLETED
        scan.completed_at = datetime.now()
        logger.info(f"[{scan_id}] 스캔 완료: 전체={scan.total}, 통과={scan.passed}, 실패={scan.failed}")

    except FileNotFoundError:
        logger.error(f"[{scan_id}] prowler 명령어를 찾을 수 없습니다. 설치 여부를 확인하세요.")
        scan.status = ScanStatus.FAILED
        scan.error_message = "prowler가 설치되지 않았습니다. 'pip install prowler'로 설치하세요."
        scan.completed_at = datetime.now()
    except Exception as e:
        logger.exception(f"[{scan_id}] 스캔 오류: {e}")
        scan.status = ScanStatus.FAILED
        scan.error_message = str(e)
        scan.completed_at = datetime.now()


def _build_prowler_command(request: ScanRequest, output_dir: str) -> list[str]:
    """Prowler CLI 명령어를 구성합니다."""
    cmd = [
        "prowler",
        request.provider,
        "--output-formats", "json",
        "--output-directory", output_dir,
        "--no-banner",
    ]

    if request.services:
        cmd.extend(["--services"] + request.services)

    if request.checks:
        cmd.extend(["--checks"] + request.checks)

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
    """Prowler JSON 출력을 파싱합니다."""
    findings = []

    # Prowler v3/v4는 타임스탬프 디렉토리에 JSON 파일 생성
    json_files = list(output_dir.rglob("*.json"))
    # ocsf 또는 regular JSON 파일 찾기
    json_files = [f for f in json_files if "ocsf" not in f.name.lower()]

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

    return findings


def _parse_finding(item: dict) -> Optional[dict]:
    """Prowler JSON 항목을 내부 포맷으로 변환합니다."""
    try:
        # Prowler v3/v4 공통 필드
        check_metadata = item.get("CheckMetadata", {}) or item.get("metadata", {})
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


def _aggregate_results(scan: ScanResult, findings: list[dict]) -> None:
    """스캔 결과를 집계합니다."""
    scan.findings = []
    scan.total = len(findings)
    scan.passed = 0
    scan.failed = 0
    scan.error_count = 0
    scan.services_summary = {}
    scan.severity_summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}

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
                region=f.get("region"),
                description=f.get("description"),
                description_ko=f.get("description_ko"),
                remediation=f.get("remediation"),
                remediation_ko=f.get("remediation_ko"),
            )
        )
