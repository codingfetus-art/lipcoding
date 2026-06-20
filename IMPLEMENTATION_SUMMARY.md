# Implementation Summary

## 요약

현재 앱은 **RoutineFit AI Scheduler**와 **문서 액션 화면**을 하나의 웹앱으로 통합한다.

- RoutineFit은 고정 일정, 해야 할 일, 과거 패턴, 이전 플랜 진행률을 바탕으로 하루 계획을 만들고 검증한다.
- 문서 액션은 영수증, 청구서, 계약서를 처리해 지출, 마감 리마인드, 계약 확인 초안을 만든다.
- 청구서 납부기한과 계약 만기일은 RoutineFit 캘린더에 `마감: ...` 일정으로 연결된다.
- 문서 액션 지출과 리마인드는 로컬 JSON으로 저장하지 않고 Azure Cosmos DB를 사용한다.

## 주요 화면

### 일정 홈

`client/src/main.jsx`의 기본 화면이다.

- 월간 캘린더에서 날짜별 고정 일정과 마감 할 일을 확인한다.
- 선택 날짜의 하루 시간표를 캘린더처럼 보여준다.
- 생성된 플랜은 현재 선택 날짜에 해당하는 항목만 표시한다.
- 진행률은 해당 날짜의 플랜에서만 수정할 수 있다.

### 플랜 설정

사용자는 고정 일정, 해야 할 일, 과거 패턴, 이전 플랜 기록을 입력한다.

- 해야 할 일의 소요 시간은 직접 입력 또는 AI 추정 선택으로 구분한다.
- 급한 요청은 자연어 메모로 입력할 수 있다.
- 과거 패턴은 `점심식사`, `저녁식사`, `아침 준비`처럼 실제 시간표에 쓰기 좋은 이름으로 표시한다.

### 결과·리뷰

서버가 생성한 하루 플랜과 검증 결과를 보여준다.

- 일정 겹침, 비가용 시간 충돌, 마감 미충족을 deterministic validation으로 확인한다.
- GitHub Copilot SDK가 검증된 플랜을 바탕으로 한국어 요약과 실행 리뷰를 만든다.
- Copilot 호출 실패 시에도 로컬 검증 결과와 `aiError`를 반환한다.

### 문서 액션

`client/src/DlsdydDocumentAgent.jsx`에 구현된 별도 탭이다.

- 영수증은 지출 기록과 월간 요약에 반영한다.
- 청구서는 납부기한 리마인드를 만든다.
- 계약서는 계약 만기 리마인드와 확인 요청 초안을 만든다.
- 같은 문서를 반복 처리하면 안정적인 중복 키로 기존 지출 또는 리마인드를 재사용한다.
- Cosmos DB가 설정되지 않으면 화면은 깨지지 않고 설정 안내와 비활성 버튼을 표시한다.

## 서버 API

`server/index.js`가 Express API를 제공한다.

| API | 역할 |
| --- | --- |
| `GET /api/health` | 앱, Copilot SDK, 문서 액션 Azure 설정 상태 확인 |
| `POST /api/schedule/generate` | RoutineFit 하루 플랜 생성 |
| `POST /api/review/generate` | 진행률 기반 실행 리뷰 생성 |
| `POST /api/process` | 문서 액션 처리 |
| `GET /api/summary` | Cosmos DB에서 문서 액션 지출 요약 조회 |
| `GET /api/reminders` | Cosmos DB에서 문서 액션 리마인드 조회 |

## Azure Cosmos DB 저장소

문서 액션의 지출과 리마인드는 `server/src/documentAction.js`에서 처리한다.

- `AZURE_COSMOS_ENDPOINT`가 있으면 `storageBackend`가 `cosmos`가 된다.
- `AZURE_COSMOS_KEY`가 있으면 키 인증을 사용한다.
- `AZURE_COSMOS_KEY`가 없으면 `DefaultAzureCredential`을 사용한다.
- 로컬에서는 Azure CLI 로그인, Azure 배포에서는 Managed Identity로 인증할 수 있다.
- DB 이름은 `AZURE_COSMOS_DATABASE`가 없으면 `docuagent`를 사용한다.
- 컨테이너는 `expenses`, `reminders`이며 파티션 키는 `/userId`다.

`DOCUMENT_ACTION_AZURE_ENABLED`는 Cosmos 저장소 필수값이 아니다. 이 값은 Azure Document Intelligence OCR과 Blob Storage 원본 저장 같은 선택 기능을 켤 때 사용한다.

## 배포 준비

루트 `README.md`는 심사와 배포 준비 기준 문서로 유지한다.

Azure App Service에서는 다음 App Settings를 설정한다.

| 설정 | 용도 |
| --- | --- |
| `AZURE_COSMOS_ENDPOINT` | Cosmos DB 저장/조회 필수 |
| `AZURE_COSMOS_KEY` | 선택. 없으면 DefaultAzureCredential 사용 |
| `AZURE_COSMOS_DATABASE` | 선택. 기본값 `docuagent` |
| `DOCUMENT_ACTION_AZURE_ENABLED` | 선택 Azure OCR/Blob 기능 활성화 |

설정 후 `/api/health`에서 다음 값을 확인한다.

```json
{
  "documentAction": {
    "storageBackend": "cosmos",
    "cosmosAuthMode": "default-azure-credential"
  }
}
```

## 검증

현재 검증 기준은 다음과 같다.

```powershell
Set-Location -Path 'D:\JI2NU\talking\server'
npm test

Set-Location -Path 'D:\JI2NU\talking\client'
npm run build
```

서버 테스트에는 다음 항목이 포함된다.

- Cosmos DB 설정이 없으면 문서 액션 저장소가 명시적으로 실패하는지 확인
- `AZURE_COSMOS_ENDPOINT`만 있을 때 `DefaultAzureCredential` 인증 모드가 되는지 확인
- 루트 `README.md`가 존재하는지 확인
- 스케줄러의 시간 파싱, 비가용 시간 회피, 진행률 이월, 마감 검증 확인
