from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from app.core.config import settings
from app.models.scan import DashboardStats, ScanRequest, ScanResult, ScanStatus
from app.services import prowler as prowler_service

router = APIRouter(prefix="/api", tags=["scan"])


@router.get("/config", summary="서버 설정 조회")
async def get_config():
    return {
        "translation_enabled": settings.translation_enabled,
        "claude_model": settings.claude_model if settings.translation_enabled else None,
        "available_providers": settings.available_providers,
    }


@router.post("/scan", response_model=dict, summary="Prowler 스캔 시작")
async def start_scan(request: ScanRequest):
    scan_id = await prowler_service.start_scan(request)
    return {"scan_id": scan_id, "message": "스캔이 시작되었습니다."}


@router.get("/scan/{scan_id}", response_model=ScanResult, summary="스캔 결과 조회")
async def get_scan(scan_id: str):
    result = prowler_service.get_scan(scan_id)
    if not result:
        raise HTTPException(status_code=404, detail="스캔을 찾을 수 없습니다.")
    return result


@router.get("/scans", response_model=List[ScanResult], summary="전체 스캔 목록")
async def list_scans():
    return prowler_service.list_scans()


@router.get("/dashboard", response_model=DashboardStats, summary="대시보드 통계")
async def get_dashboard():
    scans = prowler_service.list_scans()
    completed = [s for s in scans if s.status == ScanStatus.COMPLETED]

    if not completed:
        return DashboardStats()

    latest = sorted(completed, key=lambda x: x.completed_at or x.started_at, reverse=True)[0]

    failed_findings = [f for f in latest.findings if f.status == "FAIL"]
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
    failed_findings.sort(key=lambda x: severity_order.get(x.severity, 99))

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


def _load_check_metadata(provider: str, check_id: str) -> dict:
    """prowler 패키지에서 check metadata.json을 직접 읽어 상세 정보를 반환합니다."""
    import importlib.util, json
    from pathlib import Path

    # CLI provider명 → 패키지 디렉토리명 매핑
    _PROVIDER_DIR = {
        "oci":           "oraclecloud",
        "oraclecloud":   "oraclecloud",
        "googleworkspace": "googleworkspace",
        "alibabacloud":  "alibabacloud",
        "mongodbatlas":  "mongodbatlas",
    }
    pkg_provider = _PROVIDER_DIR.get(provider, provider)

    try:
        spec = importlib.util.find_spec(f"prowler.providers.{pkg_provider}.services")
        if not spec or not spec.submodule_search_locations:
            return {}
        services_path = Path(list(spec.submodule_search_locations)[0])
        # check_id 폴더 탐색 (서비스 폴더 → check 폴더)
        for meta_file in services_path.rglob(f"{check_id}/{check_id}.metadata.json"):
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            remediation = data.get("Remediation", {})
            recommendation = remediation.get("Recommendation", {})
            code = remediation.get("Code", {})
            return {
                "description": data.get("Description", ""),
                "risk": data.get("Risk", ""),
                "related_url": data.get("RelatedUrl", "") or "",
                "additional_urls": data.get("AdditionalURLs", []),
                "remediation_text": recommendation.get("Text", ""),
                "remediation_url": recommendation.get("Url", ""),
                "remediation_cli": code.get("CLI", ""),
                "remediation_other": code.get("Other", ""),
                "categories": data.get("Categories", []),
                "resource_type": data.get("ResourceType", ""),
            }
    except Exception:
        pass
    return {}


@router.get("/checks", summary="점검 항목 목록")
async def get_available_checks(
    provider: str = Query(default="aws"),
    compliance: Optional[str] = Query(default=None),
    service: Optional[str] = Query(default=None),
    detail: bool = Query(default=False, description="True이면 각 항목의 상세 메타데이터 포함"),
):
    import asyncio
    import re

    _ansi = re.compile(r"\x1b\[[0-9;]*m")
    _check_line = re.compile(r"^\[(\w+)\]\s+(.+?)\s+-\s+(\w+)\s+\[(\w+)\]")

    cmd = ["prowler", provider, "--list-checks", "--no-banner"]
    if compliance:
        cmd.extend(["--compliance", compliance])
    if service:
        cmd.extend(["--service", service])

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()

        checks = []
        for raw_line in stdout.decode().splitlines():
            line = _ansi.sub("", raw_line).strip()
            m = _check_line.match(line)
            if m:
                check = {
                    "check_id": m.group(1),
                    "title": m.group(2),
                    "service": m.group(3),
                    "severity": m.group(4).lower(),
                }
                if detail:
                    check.update(_load_check_metadata(provider, m.group(1)))
                checks.append(check)

        return {"checks": checks, "total": len(checks), "provider": provider}
    except FileNotFoundError:
        return {"checks": [], "total": 0, "error": "prowler가 설치되지 않았습니다.", "provider": provider}


@router.get("/compliances", summary="지원 컴플라이언스 프레임워크 목록")
async def get_compliances():
    aws_compliances = [
        {"value": "cis_2.0_aws", "label": "CIS AWS Foundations v2.0"},
        {"value": "cis_3.0_aws", "label": "CIS AWS Foundations v3.0"},
        {"value": "aws_foundational_security_best_practices_aws", "label": "AWS Foundational Security Best Practices"},
        {"value": "pci_4.0_aws", "label": "PCI DSS v4.0"},
        {"value": "hipaa_aws", "label": "HIPAA"},
        {"value": "soc2_aws", "label": "SOC 2"},
        {"value": "iso27001_2022_aws", "label": "ISO 27001:2022"},
        {"value": "gdpr_aws", "label": "GDPR"},
        {"value": "kisa_isms_p_2023_aws", "label": "KISA ISMS-P 2023"},
        {"value": "kisa_isms_p_2023_korean_aws", "label": "KISA ISMS-P 2023 (한국어)"},
        {"value": "nist_800_53_revision_5_aws", "label": "NIST 800-53 Rev.5"},
        {"value": "nist_csf_2.0_aws", "label": "NIST CSF 2.0"},
        {"value": "mitre_attack_aws", "label": "MITRE ATT&CK"},
        {"value": "ens_rd2022_aws", "label": "ENS RD2022"},
        {"value": "rbi_cyber_security_framework_aws", "label": "RBI Cyber Security Framework"},
        {"value": "fedramp_moderate_revision_4_aws", "label": "FedRAMP Moderate Rev.4"},
    ]
    azure_compliances = [
        {"value": "cis_2.1_azure", "label": "CIS Azure Foundations v2.1"},
        {"value": "azure_foundational_security_best_practices_azure", "label": "Azure Foundational Security Best Practices"},
        {"value": "pci_3.2.1_azure", "label": "PCI DSS v3.2.1"},
        {"value": "hipaa_azure", "label": "HIPAA"},
        {"value": "iso27001_2013_azure", "label": "ISO 27001:2013"},
        {"value": "soc2_azure", "label": "SOC 2"},
        {"value": "mitre_attack_azure", "label": "MITRE ATT&CK"},
        {"value": "nist_800_53_revision_5_azure", "label": "NIST 800-53 Rev.5"},
        {"value": "nist_csf_2.0_azure", "label": "NIST CSF 2.0"},
    ]
    gcp_compliances = [
        {"value": "cis_2.0_gcp", "label": "CIS GCP Foundations v2.0"},
        {"value": "gcp_foundational_security_best_practices_gcp", "label": "GCP Foundational Security Best Practices"},
        {"value": "pci_3.2.1_gcp", "label": "PCI DSS v3.2.1"},
        {"value": "hipaa_gcp", "label": "HIPAA"},
        {"value": "iso27001_2013_gcp", "label": "ISO 27001:2013"},
        {"value": "nist_800_53_revision_5_gcp", "label": "NIST 800-53 Rev.5"},
        {"value": "nist_csf_2.0_gcp", "label": "NIST CSF 2.0"},
        {"value": "mitre_attack_gcp", "label": "MITRE ATT&CK"},
    ]
    oci_compliances = [
        {"value": "cis_2.0_oci", "label": "CIS OCI Foundations v2.0"},
    ]
    kubernetes_compliances = [
        {"value": "cis_3.0_kubernetes", "label": "CIS Kubernetes v3.0"},
        {"value": "nist_800_53_revision_5_kubernetes", "label": "NIST 800-53 Rev.5"},
    ]
    m365_compliances = [
        {"value": "cis_4.0_m365", "label": "CIS Microsoft 365 v4.0"},
        {"value": "mitre_attack_m365", "label": "MITRE ATT&CK"},
    ]
    github_compliances = [
        {"value": "cis_2.1_github", "label": "CIS GitHub v2.1"},
    ]

    return {
        "compliances": {
            "aws": aws_compliances,
            "azure": azure_compliances,
            "gcp": gcp_compliances,
            "oci": oci_compliances,
            "kubernetes": kubernetes_compliances,
            "m365": m365_compliances,
            "github": github_compliances,
        }
    }


@router.get("/services", summary="사용 가능한 서비스 목록")
async def get_available_services(provider: str = Query(default="aws")):
    services_map = {
        "aws": [
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
        ],
        "azure": [
            "aad", "aks", "app", "appinsights", "appservice", "cognitive",
            "containerregistry", "cosmosdb", "defender", "entra", "iam",
            "keyvault", "monitor", "mysql", "network", "postgresql",
            "securitycenter", "sql", "sqlserver", "storage", "vm",
        ],
        "gcp": [
            "accessapproval", "artifact", "bigquery", "bigtable", "cloudfunctions",
            "cloudsql", "cloudtrace", "compute", "confidentialcomputing",
            "dataproc", "dns", "gke", "iam", "kms", "logging", "monitoring",
            "pubsub", "secretmanager", "storage", "vertexai", "vpc",
        ],
        "oci": [
            "audit", "blockstorage", "compute", "database", "events", "iam",
            "identity", "logging", "monitoring", "networking", "objectstorage",
        ],
        "kubernetes": [
            "apiserver", "controllermanager", "etcd", "kubelet", "node",
            "pod", "rbac", "scheduler",
        ],
        "m365": [
            "admincenter", "defender", "entra", "exchange", "purview",
            "sharepoint", "teams",
        ],
        "github": [
            "actions", "branch", "organization", "repo", "secret", "webhook",
        ],
    }
    services = services_map.get(provider, [])
    return {"services": services, "provider": provider}
