from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class ScanStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFORMATIONAL = "informational"


class ScanRequest(BaseModel):
    provider: str = Field(default="aws", description="클라우드 제공자 (aws, azure, gcp)")
    services: Optional[List[str]] = Field(default=None, description="점검할 서비스 목록 (없으면 전체)")
    checks: Optional[List[str]] = Field(default=None, description="점검할 항목 목록")
    severity: Optional[List[ScanSeverity]] = Field(default=None, description="점검할 심각도 필터")
    region: Optional[str] = Field(default=None, description="AWS 리전")
    compliance: Optional[str] = Field(default=None, description="컴플라이언스 프레임워크")


class FindingSummary(BaseModel):
    check_id: str
    check_title: str
    check_title_ko: Optional[str] = None
    service_name: str
    severity: str
    status: str  # PASS, FAIL, ERROR
    resource_id: Optional[str] = None
    resource_arn: Optional[str] = None
    region: Optional[str] = None
    description: Optional[str] = None
    description_ko: Optional[str] = None
    remediation: Optional[str] = None
    remediation_ko: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None
    account_id: Optional[str] = None
    namespace: Optional[str] = None
    cluster: Optional[str] = None


class ScanResult(BaseModel):
    scan_id: str
    status: ScanStatus
    provider: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    total: int = 0
    passed: int = 0
    failed: int = 0
    error_count: int = 0
    findings: List[FindingSummary] = []
    services_summary: Dict[str, Dict[str, int]] = {}
    severity_summary: Dict[str, int] = {}
    compliance: Optional[str] = None
    account_ids: List[str] = []
    regions: List[str] = []
    json_path: Optional[str] = Field(default=None, exclude=True)  # API 응답에서 제외


class DashboardStats(BaseModel):
    last_scan_id: Optional[str] = None
    last_scan_at: Optional[datetime] = None
    total_checks: int = 0
    passed: int = 0
    failed: int = 0
    error_count: int = 0
    severity_breakdown: Dict[str, int] = {}
    service_breakdown: Dict[str, int] = {}
    top_failed_checks: List[FindingSummary] = []
