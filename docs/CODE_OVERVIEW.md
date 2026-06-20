# 🧭 코드 개요 (Code Overview)

이 문서는 **문서 액션 에이전트(Document Action Agent)**의 전체 아키텍처와
각 모듈의 역할을 설명합니다. 코드를 처음 읽는 사람이 "무엇이 어디에 있고, 데이터가
어떻게 흐르는지"를 빠르게 이해하도록 돕는 것이 목표입니다.

---

## 1. 전체 아키텍처

### 1.1 한눈에 보기

```
┌─────────────────────────────────────────────────────────────────────┐
│                          브라우저 (React + Vite)                       │
│   web/src/App.tsx  ─ 업로드 / 결과 / 대시보드 UI                        │
│   web/src/api.ts   ─ fetch 래퍼 (/api/* 호출)                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │  HTTP (multipart / JSON)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Express API 서버 (server/src/index.ts)          │
│   POST /api/process   문서 처리 (핵심 엔드포인트)                       │
│   GET  /api/expenses  지출 목록                                        │
│   GET  /api/reminders 리마인드 목록                                    │
│   GET  /api/summary   월별 카테고리 요약                               │
└───────┬───────────────┬───────────────┬───────────────┬─────────────┘
        │               │               │               │
        ▼               ▼               ▼               ▼
   storage/blob   ocr/extract    copilot/agent     store/store
   (원본 보관)     (OCR 추출)    (에이전트 두뇌)    (데이터 저장)
        │               │               │               │
        ▼               ▼               ▼               ▼
  Azure Blob   Azure Document   Copilot SDK +    Cosmos DB ↔ 로컬 JSON
  Storage      Intelligence     custom tools
```

### 1.2 핵심 설계 원칙: "두뇌 + 도구" 분리

이 앱의 핵심은 **GitHub Copilot SDK 에이전트**입니다.

- **에이전트(LLM) = 두뇌**: 문서를 읽고, 종류를 분류하고, 어떤 도구를 어떤
  순서로 호출할지 **스스로 판단**합니다.
- **custom tools = 손발**: 실제 부수효과(지출 저장, 예산 분석, 리마인드 등록,
  초안 작성)를 수행합니다.

사용자는 "이 문서를 처리해줘"라고만 합니다. 분기·순서는 코드에 하드코딩되어 있지
않고 에이전트가 런타임에 결정합니다.

```
영수증  → save_expense → analyze_budget
청구서  → set_reminder (+ 필요시 save_draft_message)
계약서  → 요약/리스크 분석 + (갱신일 있으면) set_reminder
```

### 1.3 "교체 지점(seam)" 패턴 — 로컬 ↔ Azure 자동 전환

OCR · 저장소 · 파일 보관 모듈은 모두 **동일한 인터페이스 뒤에 두 가지 구현**을
숨깁니다. 환경변수 유무에 따라 시작 시 자동으로 백엔드가 결정됩니다.

| 기능 | 환경변수 없음 (로컬) | 환경변수 있음 (Azure) |
| --- | --- | --- |
| 저장소 | 로컬 JSON 파일 | Azure Cosmos DB |
| OCR | 건너뜀(모델이 이미지 직접 읽음) | Azure Document Intelligence |
| 파일 보관 | 건너뜀 | Azure Blob Storage |
| 인증 | `.env` 키 | Managed Identity (`DefaultAzureCredential`) |

덕분에 비밀키 없이도 로컬에서 전체 흐름을 돌려볼 수 있고, 배포 시에는 코드 변경
없이 Azure 구현으로 전환됩니다.

### 1.4 `/api/process` 요청 흐름 (가장 중요한 경로)

```
1. 클라이언트가 텍스트 또는 파일(이미지/PDF)을 업로드
2. (파일인 경우) storage/blob.uploadDocument  → 원본을 Blob에 보관, URL 확보
3. (파일인 경우) ocr/extract.extractDocument   → Document Intelligence로 텍스트 추출
4. 추출 텍스트가 없으면 → 임시 파일로 저장 후 모델에 첨부(모델이 직접 읽음)
5. copilot/agent.processDocument 호출
      → 세션 생성(systemPrompt + custom tools)
      → 에이전트가 분류 + 도구 호출(부수효과 발생)
      → 한국어 요약 + 단계별 trace 반환
6. 결과(JSON)를 클라이언트에 응답, 임시 파일 정리
```

### 1.5 배포 토폴로지

```
단일 Docker 컨테이너 (Dockerfile)
  ├─ Express API
  └─ 빌드된 React 정적 파일 (STATIC_DIR로 서빙)
        ▼
Azure Container Apps  ← infra/ Bicep으로 프로비저닝
  + Container Registry (이미지)
  + Cosmos DB / Blob / Document Intelligence
  + User-Assigned Managed Identity (키 없는 데이터 접근)
```

---

## 2. 모듈별 설명

### 2.1 서버 (`server/`)

#### `src/index.ts` — Express 진입점 / API 라우팅
앱의 HTTP 표면. 4개의 엔드포인트를 노출합니다.

- `POST /api/process` — **핵심 엔드포인트**. `multer`로 파일을 메모리에 받고
  (최대 10MB), Blob 업로드 → OCR → 에이전트 처리 순서를 조율합니다.
  텍스트와 파일 중 하나는 반드시 있어야 합니다.
- `GET /api/expenses` / `GET /api/reminders` — 데모 사용자의 저장 데이터 조회.
- `GET /api/summary` — 지출을 카테고리별로 합산하여 대시보드용 요약 생성.
- `STATIC_DIR` 환경변수가 있으면 빌드된 React 앱을 같은 서버에서 서빙(프로덕션 단일 컨테이너).
- `SIGINT`/`SIGTERM` 시 Copilot 클라이언트를 정리하는 graceful shutdown 포함.
- MVP라 인증은 단일 데모 사용자(`DEMO_USER`)로 단순화되어 있습니다.

#### `src/types.ts` — 공유 도메인 타입
서버 전반에서 쓰는 타입 정의.

- `DocumentType` — `receipt | bill | contract | other`
- `ExpenseRecord` — 지출 기록(영수증). `merchant`, `date`, `total`, `category`, `items` 등.
- `Reminder` — 마감 리마인드(청구서). `dueDate`, `amount`, `status` 등.
- `ProcessResult` — 클라이언트에 돌려주는 결과(문서 종류, 요약, 지출/리마인드/초안, 단계 trace).

#### `src/copilot/agent.ts` — 에이전트의 "두뇌"
**앱의 심장.** Copilot SDK 세션을 만들고 시스템 프롬프트와 custom tools를 주입합니다.

- `SYSTEM_PROMPT` — 에이전트의 행동 규칙(문서 종류별로 어떤 도구를 호출할지,
  한국어 요약을 마지막에 낼 것 등)을 정의.
- `resolveCopilotCliPath()` — 설치된 플랫폼별 Copilot CLI 런타임 경로를 찾아
  `COPILOT_CLI_PATH`로 설정(SDK 자동 탐색의 한계를 보완).
- `getClient()` — `CopilotClient`를 한 번만 생성/시작하고 캐시(promise 캐싱).
- `processDocument()` — 세션 생성 → 프롬프트(+첨부) 전송 → 응답 대기(120초) →
  에이전트가 만든 부수효과(`collector`)로 문서 종류를 추론 → `ProcessResult` 빌드.
- `shutdown()` — 서버 종료 시 클라이언트 정리.

> 참고: Copilot SDK 통합 시 주의점은 [/memories/repo/copilot-sdk-notes.md](../.agents 외부 메모) 에 별도 기록되어 있습니다.

#### `src/copilot/tools.ts` — custom tools (에이전트의 "손발")
에이전트가 호출할 수 있는 도구 4종을 정의(`defineTool`). 각 도구는 JSON Schema로
파라미터를 선언하고, 핸들러에서 실제 저장/분석을 수행합니다.

- `save_expense` — 영수증을 `ExpenseRecord`로 저장.
- `analyze_budget` — 해당 카테고리의 월 누적 지출을 한도(기본 월예산의 30%)와
  비교해 경고/초과 여부 반환.
- `set_reminder` — 청구서/계약 갱신일을 `Reminder`로 등록.
- `save_draft_message` — 해지 안내문 등 초안 텍스트 저장.
- `ToolCollector` — 도구 실행 결과와 사람이 읽을 수 있는 단계 trace(`steps`)를
  누적하는 객체. API가 이를 모아 UI에 함께 반환.
- `buildResult()` — `collector`를 최종 `ProcessResult`로 조립.

#### `src/store/` — 저장소 추상화
- `store.ts` — **파사드**. `StoreBackend` 인터페이스를 정의하고, `AZURE_COSMOS_ENDPOINT`
  유무로 Cosmos ↔ 로컬 백엔드를 선택. 외부에는 `saveExpense`, `listExpenses`,
  `monthToDateByCategory` 등 동일한 함수만 노출(호출부는 백엔드를 몰라도 됨).
- `cosmos.ts` — **Azure Cosmos DB 구현(프로덕션)**. `/userId` 파티션 키, 키 또는
  Managed Identity 인증, 컨테이너 자동 생성(`createIfNotExists`), SQL 쿼리로 조회/집계.
- `local.ts` — **로컬 JSON 파일 구현(MVP/오프라인)**. `data/expenses.json`,
  `data/reminders.json`을 읽고 씀. Cosmos와 동일한 인터페이스 구현.

#### `src/ocr/extract.ts` — OCR 추상화
- `isDocumentIntelligenceConfigured()` — 엔드포인트 환경변수 유무로 활성 판단.
- `extractDocument()` — 설정 시 Azure Document Intelligence(`prebuilt-receipt`)로
  텍스트 추출, 미설정 시 빈 결과 반환(→ 모델이 이미지를 직접 읽는 경로로 fallback).

#### `src/storage/blob.ts` — 원본 파일 보관
- `isBlobConfigured()` — 연결 문자열 또는 스토리지 계정명 유무로 판단.
- `uploadDocument()` — 업로드된 원본을 Blob에 저장하고 URL 반환. 미설정/실패 시
  `undefined`(흐름은 계속 진행). 연결 문자열(키) 또는 Managed Identity 인증 지원.

### 2.2 웹 프론트엔드 (`web/`)

#### `src/App.tsx` — 메인 UI
- 텍스트 붙여넣기 / 파일 업로드 → `processDocument()` 호출.
- 결과(문서 종류 배지, 요약, 지출/리마인드 카드, 초안)를 렌더.
- 하단 대시보드: 월별 카테고리 요약 + 마감 임박 리마인드(D-day 계산).
- `SAMPLE_RECEIPT/BILL/CONTRACT` 샘플로 즉시 체험 가능.

#### `src/api.ts` — API 클라이언트
- 서버 응답 타입(`ProcessResult`, `Summary`, `Reminder` 등) 정의.
- `processDocument`, `getSummary`, `getReminders` 등 `fetch` 래퍼 제공.

#### `vite.config.ts` — 개발 서버 설정
- 포트 5173, `/api` 요청을 `http://localhost:3001`(Express)로 프록시.

### 2.3 인프라 / 배포

- `Dockerfile` — API + 빌드된 React 정적 파일을 담는 단일 컨테이너 이미지.
- `infra/main.bicep`, `resources.bicep` — Container Apps, Cosmos DB, Blob,
  Document Intelligence, Managed Identity를 프로비저닝.
- `azure.yaml` — `azd up` 한 명령으로 빌드→프로비저닝→배포.

---

## 3. 주요 파일 빠른 참조

| 알고 싶은 것 | 파일 |
| --- | --- |
| API 엔드포인트 | [server/src/index.ts](../server/src/index.ts) |
| 에이전트 동작/프롬프트 | [server/src/copilot/agent.ts](../server/src/copilot/agent.ts) |
| 에이전트가 쓰는 도구 | [server/src/copilot/tools.ts](../server/src/copilot/tools.ts) |
| 저장소 전환 로직 | [server/src/store/store.ts](../server/src/store/store.ts) |
| Cosmos / 로컬 구현 | [server/src/store/cosmos.ts](../server/src/store/cosmos.ts) · [server/src/store/local.ts](../server/src/store/local.ts) |
| OCR | [server/src/ocr/extract.ts](../server/src/ocr/extract.ts) |
| 파일 보관 | [server/src/storage/blob.ts](../server/src/storage/blob.ts) |
| 공유 타입 | [server/src/types.ts](../server/src/types.ts) |
| 프론트엔드 UI | [web/src/App.tsx](../web/src/App.tsx) |
| 프론트엔드 API 호출 | [web/src/api.ts](../web/src/api.ts) |
