import json
import logging
from pathlib import Path
from typing import Optional

import aiosqlite

from app.core.config import settings

logger = logging.getLogger(__name__)

_DDL = """
CREATE TABLE IF NOT EXISTS scans (
    scan_id         TEXT PRIMARY KEY,
    status          TEXT NOT NULL,
    provider        TEXT NOT NULL,
    started_at      TEXT,
    completed_at    TEXT,
    error_message   TEXT,
    total           INTEGER DEFAULT 0,
    passed          INTEGER DEFAULT 0,
    failed          INTEGER DEFAULT 0,
    error_count     INTEGER DEFAULT 0,
    compliance      TEXT,
    regions         TEXT DEFAULT '[]',
    account_ids     TEXT DEFAULT '[]',
    severity_summary  TEXT DEFAULT '{}',
    services_summary  TEXT DEFAULT '{}',
    json_path       TEXT
)
"""


async def init_db() -> None:
    Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(_DDL)
        await db.commit()
    logger.info(f"DB 초기화 완료: {settings.db_path}")


async def upsert_scan(scan_dict: dict) -> None:
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(
            """
            INSERT INTO scans (
                scan_id, status, provider, started_at, completed_at,
                error_message, total, passed, failed, error_count,
                compliance, regions, account_ids,
                severity_summary, services_summary, json_path
            ) VALUES (
                :scan_id, :status, :provider, :started_at, :completed_at,
                :error_message, :total, :passed, :failed, :error_count,
                :compliance, :regions, :account_ids,
                :severity_summary, :services_summary, :json_path
            )
            ON CONFLICT(scan_id) DO UPDATE SET
                status           = excluded.status,
                completed_at     = excluded.completed_at,
                error_message    = excluded.error_message,
                total            = excluded.total,
                passed           = excluded.passed,
                failed           = excluded.failed,
                error_count      = excluded.error_count,
                compliance       = excluded.compliance,
                regions          = excluded.regions,
                account_ids      = excluded.account_ids,
                severity_summary = excluded.severity_summary,
                services_summary = excluded.services_summary,
                json_path        = excluded.json_path
            """,
            {
                "scan_id":          scan_dict["scan_id"],
                "status":           scan_dict["status"],
                "provider":         scan_dict["provider"],
                "started_at":       scan_dict.get("started_at"),
                "completed_at":     scan_dict.get("completed_at"),
                "error_message":    scan_dict.get("error_message"),
                "total":            scan_dict.get("total", 0),
                "passed":           scan_dict.get("passed", 0),
                "failed":           scan_dict.get("failed", 0),
                "error_count":      scan_dict.get("error_count", 0),
                "compliance":       json.dumps(scan_dict.get("compliance"), ensure_ascii=False) if scan_dict.get("compliance") is not None else None,
                "regions":          json.dumps(scan_dict.get("regions", []), ensure_ascii=False),
                "account_ids":      json.dumps(scan_dict.get("account_ids", []), ensure_ascii=False),
                "severity_summary": json.dumps(scan_dict.get("severity_summary", {}), ensure_ascii=False),
                "services_summary": json.dumps(scan_dict.get("services_summary", {}), ensure_ascii=False),
                "json_path":        scan_dict.get("json_path"),
            },
        )
        await db.commit()


async def load_all_scans() -> list[dict]:
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM scans ORDER BY started_at DESC") as cursor:
            rows = await cursor.fetchall()

    result = []
    for row in rows:
        item = dict(row)
        item["regions"]          = json.loads(item["regions"] or "[]")
        item["account_ids"]      = json.loads(item["account_ids"] or "[]")
        item["severity_summary"] = json.loads(item["severity_summary"] or "{}")
        item["services_summary"] = json.loads(item["services_summary"] or "{}")
        # compliance: 구버전(문자열) / 신버전(JSON 배열) 모두 처리
        raw_compliance = item.get("compliance")
        if raw_compliance:
            try:
                parsed = json.loads(raw_compliance)
                item["compliance"] = parsed if isinstance(parsed, list) else [parsed]
            except (json.JSONDecodeError, TypeError):
                item["compliance"] = [raw_compliance]
        else:
            item["compliance"] = None
        result.append(item)

    return result


def save_findings_json(scan_id: str, findings: list[dict], started_at: str = "") -> Optional[str]:
    try:
        # 폴더명: {YYYYMMDD_HHMMSS}_{scan_id[:8]}  → ls 정렬 시 시간 순
        ts = started_at.replace(":", "").replace("-", "").replace("T", "_").split(".")[0] if started_at else "00000000_000000"
        dir_name = f"{ts}_{scan_id[:8]}"
        path = Path(settings.results_dir) / dir_name
        path.mkdir(parents=True, exist_ok=True)
        json_file = path / "findings.json"
        json_file.write_text(
            json.dumps(findings, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return str(json_file)
    except OSError as e:
        logger.error(f"findings JSON 저장 실패 ({scan_id}): {e}")
        return None


def load_findings_json(json_path: str) -> list[dict]:
    try:
        return json.loads(Path(json_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        logger.error(f"findings JSON 로드 실패 ({json_path}): {e}")
        return []
