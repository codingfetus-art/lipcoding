# Current Code Overview

## 요약

이 저장소는 두 개의 생산성 흐름을 하나의 웹앱 안에 통합한다.

1. **RoutineFit AI Scheduler**: 고정 일정, 해야 할 일, 마감일, 과거 패턴, 이전 플랜 기록을 바탕으로 하루 단위 계획을 생성하고 검증한다.
2. **문서 액션 화면(origin/dlsdyd)**: 영수증, 청구서, 계약서를 입력받아 지출 기록, 리마인드, 계약 확인 초안을 만든다.

기존 RoutineFit 화면은 유지하고, origin/dlsdyd의 문서 처리 기능은 별도 `문서 액션` 탭으로 추가했다.

## 주요 실행 구조

```text
client/
  src/
    main.jsx                 # RoutineFit 앱의 메인 화면, 탭, 상태 저장, 캘린더 연동
    DlsdydDocumentAgent.jsx  # origin/dlsdyd 기반 문서 액션 화면
    demoData.js              # 데모 일정, 할 일, 과거 패턴, 이전 플랜 기록
    api.js                   # RoutineFit 플랜/리뷰 API 호출
    style.css                # 전체 UI와 문서 액션 화면 스타일

server/
  index.js                   # Express API, 정적 파일 서빙, Copilot 프롬프트 구성
  src/
    scheduler.js             # 일정 검증, 비가용 시간 계산, 하루 플랜 생성
    copilotAgent.js          # GitHub Copilot SDK 호출
    documentAction.js        # 문서 액션 처리, 선택적 Azure OCR/Blob/Cosmos 연동
    config.js                # 스케줄러와 Copilot 런타임 설정
  test/
    scheduler.test.js        # 스케줄러 단위 테스트
```

## RoutineFit 화면

RoutineFit은 `client/src/main.jsx`에서 상태를 관리한다. 주요 상태는 다음과 같다.

- `fixedEvents`: 회의, 수업, 약속 같은 고정 일정
- `tasks`: 해야 할 일, 우선순위, 마감일, 예상 소요 시간
- `historyRecords`: 식사와 루틴 중심의 과거 패턴
- `planHistory`: 이전에 생성된 플랜의 진행률과 남은 시간
- `schedule`: 서버가 생성한 하루 플랜과 검증 결과
- `planProgress`: 현재 선택 날짜의 플랜 진행률

화면은 `일정 홈`, `플랜 설정`, `결과·리뷰`, `문서 액션` 탭으로 나뉜다. 모바일 사용자가 먼저 보는 홈은 월별 일정과 선택 날짜의 하루 타임라인을 중심으로 구성한다. 모든 탭은 같은 페이지 헤딩, 요약 카드, 둥근 카드, 파란 계열 액션 버튼을 사용해 서로 다른 기능이 하나의 앱처럼 보이도록 맞춘다.

## 스케줄 생성 흐름

1. 사용자가 고정 일정, 할 일, 과거 패턴, 이전 플랜 기록을 입력하거나 데모 데이터로 시작한다.
2. 클라이언트가 `/api/schedule/generate`로 데이터를 보낸다.
3. 서버의 `validateSchedulePayload()`가 입력을 정규화한다.
4. `generateSchedule()`이 다음을 계산한다.
   - 고정 일정 기반 비가용 시간
   - 식사와 루틴 과거 패턴
   - 이전 플랜 기록 기반 남은 작업 시간
   - 선택 날짜의 하루 플랜
   - 겹침, 마감 미충족, 미배치 작업 검증
5. 서버가 GitHub Copilot SDK에 구조화된 컨텍스트를 전달해 설명용 Markdown 요약을 요청한다.
6. Copilot SDK 호출 실패 시에도 로컬 deterministic 플랜과 `aiError`를 반환한다.

## 과거 패턴과 이전 플랜 기록 분리

데이터 의미가 섞이지 않도록 다음처럼 분리한다.

- **과거 패턴 (`historyRecords`)**: 점심식사, 저녁식사, 아침 준비, 잠들기 전 휴식처럼 보통 비워두는 시간대 계산에 사용한다.
- **이전 플랜 기록 (`planHistory`)**: 생성된 플랜의 진행률, 남은 시간, 미완료 상태를 저장하고 다음 플랜의 작업 시간 조정에 사용한다.

예를 들어 120분짜리 작업을 이전 플랜에서 50% 진행했다면, 다음 플랜에서는 남은 60분만 다시 배치한다.

## 타임라인 표시 규칙

타임라인에 들어가는 이름은 짧고 정확하게 표시한다.

- `점심식사`
- `저녁식사`
- `아침 준비`
- `운동`

상세 근거는 별도로 `점심식사는 보통 11:50에서 13:50 사이`처럼 표시한다. 사용자는 화면에서 바로 시간대 의미를 파악할 수 있고, 검증이나 설명에서는 추정 근거를 확인할 수 있다.

## 문서 액션 화면(origin/dlsdyd)

`client/src/DlsdydDocumentAgent.jsx`는 origin/dlsdyd 브랜치의 문서 처리 UI를 현재 앱에 별도 화면으로 이식한 컴포넌트다.
현재 RoutineFit UI와 어우러지도록 독립적인 랜딩 화면 느낌을 줄이고, 기존 `page-heading`, `summary-card`, `doc-card` 기반의 카드형 레이아웃으로 정리했다.

지원 흐름:

1. 영수증, 청구서, 계약서 텍스트를 입력하거나 파일을 선택한다.
2. `/api/process`가 문서 유형을 분류한다.
3. 영수증이면 지출 기록을 저장하고 월간 요약에 반영한다.
4. 청구서면 납부기한 리마인드를 만든다.
5. 계약서면 계약 만기 리마인드와 확인 요청 초안을 만든다.
6. 납부기한 또는 계약 만기 리마인드는 `마감: ...` 고정 일정으로 RoutineFit 캘린더에 추가된다.
7. 청구서 납부기한처럼 마감일이 생성되면 캘린더 기준 날짜를 해당 마감일로 이동해 월간 일정과 하루 시간표에서 바로 보이게 한다.
8. 같은 영수증, 청구서, 계약서를 다시 처리하면 안정적인 중복 키로 기존 지출 또는 리마인드를 재사용하고 새 레코드를 만들지 않는다.

## Azure 사용 안전장치

문서 액션의 저장소는 Azure Cosmos DB를 사용한다. `AZURE_COSMOS_ENDPOINT`가 설정된 경우에만 Cosmos SDK를 호출하며, 미설정 상태에서는 로컬 JSON으로 대체하지 않고 설정 오류를 반환한다. `AZURE_COSMOS_KEY`가 없으면 `DefaultAzureCredential`을 사용하므로 로컬에서는 Azure CLI 로그인, Azure 배포에서는 Managed Identity로 인증할 수 있다.

```text
DOCUMENT_ACTION_AZURE_ENABLED=true
```

켜졌을 때 선택적으로 사용하는 Azure 기능:

- Azure AI Document Intelligence: 이미지/PDF OCR
- Azure Blob Storage: 원본 문서 저장
- Azure Cosmos DB: 지출 기록과 리마인드 영구 저장. `AZURE_COSMOS_ENDPOINT`가 설정되면 `origin/dlsdyd`의 `/userId` 파티션 저장 패턴처럼 `expenses`, `reminders` 컨테이너를 만들고 Cosmos DB에서 저장/조회한다.

Azure를 켜기 전에는 Azure Cost Management 예산과 알림, 무료 크레딧/지출 제한을 먼저 설정해야 한다. 필요한 환경변수 예시는 `server/.env.example`에 정리되어 있다. Azure App Service에서는 이 값들을 App Settings에 넣고 `/api/health`의 `documentAction.storageBackend`가 `cosmos`인지 확인한다. 루트 `README.md`는 배포 준비와 심사자가 확인하는 기준 문서로 유지한다.

## 서버 API

| API | 역할 |
| --- | --- |
| `GET /api/health` | 앱, Copilot SDK, 문서 액션 Azure 설정 상태 확인 |
| `POST /api/schedule/generate` | RoutineFit 하루 플랜 생성 |
| `POST /api/review/generate` | 진행률 기반 실행 리뷰 생성 |
| `POST /api/process` | 문서 액션 처리 |
| `GET /api/summary` | 문서 액션 지출 요약 |
| `GET /api/reminders` | 문서 액션 리마인드 목록 |

## 검증 명령

```powershell
Set-Location -Path 'D:\JI2NU\talking\server'
npm test

Set-Location -Path 'D:\JI2NU\talking\client'
npm run build
```

빌드 후 서버에서 최신 클라이언트 산출물을 제공하려면 다음처럼 복사한다.

```powershell
Set-Location -Path 'D:\JI2NU\talking'
Copy-Item -Path 'client\dist\*' -Destination 'server\public' -Recurse -Force
```

## 현재 주의사항

- `server/public/`은 빌드 산출물이다.
- `.playwright-mcp/`는 로컬 Playwright MCP 산출물이므로 `.gitignore`에서 제외한다.
- Azure 관련 키와 연결 문자열은 절대 커밋하지 않는다.
- 커밋/푸시는 변경 파일 범위를 확인한 뒤 수행한다.
