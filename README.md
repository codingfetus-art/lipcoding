# RoutineFit AI Scheduler

RoutineFit AI Scheduler is a web-only personal productivity app that plans one day at a time around calendar events, inferred meal patterns, and routine unavailable time. It uses the GitHub Copilot SDK on the server side to generate AI plan summaries and execution reviews, while deterministic validation protects scheduling integrity.

## Features

- Calendar-based fixed event input
- Mobile-friendly primary home screen focused on monthly schedule and daily plan
- At-a-glance dashboard summary for selected date, fixed events, due tasks, and plan status
- Monthly calendar overview with day drill-down
- Top calendar-like daily timeline view
- Secondary pages for AI plan setup, fixed events, tasks, history, results, and review
- Generated plans remain available while browsing dates until the daily plan reset is pressed
- Task input with priority, due schedule, direct duration entry, or explicit AI duration estimation selection
- Pre-plan natural language note for urgent constraints like "this must be done today"
- Pattern inference from previous history records
- Unavailable block calculation for fixed events, meals, and routine quiet time
- Validated one-day schedule generation that avoids blocked time
- Compact validation panel with status badges, issue count, and AI summary
- Generated plan results are filtered to the currently selected date
- Inferred unavailable blocks use natural pattern reasons such as "점심식사는 보통 11:50에서 13:50 사이" while the plan timeline shows concise names such as "점심식사" and "아침 준비"
- Plans are generated for the selected day only, not automatically for the next day
- Selected-day progress percentage tracking and AI execution review
- Previous plan history is stored separately from routine patterns and carries unfinished work into the next generated plan
- Separate `origin/dlsdyd` document action screen for receipts, bills, contracts, reminders, and monthly expense summary
- Document Action Azure OCR, Blob Storage, and Cosmos DB integrations are gated by `DOCUMENT_ACTION_AZURE_ENABLED=true` to avoid unexpected paid usage
- Bill and contract reminders extracted in Document Action are added to the RoutineFit calendar
- Azure Web App deployment workflow for the `jinu` branch

## Azure credit safety

The `origin/dlsdyd` Azure features are optional. By default, Document Action uses local JSON storage and text/file-name processing only. Azure Document Intelligence OCR, Blob Storage upload, and Cosmos DB persistence are used only when `DOCUMENT_ACTION_AZURE_ENABLED=true` and the matching Azure environment variables are configured.

Before enabling Azure usage, keep the subscription within free-credit controls: use Azure Cost Management budgets and alerts, keep free-account spending limits enabled where available, and do not add secrets to source control. See `server\.env.example` for the required variables.

## Local development

```powershell
cd server
npm install
npm test

cd ..\client
npm install
npm run build
```

Run the server after building the client:

```powershell
cd server
npm start
```

## AI provider

The server calls `@github/copilot-sdk` for AI summaries and reviews. The app does not invoke Copilot CLI commands directly; all AI integration goes through the SDK session API. If the Copilot SDK runtime is unavailable, the API returns the validated deterministic plan with an explicit `aiError` field so the failure is visible instead of silent.

Copilot prompts are structured around explicit context sections:

- selected date and user planning note
- fixed events, unavailable blocks, tasks, and validated plan
- deadline-range fixed schedule context for each task unless the user asks otherwise
- validation issues and AI-estimated duration reasons
- saved progress and remaining work for execution reviews

AI responses are requested as short Korean Markdown sections such as "오늘의 핵심 계획", "우선순위 근거", "비가용 시간 회피", "남은 작업", and "다음 플랜 조정" so the output is explainable instead of a free-form black box.

## Runtime configuration

Use environment variables instead of hardcoded runtime values:

| Setting | Purpose |
| --- | --- |
| `PORT` | Express server port. Azure App Service sets this at runtime. |
| `COPILOT_MODEL` | Optional Copilot SDK model override. |
| `COPILOT_TIMEOUT_MS` | Copilot SDK request timeout. Defaults to `45000`. |
| `COPILOT_RUNTIME_PATH` | Optional Copilot runtime path override. |
| `COPILOT_CLI_PATH` | Backward-compatible Copilot runtime path override. |

The server exposes `GET /api/health` for cloud readiness checks. It returns app status, Copilot SDK configuration readiness, timeout settings, and whether it appears to be running on Azure App Service. It does not return secrets, tokens, runtime paths, or credentials.

## Azure deployment

The GitHub Actions workflow builds the React client, copies `client/dist` into `server/public`, and deploys the Express server to Azure Web App using:

- `AZURE_WEBAPP_NAME`
- `AZURE_WEBAPP_PUBLISH_PROFILE`

Deployment is configured for pushes to the `jinu` branch.

Azure App Service configuration should use App Settings for runtime values such as `COPILOT_MODEL`, `COPILOT_TIMEOUT_MS`, and `COPILOT_RUNTIME_PATH`. For production-style demos, use a deployment slot for smoke testing `/api/health` before swapping traffic to production.

## Azure AI extension path

The current implementation uses GitHub Copilot SDK as the required AI integration layer. To improve Azure cloud scoring without changing the user experience, the AI runtime can be extended toward Azure AI Foundry or an Azure AI model inference endpoint by keeping the same server-side prompt context and response contract:

1. Keep deterministic schedule validation in `server/src/scheduler.js`.
2. Keep structured prompt context in `server/index.js`.
3. Move provider-specific model runtime settings into Azure App Settings.
4. Add a provider adapter that returns the same structured Markdown sections for plan summaries and reviews.
