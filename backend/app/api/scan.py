from fastapi import APIRouter, HTTPException
from typing import List

from app.models.scan import DashboardStats, ScanRequest, ScanResult, ScanStatus
from app.services import prowler as prowler_service

router = APIRouter(prefix="/api", tags=["scan"])


@router.post("/scan", response_model=dict, summary="Prowler 스캔 시작")
async def start_scan(request: ScanRequest):
    """
    Prowler 스캔을 비동기로 시작합니다.
    반환된 scan_id로 결과를 조회하세요.
    """
    scan_id = await prowler_service.start_scan(request)
    return {"scan_id": scan_id, "message": "스캔이 시작되었습니다."}


@router.get("/scan/{scan_id}", response_model=ScanResult, summary="스캔 결과 조회")
async def get_scan(scan_id: str):
    """
    scan_id로 스캔 상태 및 결과를 조회합니다.
    status가 'completed'이면 findings에 결과가 담겨있습니다.
    """
    result = prowler_service.get_scan(scan_id)
    if not result:
        raise HTTPException(status_code=404, detail="스캔을 찾을 수 없습니다.")
    return result


@router.get("/scans", response_model=List[ScanResult], summary="전체 스캔 목록")
async def list_scans():
    """지금까지 실행된 스캔 목록을 반환합니다."""
    return prowler_service.list_scans()


@router.get("/dashboard", response_model=DashboardStats, summary="대시보드 통계")
async def get_dashboard():
    """
    최근 완료된 스캔 기준으로 대시보드 통계를 반환합니다.
    """
    scans = prowler_service.list_scans()
    completed = [s for s in scans if s.status == ScanStatus.COMPLETED]

    if not completed:
        return DashboardStats()

    # 가장 최근 완료된 스캔 기준
    latest = sorted(completed, key=lambda x: x.completed_at or x.started_at, reverse=True)[0]

    # 상위 5개 실패 항목
    failed_findings = [f for f in latest.findings if f.status == "FAIL"]
    # 심각도 순 정렬
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
    failed_findings.sort(key=lambda x: severity_order.get(x.severity, 99))

    # 서비스별 실패 건수
    service_breakdown = {
        svc: data["failed"]
        for svc, data in latest.services_summary.items()
        if data["failed"] > 0
    }

    return DashboardStats(
        last_scan_id=latest.scan_id,
        last_scan_at=latest.completed_at,
        total_checks=latest.total,
        passed=latest.passed,
        failed=latest.failed,
        error_count=latest.error_count,
        severity_breakdown=latest.severity_summary,
        service_breakdown=service_breakdown,
        top_failed_checks=failed_findings[:10],
    )


@router.get("/checks", summary="사용 가능한 점검 항목 목록")
async def get_available_checks():
    """
    Prowler에서 사용 가능한 점검 항목 목록을 반환합니다.
    """
    import asyncio
    import subprocess

    try:
        proc = await asyncio.create_subprocess_exec(
            "prowler", "aws", "--list-checks",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        lines = stdout.decode().strip().split("\n")
        checks = [line.strip() for line in lines if line.strip() and not line.startswith("[")]
        return {"checks": checks, "total": len(checks)}
    except FileNotFoundError:
        return {"checks": [], "total": 0, "error": "prowler가 설치되지 않았습니다."}


@router.get("/services", summary="사용 가능한 서비스 목록")
async def get_available_services():
    """Prowler가 지원하는 AWS 서비스 목록"""
    services = [
        "accessanalyzer", "account", "acm", "apigateway", "appstream",
        "autoscaling", "awslambda", "backup", "bedrock", "cloudformation",
        "cloudfront", "cloudtrail", "cloudwatch", "codecommit", "cognito",
        "config", "dax", "directconnect", "dynamodb", "ec2", "ecr", "ecs",
        "efs", "eks", "elasticache", "elb", "emr", "fsx", "glacier",
        "glue", "guardduty", "iam", "inspector2", "kafka", "kinesis",
        "kms", "macie", "mq", "msk", "opensearch", "organizations",
        "rds", "redshift", "route53", "s3", "sagemaker", "secretsmanager",
        "securityhub", "ses", "shield", "sns", "sqs", "ssm", "sso",
        "storagegateway", "trustedadvisor", "vpc", "waf", "wellarchitected",
        "workspaces",
    ]
    return {"services": services}
