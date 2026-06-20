# 📄 문서 액션 에이전트 (Document Action Agent)

영수증·청구서·계약서 같은 문서를 올리면 **GitHub Copilot SDK 에이전트**가 문서를
스스로 분류하고, 핵심 정보를 추출·분석하며, 종류에 맞는 후속 행동(가계부 기록 ·
예산 분석 · 마감 리마인드 · 해지 안내문 작성)까지 자동으로 수행하는 개인 생산성
웹앱입니다.

> 대회 제약 충족
> - ✅ **웹 앱** (React + Express)
> - ✅ **Copilot SDK가 핵심** — 에이전트가 custom tool을 스스로 골라 다단계 실행
> - ✅ **Azure 의미 있는 사용** — Document Intelligence(OCR) · Cosmos DB · Blob ·
>   Container Apps (아래 "프로덕션" 참고)

## 왜 Copilot SDK가 핵심인가

사용자는 "이 문서를 처리해줘"라고만 합니다. 그 다음은 에이전트가 직접 판단합니다.

```
문서 업로드
   └─ Copilot SDK 에이전트(두뇌)
        ├─ 영수증?  → save_expense → analyze_budget
        ├─ 청구서?  → set_reminder (+ 필요시 save_draft_message)
        └─ 계약서?  → 요약/리스크 + (갱신일 있으면) set_reminder
```

도구(custom tool)는 **부수효과(저장·분석·리마인드)**를 담당하고, 분기와 순서는
에이전트가 자율적으로 결정합니다. SDK를 제거하면 앱의 핵심 가치가 사라집니다.

## 프로젝트 구조

```
server/   Express API + Copilot SDK 에이전트 + custom tools
  src/copilot/agent.ts   세션 생성, 시스템 프롬프트, 실행
  src/copilot/tools.ts   custom tools (save_expense, analyze_budget, ...)
  src/store/store.ts     저장소 추상화 (로컬 JSON ↔ Cosmos DB)
  src/ocr/extract.ts     OCR 추상화 (로컬 ↔ Document Intelligence)
  src/storage/blob.ts    원본 문서 보관 (Azure Blob Storage)
web/      React (Vite) 업로드 / 결과 / 대시보드 UI
infra/    Bicep (Container Apps, Cosmos, Blob, Document Intelligence, MI)
Dockerfile  단일 컨테이너 (API + 빌드된 웹 정적 파일)
```

## 사전 준비

1. **Node.js 18+**
2. **GitHub Copilot CLI**가 PATH에 있어야 하고 Copilot 구독이 필요합니다.
   - `copilot` CLI 로그인 또는 `COPILOT_GITHUB_TOKEN` 등 환경변수로 인증
   - 설치: https://github.com/features/copilot/cli

## 로컬 실행

```powershell
# 1) 의존성 설치 (루트에서 워크스페이스 전체)
npm install

# 2) 서버 환경변수
Copy-Item server\.env.example server\.env

# 3) 개발 서버 실행 (두 개의 터미널 권장)
npm run dev:server   # http://localhost:3001
npm run dev:web      # http://localhost:5173
```

브라우저에서 http://localhost:5173 접속 → "예시: 영수증" 버튼으로 바로 체험.

## 사용법

1. 영수증/청구서 텍스트를 붙여넣거나 이미지를 업로드
2. "AI에게 맡기기" 클릭
3. 에이전트가 분류 → 도구 실행 → 한국어 요약을 반환
4. 하단 대시보드에서 월별 지출/마감 확인

## Azure 사용 (의미 있는 클라우드 통합)

각 모듈은 **교체 지점(seam)**으로 설계되어, 환경변수만 채우면 로컬 fallback에서
Azure 구현으로 자동 전환됩니다. (키가 없으면 로컬 모드, 있으면 Azure 모드)

| 기능 | 로컬 MVP | 프로덕션 (Azure) | 구현 위치 |
| --- | --- | --- | --- |
| OCR | 텍스트 입력 | **Azure AI Document Intelligence** | `src/ocr/extract.ts` |
| 저장소 | 로컬 JSON | **Azure Cosmos DB** (NoSQL) | `src/store/store.ts`, `cosmos.ts` |
| 파일 보관 | 임시 파일 | **Azure Blob Storage** | `src/storage/blob.ts` |
| 인증 | `.env` 키 | **Managed Identity** (`DefaultAzureCredential`) | 전 모듈 |
| 호스팅 | 로컬 | **Azure Container Apps** | `Dockerfile`, `infra/` |

서버는 시작 시 활성 백엔드를 로그로 출력합니다 (`store: cosmos` 또는 `store: local`).

### 한 번에 배포 (azd)

[Azure Developer CLI](https://aka.ms/azd)가 설치되어 있으면 한 명령으로
컨테이너 이미지 빌드 → Azure 리소스 프로비저닝 → 배포까지 수행합니다.

```powershell
# 1) 로그인
azd auth login

# 2) Copilot SDK 런타임 인증 토큰 설정 (Container App 시크릿으로 주입됨)
azd env set COPILOT_GITHUB_TOKEN <your-github-token>

# 3) 프로비저닝 + 배포
azd up
```

`infra/`의 Bicep이 다음을 생성합니다:

- **Azure Container Apps** (+ 환경, Log Analytics) — 단일 컨테이너가 API와 빌드된
  React 정적 파일을 함께 서빙 (`STATIC_DIR`)
- **Azure Container Registry** — 이미지 보관 (Managed Identity로 `AcrPull`)
- **Azure Cosmos DB** (serverless) — `docuagent` DB + `expenses`/`reminders`
  컨테이너 (`/userId` 파티션), 데이터 평면 RBAC
- **Azure Blob Storage** — `documents` 컨테이너 (`Storage Blob Data Contributor`)
- **Azure AI Document Intelligence** (FormRecognizer S0, `Cognitive Services User`)
- **User-Assigned Managed Identity** — 위 모든 데이터 서비스에 **키 없이** 접근

> 컨테이너 앱에는 `AZURE_CLIENT_ID`가 주입되어 `DefaultAzureCredential`이 해당
> Managed Identity를 사용합니다. 데이터 서비스 키는 어디에도 저장하지 않습니다.

### 로컬에서 컨테이너로 실행

```powershell
docker build -t docu-action-agent .
docker run -p 3001:3001 --env-file server/.env docu-action-agent
# http://localhost:3001
```

## 보안 메모

- Copilot 토큰·DB 키 등 비밀값은 절대 프론트엔드에 두지 않고 서버/Key Vault에서만 사용
- 영수증의 카드번호 등 민감정보는 프로덕션에서 마스킹 처리 권장