import anthropic
from typing import List, Dict, Optional
import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Anthropic 클라이언트 (지연 초기화)
_client: Optional[anthropic.Anthropic] = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not settings.translation_enabled:
            raise ValueError("ANTHROPIC_API_KEY가 설정되지 않아 번역을 사용할 수 없습니다.")
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


TRANSLATION_SYSTEM_PROMPT = """당신은 클라우드 보안 전문가입니다.
AWS/Azure/GCP 보안 점검 결과를 한국어로 번역해주세요.
전문 용어는 적절히 한국어로 번역하되, 기술적 정확성을 유지해주세요.
응답은 반드시 JSON 형식으로만 반환하세요."""


async def translate_findings_batch(findings_data: List[Dict]) -> List[Dict]:
    """
    Prowler 점검 항목을 배치로 한국어 번역합니다.
    ANTHROPIC_API_KEY가 없으면 원문(영문) 그대로 반환합니다.
    프롬프트 캐싱을 활용하여 비용을 절감합니다.
    """
    if not findings_data:
        return []

    # API 키 없으면 번역 없이 원문 반환
    if not settings.translation_enabled:
        logger.info("ANTHROPIC_API_KEY 미설정 — 번역 건너뜀, 영문 결과 반환")
        return findings_data

    # 번역할 항목 추출 (중복 제거)
    unique_checks: Dict[str, Dict] = {}
    for finding in findings_data:
        check_id = finding.get("check_id", "")
        if check_id and check_id not in unique_checks:
            unique_checks[check_id] = {
                "check_id": check_id,
                "check_title": finding.get("check_title", ""),
                "description": finding.get("description", ""),
                "remediation": finding.get("remediation", ""),
            }

    if not unique_checks:
        return findings_data

    # 번역 요청 (배치로 처리)
    checks_list = list(unique_checks.values())
    translations = await _translate_checks(checks_list)

    # 번역 결과를 findings에 적용
    translated_findings = []
    for finding in findings_data:
        check_id = finding.get("check_id", "")
        trans = translations.get(check_id, {})
        translated_finding = finding.copy()
        translated_finding["check_title_ko"] = trans.get("check_title_ko", finding.get("check_title", ""))
        translated_finding["description_ko"] = trans.get("description_ko", finding.get("description", ""))
        translated_finding["remediation_ko"] = trans.get("remediation_ko", finding.get("remediation", ""))
        translated_findings.append(translated_finding)

    return translated_findings


async def _translate_checks(checks: List[Dict]) -> Dict[str, Dict]:
    """
    Claude API를 사용하여 보안 점검 항목을 한국어로 번역합니다.
    프롬프트 캐싱으로 반복 요청 비용 절감.
    """
    client = get_client()

    # 배치 크기 (한 번에 처리할 항목 수)
    batch_size = 20
    all_translations: Dict[str, Dict] = {}

    for i in range(0, len(checks), batch_size):
        batch = checks[i:i + batch_size]
        batch_json = json.dumps(batch, ensure_ascii=False, indent=2)

        prompt = f"""다음 보안 점검 항목들을 한국어로 번역해주세요.

번역할 항목:
{batch_json}

각 항목에 대해 다음 JSON 형식으로 반환하세요:
{{
  "translations": [
    {{
      "check_id": "원본 check_id",
      "check_title_ko": "한국어 제목",
      "description_ko": "한국어 설명",
      "remediation_ko": "한국어 조치방법"
    }}
  ]
}}

번역 시 주의사항:
- 기술 용어(IAM, S3, MFA 등)는 원문 그대로 유지
- 조치방법은 실용적이고 구체적으로 번역
- JSON 외의 다른 텍스트는 포함하지 말 것"""

        try:
            response = client.messages.create(
                model=settings.claude_model,
                max_tokens=4096,
                system=[
                    {
                        "type": "text",
                        "text": TRANSLATION_SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},  # 시스템 프롬프트 캐싱
                    }
                ],
                messages=[{"role": "user", "content": prompt}],
            )

            text = response.content[0].text
            # JSON 파싱
            data = json.loads(text)
            for item in data.get("translations", []):
                check_id = item.get("check_id", "")
                if check_id:
                    all_translations[check_id] = item

            logger.info(
                f"번역 완료: {len(batch)}개 항목, "
                f"캐시 히트={response.usage.cache_read_input_tokens}, "
                f"캐시 생성={response.usage.cache_creation_input_tokens}"
            )

        except (json.JSONDecodeError, KeyError, IndexError) as e:
            logger.error(f"번역 응답 파싱 오류: {e}")
        except anthropic.APIError as e:
            logger.error(f"Claude API 오류: {e}")

    return all_translations


async def translate_single(text: str, context: str = "보안 점검") -> str:
    """단일 텍스트 번역 (간단한 항목용)"""
    if not text:
        return text

    client = get_client()
    try:
        response = client.messages.create(
            model=settings.claude_model,
            max_tokens=512,
            messages=[
                {
                    "role": "user",
                    "content": f"다음 {context} 관련 텍스트를 한국어로 번역하세요. 번역문만 반환하세요:\n\n{text}",
                }
            ],
        )
        return response.content[0].text.strip()
    except Exception as e:
        logger.error(f"단일 번역 오류: {e}")
        return text
