# Prowler 한국어 보안 대시보드

AWS 클라우드 보안 점검 도구 **Prowler**를 웹에서 실행하고, 결과를 **한국어**로 자동 번역하여 대시보드로 확인하는 서비스입니다.

---

## 주요 기능

- **웹에서 즉시 실행** — 브라우저에서 Prowler 스캔을 트리거하고 결과를 실시간으로 확인
- **한국어 자동 번역** — Claude Haiku API로 점검 항목·설명·조치방법을 한국어로 번역
- **특정 항목 선택 점검** — 서비스·심각도·체크 ID 단위로 원하는 항목만 점검 가능
- **대시보드** — 심각도별 파이차트, 서비스별 실패 현황 바차트, 주요 실패 항목 목록 한눈에 확인

---

## 아키텍처

```
[React 웹 UI]
     ↓ POST /api/scan (옵션 전달)
[FastAPI 백엔드]
     ↓ asyncio subprocess
[Prowler CLI]
     ↓ JSON 결과
[FastAPI 백엔드]
     ↓ Claude Haiku API (프롬프트 캐싱)
[한국어 번역 결과 → 웹 UI 표시]
```

---

## 프로젝트 구조

```
prowler/
├── backend/                        # FastAPI 서버 (Python)
│   ├── app/
│   │   ├── main.py                 # FastAPI 앱 진입점 + CORS
│   │   ├── core/
│   │   │   └── config.py           # 환경변수 설정 (pydantic-settings)
│   │   ├── models/
│   │   │   └── scan.py             # 데이터 모델 (Pydantic)
│   │   ├── api/
│   │   │   └── scan.py             # REST API 라우터 (5개 엔드포인트)
│   │   └── services/
│   │       ├── prowler.py          # Prowler subprocess 실행 + 결과 파싱
│   │       └── translation.py      # Claude Haiku 번역 레이어
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                       # React + Vite + TypeScript
│   ├── src/
│   │   ├── App.tsx                 # 헤더 + 네비게이션
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # 대시보드 (차트 + 실패 항목)
│   │   │   └── ScanPage.tsx        # 스캔 실행 UI + 결과 확인
│   │   └── api/
│   │       └── client.ts           # Axios API 클라이언트
│   ├── nginx.conf
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Python 3.12 · FastAPI · uvicorn · asyncio |
| 번역 | Claude Haiku 4.5 (Anthropic API) · 프롬프트 캐싱 |
| 보안 엔진 | Prowler (subprocess 실행) |
| 프론트엔드 | React 18 · TypeScript · Vite · Tailwind CSS |
| 차트 | Recharts (파이차트, 바차트) |
| 배포 | Docker · Docker Compose · nginx |

---

## 시작하기

### 1. 환경변수 설정

```bash
cp backend/.env.example backend/.env
```

`backend/.env` 파일을 열어 필수 항목을 입력합니다.

```env
# 필수: Anthropic API 키
ANTHROPIC_API_KEY=your-api-key-here

# Claude 모델 (기본값: claude-haiku-4-5 — 빠르고 저렴)
CLAUDE_MODEL=claude-haiku-4-5

# Prowler 결과 저장 경로
PROWLER_OUTPUT_DIR=/tmp/prowler_results

# AWS 기본 리전
AWS_DEFAULT_REGION=ap-northeast-2

# AWS 자격증명 (IAM Role 사용 시 아래 두 줄 불필요)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
```

### 2. Docker로 실행 (권장)

```bash
docker-compose up --build
```

| 서비스 | 접속 주소 |
|--------|----------|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000 |
| API 문서 | http://localhost:8000/docs |

### 3. 로컬 개발 환경

**백엔드**
```bash
cd backend
pip install -r requirements.txt
pip install prowler          # Prowler CLI 설치
uvicorn app.main:app --reload
```

**프론트엔드**
```bash
cd frontend
npm install
npm run dev                  # http://localhost:3000
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/scan` | Prowler 스캔 시작 → `scan_id` 반환 |
| `GET` | `/api/scan/{scan_id}` | 스캔 상태·결과 조회 |
| `GET` | `/api/scans` | 전체 스캔 목록 |
| `GET` | `/api/dashboard` | 대시보드 통계 (최근 완료 스캔 기준) |
| `GET` | `/api/services` | 지원 AWS 서비스 목록 |
| `GET` | `/health` | 헬스체크 |

### 스캔 요청 예시

```json
POST /api/scan
{
  "provider": "aws",
  "services": ["s3", "iam", "ec2"],
  "severity": ["critical", "high"],
  "region": "ap-northeast-2"
}
```

```json
// 응답
{
  "scan_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "스캔이 시작되었습니다."
}
```

---

## 화면 구성

### 대시보드

- **요약 카드** — 전체 / 통과 / 실패 / 오류 건수 한눈에 확인
- **심각도별 파이차트** — Critical · High · Medium · Low · Informational 분포
- **서비스별 실패 바차트** — 실패 건수가 많은 서비스 Top 8
- **주요 실패 항목** — 클릭 시 한국어 설명 및 조치방법 확인

### 스캔 실행

- **리전 입력** — AWS 리전 지정
- **심각도 필터** — 원하는 심각도만 선택 (미선택 시 전체)
- **서비스 선택** — 점검할 서비스만 선택 (미선택 시 전체)
- **실시간 상태** — 실행 중·완료·실패 상태를 3초마다 폴링하여 표시

---

## 한국어 번역 방식

`services/translation.py`에서 Claude Haiku API를 사용합니다.

- **배치 처리** — 최대 20개 항목을 한 번에 번역하여 API 호출 횟수 최소화
- **중복 제거** — 동일 `check_id`는 한 번만 번역
- **프롬프트 캐싱** — 시스템 프롬프트에 `cache_control: ephemeral` 적용으로 반복 요청 비용 최대 90% 절감
- **Fallback** — 번역 실패 시 원문 영어 표시

번역 항목:
- `check_title` → `check_title_ko` (점검 항목 제목)
- `description` → `description_ko` (설명)
- `remediation` → `remediation_ko` (조치방법)

---

## 비동기 처리 흐름

```
1. POST /api/scan 요청
      ↓
2. scan_id 즉시 반환 (PENDING 상태)
      ↓
3. 백그라운드에서 Prowler subprocess 실행 (RUNNING 상태)
      ↓
4. JSON 결과 파싱 → Claude Haiku 번역
      ↓
5. 결과 집계 후 메모리 저장 (COMPLETED 상태)
      ↓
6. 프론트엔드가 3초마다 GET /api/scan/{id} 폴링하여 결과 표시
```

---

## AWS 자격증명 설정

**방법 1: IAM Role (EC2·ECS·Lambda 배포 시 권장)**
- 별도 설정 불필요. 인스턴스에 적절한 IAM Role 부여

**방법 2: AWS CLI 프로파일 (로컬 개발)**
```bash
aws configure
# docker-compose.yml에서 ~/.aws 볼륨 마운트로 자동 인식
```

**방법 3: 환경변수**
```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

---

## 참고

- [Prowler 공식 문서](https://docs.prowler.com)
- [Anthropic Claude API](https://docs.anthropic.com)
- [Prowler GitHub](https://github.com/prowler-cloud/prowler)
