# 변경 이력 (CHANGELOG)

> 최신 순으로 정렬

---

## [2026-05-01] 멀티 클라우드·다중 컴플라이언스·점검항목 조회 기능 추가

### 개요
사용자 요청 6개 항목 중 4개(1·4·5·6번)를 구현. 나머지 2개(2·3번)는 보류.

---

### 1. 컴플라이언스 다중선택 지원

**변경 파일**
- `backend/app/models/scan.py` — `ScanRequest.compliance`, `ScanResult.compliance` 타입 `Optional[str]` → `Optional[List[str]]`
- `backend/app/services/prowler.py` — `_build_prowler_command`: `--compliance` 옵션을 리스트로 확장
- `backend/app/db.py` — compliance 컬럼을 JSON 배열로 직렬화/역직렬화, 기존 단일 문자열 데이터 하위호환 처리
- `frontend/src/api/client.ts` — `ScanRequest.compliance`, `ScanResult.compliance` 타입 `string` → `string[]`
- `frontend/src/pages/ScanPage.tsx` — 심각도 필터와 동일한 toggle 뱃지 방식으로 다중선택 UI 구현

**동작**
- 뱃지 클릭으로 추가/해제, X 버튼으로 개별 해제, "전체 해제" 버튼 제공
- Prowler CLI는 `--compliance cis_2.0_aws kisa_isms_p_2023_aws` 형태로 다중 값 전달

---

### 2. 멀티 클라우드 원격 점검 지원

지원 제공자: **AWS, Azure, GCP, OCI (Oracle Cloud), Kubernetes, M365, GitHub**

**변경 파일**
- `backend/app/core/config.py` — 7개 provider 자격증명 환경변수 추가 및 `available_providers` 프로퍼티 구현
- `backend/app/services/prowler.py` — `_build_env()`: 모든 provider 자격증명을 환경변수로 주입
- `backend/app/api/scan.py` — `/api/config` 응답에 `available_providers` 포함, `/api/services` · `/api/compliances`를 provider별로 분리
- `frontend/src/pages/ScanPage.tsx` — provider 선택 버튼 UI, 미설정 provider 🔒 표시, AWS·OCI 리전 선택 분리

**자격증명 환경변수 목록 (`.env`)**

| Provider | 필수 환경변수 |
|----------|-------------|
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (IAM Role 사용 시 불필요) |
| Azure | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` |
| GCP | `GOOGLE_APPLICATION_CREDENTIALS` 또는 `GOOGLE_CLOUD_PROJECT` |
| OCI | `OCI_CLI_USER`, `OCI_CLI_TENANCY`, `OCI_CLI_FINGERPRINT`, `OCI_CLI_KEY_FILE` |
| Kubernetes | `KUBECONFIG` |
| M365 | `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `M365_TENANT_ID` |
| GitHub | `GITHUB_TOKEN` |

---

### 3. 대시보드 → 스캔 이력 연결

**변경 파일**
- `frontend/src/pages/Dashboard.tsx` — 대시보드 하단에 "최근 스캔 이력" 섹션 추가 (최근 5건 요약), "전체 이력 보기 →" 버튼 클릭 시 ScanHistory 페이지로 이동
- `frontend/src/App.tsx` — `Dashboard`에 `onNavigate` prop 전달
- `frontend/src/pages/ScanHistory.tsx` — "서버 재시작 시 초기화됩니다" → "SQLite에 영구 저장됩니다" 문구 수정

**동작**
- 대시보드에서 최근 스캔 5건의 상태·provider·컴플라이언스·통과율·실패 수 확인 가능
- "전체 이력 보기" 클릭 → 스캔 이력 탭으로 이동

---

### 4. 점검 항목 조회 페이지 신규 추가

**변경 파일**
- `frontend/src/pages/CheckList.tsx` — 신규 생성
- `frontend/src/App.tsx` — 네비게이션에 "점검 항목" 탭 추가 (`ListChecks` 아이콘)
- `backend/app/api/scan.py` — `/api/checks` 엔드포인트: `provider`, `compliance`, `service` 쿼리 파라미터 지원
- `frontend/src/api/client.ts` — `getChecks(provider, compliance?, service?)` 함수 추가

**동작**
1. provider 선택 (AWS / Azure / GCP / OCI / Kubernetes / M365 / GitHub)
2. 컴플라이언스 프레임워크 또는 서비스 중 하나로 필터 (동시 선택 불가 — Prowler 제약)
3. "점검 항목 조회" 버튼 클릭 → Prowler CLI `--list-checks` 실행 결과 표시
4. 텍스트 검색으로 목록 내 항목 필터링 가능

---

### 보류 항목

| # | 내용 | 보류 이유 |
|---|------|----------|
| 2 | 컴플라이언스 + 서비스 동시 선택 | Prowler CLI 제약 (`--compliance`와 `--service` 동시 사용 불가). 후처리 필터링 방식은 비효율적이어서 추후 검토 |
| 3 | 회사 로고 적용 | 로고 이미지 파일 수령 후 적용 예정 (`frontend/src/App.tsx` 헤더의 `<Shield>` 아이콘 교체) |

---

## [2026-04-30] 리전 selectbox 전환 및 컴플라이언스 연동 개선

- 리전 입력 → selectbox로 변경, 기본값 `ap-northeast-2` (서울)
- 전체 리전 옵션 추가
- 컴플라이언스 선택 시 서비스 선택 UI 비활성화
- `fix`: compliance 선택 시 service 필터 제거 (Prowler 제약)
- `fix`: 잘못된 prowler 옵션 제거 및 메모리 최적화

---

## [2026-04-29] SQLite 영구 저장 및 스캔 이력 탭

- SQLite DB 도입으로 서버 재시작 후에도 스캔 이력 유지
- 스캔 이력 탭 신규 추가 (접기/펼치기, 상세 findings 조회)

---

## [2026-04-28] 컴플라이언스·계정·리전 필터 추가

- 대시보드에 계정 및 리전 필터 드롭다운 추가
- 컴플라이언스 프레임워크 선택 기능 추가

---

## [2026-04-27] 초기 구현

- Prowler v4 OCSF 파서 구현
- 번역 기능 옵션화 (ANTHROPIC_API_KEY 없으면 영문 표시)
- FastAPI 백엔드 + React 프론트엔드 초기 구조
- Docker Compose 배포 구성
