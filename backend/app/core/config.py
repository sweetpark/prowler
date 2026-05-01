from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    # Anthropic API (선택적 - 없으면 영문 결과 표시)
    anthropic_api_key: Optional[str] = None
    claude_model: str = "claude-haiku-4-5"

    @property
    def translation_enabled(self) -> bool:
        return bool(self.anthropic_api_key and self.anthropic_api_key.strip())

    # Prowler settings
    prowler_output_dir: str = "/tmp/prowler_results"

    # 영구 저장 경로
    results_dir: str = "/app/data/results"
    db_path: str = "/app/data/scans.db"

    # AWS credentials
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_session_token: Optional[str] = None
    aws_default_region: str = "ap-northeast-2"

    # Azure credentials
    azure_client_id: Optional[str] = None
    azure_client_secret: Optional[str] = None
    azure_tenant_id: Optional[str] = None
    azure_subscription_id: Optional[str] = None

    # GCP credentials
    google_application_credentials: Optional[str] = None
    google_cloud_project: Optional[str] = None

    # OCI (Oracle Cloud Infrastructure) credentials
    oci_cli_user: Optional[str] = None
    oci_cli_tenancy: Optional[str] = None
    oci_cli_fingerprint: Optional[str] = None
    oci_cli_key_file: Optional[str] = None
    oci_cli_region: Optional[str] = None

    # Kubernetes
    kubeconfig: Optional[str] = None

    # Microsoft 365
    m365_client_id: Optional[str] = None
    m365_client_secret: Optional[str] = None
    m365_tenant_id: Optional[str] = None

    # GitHub
    github_token: Optional[str] = None

    @property
    def available_providers(self) -> List[str]:
        """자격증명이 설정된 클라우드 제공자 목록 반환"""
        providers = ["aws"]  # AWS는 IAM Role로도 동작 가능하므로 항상 포함
        if self.azure_client_id and self.azure_tenant_id:
            providers.append("azure")
        if self.google_application_credentials or self.google_cloud_project:
            providers.append("gcp")
        if self.oci_cli_user and self.oci_cli_tenancy:
            providers.append("oci")
        if self.kubeconfig:
            providers.append("kubernetes")
        if self.m365_client_id and self.m365_tenant_id:
            providers.append("m365")
        if self.github_token:
            providers.append("github")
        return providers

    # App settings
    app_title: str = "Prowler 한국어 대시보드"
    debug: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
