# RoutineFit AI Scheduler

RoutineFit AI Scheduler is a web-only personal productivity app that plans work around calendar events, inferred meal patterns, and routine unavailable time. It uses the GitHub Copilot SDK on the server side to generate AI plan summaries and execution reviews, while deterministic validation protects scheduling integrity.

## Features

- Calendar-based fixed event input
- Task input with duration, priority, and due schedule
- Pattern inference from previous history records
- Unavailable block calculation for fixed events, meals, and routine quiet time
- Validated schedule generation that avoids blocked time
- Completion tracking and AI execution review
- Azure Web App deployment workflow for the `jinu` branch

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

The server attempts to call `@github/copilot-sdk` for AI summaries and reviews. If the Copilot SDK runtime is unavailable, the API returns the validated deterministic plan with an explicit `aiError` field so the failure is visible instead of silent.

## Azure deployment

The GitHub Actions workflow builds the React client, copies `client/dist` into `server/public`, and deploys the Express server to Azure Web App using:

- `AZURE_WEBAPP_NAME`
- `AZURE_WEBAPP_PUBLISH_PROFILE`

Deployment is configured for pushes to the `jinu` branch.
