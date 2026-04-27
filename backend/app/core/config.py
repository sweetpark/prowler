from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Anthropic API (선택적 - 없으면 영문 결과 표시)
    anthropic_api_key: Optional[str] = None
    claude_model: str = "claude-haiku-4-5"

    @property
    def translation_enabled(self) -> bool:
        """API 키가 설정된 경우에만 번역 활성화"""
        return bool(self.anthropic_api_key and self.anthropic_api_key.strip())

    # Prowler settings
    prowler_output_dir: str = "/tmp/prowler_results"

    # AWS credentials (선택적 - IAM Role 사용 시 불필요)
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_default_region: str = "ap-northeast-2"

    # App settings
    app_title: str = "Prowler 한국어 대시보드"
    debug: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
