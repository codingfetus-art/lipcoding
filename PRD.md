# Product Requirements Document

## 1. Product

**RoutineFit AI Scheduler** is a web-based personal productivity app that combines day planning, execution review, and document-triggered reminders.

The app is designed for a user who wants to turn real-life constraints into a realistic daily plan:

- fixed calendar events
- task deadlines
- meal and routine patterns
- unfinished work from previous plans
- bill due dates and contract renewal dates from uploaded documents

## 2. Goals

1. Help users create a realistic one-day schedule that avoids unavailable time.
2. Keep the main experience mobile-friendly with a monthly calendar and daily timeline first.
3. Use GitHub Copilot SDK for plan explanation and execution review, while deterministic validation protects scheduling correctness.
4. Add a document action flow that converts receipts, bills, and contracts into actionable expense records and reminders.
5. Store document action expenses and reminders in Azure Cosmos DB, not local JSON.
6. Make Azure readiness visible through `/api/health` and the reviewer-facing home screen.
7. Surface responsible AI and validation evidence directly in the submitted app.

## 3. Non-goals

- The app does not automatically create plans for multiple future days.
- The app does not silently fall back to local JSON for document action storage.
- The app does not require Azure Document Intelligence or Blob Storage unless those optional features are explicitly enabled.
- The app does not commit secrets, tokens, keys, or Azure publish profiles.

## 4. Target users

### Primary user

A busy individual who needs a daily schedule that respects existing commitments, routine unavailable time, and unfinished work.

### Secondary user

A reviewer or demo evaluator who needs to see that the product uses AI, Azure, and validation in a meaningful end-to-end flow.

## 5. User stories

### Daily planning

As a user, I want to enter fixed events and tasks so that the app can build a realistic day plan.

Acceptance criteria:

- The plan is generated for the selected date only.
- The plan avoids fixed events and inferred unavailable blocks.
- The result screen only shows plan items for the selected date.
- Validation issues are shown when work cannot fit before a deadline.

### Progress carry-over

As a user, I want to save task progress so unfinished work is reflected in the next plan.

Acceptance criteria:

- Progress can only be edited for the selected date's plan.
- Previous plan history is stored separately from routine pattern history.
- Remaining work is calculated from saved progress and used in the next schedule.

### Pattern-aware unavailable time

As a user, I want the app to understand ordinary routine blocks like lunch and morning preparation.

Acceptance criteria:

- Pattern labels are concise, for example `점심식사`, `저녁식사`, `아침 준비`.
- Reason text explains the time range naturally, for example `점심식사는 보통 11:50에서 13:50 사이`.
- The timeline uses the concise label, while validation/explanation can show the reason.

### Document action

As a user, I want to process receipts, bills, and contracts so important financial or contract dates become actionable.

Acceptance criteria:

- Receipts create expense records.
- Bills create due-date reminders.
- Contracts create renewal or expiry reminders and a draft confirmation message.
- Bill and contract reminders are added to the RoutineFit calendar as `마감: ...` events.
- Re-processing the same document reuses the existing Cosmos DB record through a stable dedupe key.

### Azure Cosmos DB storage

As a user or reviewer, I want document action data to be stored in Azure Cosmos DB.

Acceptance criteria:

- `AZURE_COSMOS_ENDPOINT` enables Cosmos DB-backed storage.
- `AZURE_COSMOS_KEY` is optional.
- If `AZURE_COSMOS_KEY` is absent, the server uses `DefaultAzureCredential`.
- Local development can use Azure CLI login.
- Azure App Service can use Managed Identity.
- `/api/health` shows `storageBackend: "cosmos"` when configured.
- If Cosmos is not configured, the UI remains stable and shows a setup notice.

### Reviewer readiness

As a reviewer, I want to confirm the deployed app uses Azure, Cosmos DB, and validation without opening developer tools.

Acceptance criteria:

- The home screen shows a `심사용 Azure·AI 상태` panel.
- The panel reads `/api/health` and displays App Service, Cosmos DB, auth mode, Copilot SDK, and deterministic validation status.
- The panel explains demo evidence for document-to-calendar conversion, Cosmos DB dedupe/readback, and responsible AI guardrails.

## 6. Functional requirements

### Frontend

- Provide tabs for:
  - `일정 홈`
  - `플랜 설정`
  - `결과·리뷰`
  - `문서 액션`
- Show selected date summary cards.
- Show a month calendar and daily timeline.
- Show reviewer-facing Azure, storage, AI, and validation readiness on the home screen.
- Keep Document Action visually aligned with RoutineFit cards, buttons, and summary strips.
- Disable Document Action processing when Cosmos DB is unconfigured.

### Backend

- Provide schedule generation and review APIs.
- Call GitHub Copilot SDK for AI summaries and reviews.
- Return deterministic schedule results even if Copilot SDK fails.
- Provide document action APIs:
  - `POST /api/process`
  - `GET /api/summary`
  - `GET /api/reminders`
- Expose `GET /api/health` without leaking secrets.

### Data

- Use Cosmos DB database `docuagent` by default.
- Use containers:
  - `expenses`
  - `reminders`
- Use `/userId` as the partition key.
- Use stable dedupe keys for repeated receipts, bills, and contract reminders.

## 7. Azure requirements

Current Azure resources:

- Resource group: `rg-routinefit-docaction`
- Cosmos DB account: `routinefitdoc784016`
- Cosmos endpoint: `https://routinefitdoc784016.documents.azure.com:443/`
- App Service: `routinefit-docaction-784016`
- Deployed URL: `https://routinefit-docaction-784016.azurewebsites.net`

Required App Settings:

| Setting | Requirement |
| --- | --- |
| `AZURE_COSMOS_ENDPOINT` | Required |
| `AZURE_COSMOS_DATABASE` | Optional, defaults to `docuagent` |
| `AZURE_COSMOS_KEY` | Optional, omit when using Managed Identity |
| `DOCUMENT_ACTION_AZURE_ENABLED` | Optional, only for OCR/Blob features |
| `NODE_ENV` | `production` on Azure |

Managed Identity requirement:

- The App Service system-assigned identity must have Cosmos DB data-plane permission.
- The intended role is `Cosmos DB Built-in Data Contributor` at scope `/`.

## 8. Validation requirements

Local validation:

```powershell
Set-Location -Path 'D:\JI2NU\talking\server'
npm test

Set-Location -Path 'D:\JI2NU\talking\client'
npm run build
```

Cloud validation:

```text
https://routinefit-docaction-784016.azurewebsites.net/api/health
```

Expected health shape:

```json
{
  "documentAction": {
    "cosmosConfigured": true,
    "cosmosAuthMode": "default-azure-credential",
    "storageBackend": "cosmos"
  },
  "cloud": {
    "azureAppService": true,
    "nodeEnv": "production"
  }
}
```

## 9. Success metrics

- User can generate a validated one-day plan.
- User can review progress and carry unfinished work forward.
- User can process a bill and see the due date become a calendar event.
- Document action data is saved to and read from Cosmos DB.
- `/api/health` confirms Cosmos storage and Azure App Service runtime.
- Home screen readiness panel confirms the same cloud state without requiring API inspection.
- Repeated document processing does not create duplicate records for the same dedupe key.
- Responsible AI behavior is visible: deterministic validation stays available even if Copilot SDK fails.

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Cosmos DB not configured | Show stable UI notice and disable document processing |
| Azure identity lacks data role | Use `/api/health`, API errors, and role assignment checks |
| Copilot SDK unavailable | Return deterministic schedule and explicit `aiError` |
| Duplicate document processing | Stable dedupe key and existing-record reuse |
| Unexpected Azure cost | Serverless Cosmos, optional OCR/Blob gate, no secrets in code |

## 11. Reviewer demo script

1. Open `https://routinefit-docaction-784016.azurewebsites.net`.
2. Confirm the `심사용 Azure·AI 상태` panel shows Azure App Service, Cosmos DB, and `default-azure-credential`.
3. Generate a daily plan and confirm validation messages are shown for scheduling constraints.
4. Open `문서 액션`, process a bill or contract, and confirm the reminder appears in the RoutineFit calendar.
5. Re-process the same document and confirm the existing Cosmos DB record is reused instead of duplicated.
