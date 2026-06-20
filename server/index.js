import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { callCopilot } from "./src/copilotAgent.js";
import { COPILOT_CONFIG } from "./src/config.js";
import {
  getDocumentActionRuntime,
  getExpenseSummary,
  listReminders,
  processDocumentAction
} from "./src/documentAction.js";
import {
  generateSchedule,
  generateLocalReview,
  validateSchedulePayload
} from "./src/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    app: "routinefit-ai-scheduler",
    ai: {
      provider: "copilot-sdk",
      modelConfigured: Boolean(COPILOT_CONFIG.model),
      runtimeOverrideConfigured: COPILOT_CONFIG.runtimeOverrideConfigured,
      timeoutMs: COPILOT_CONFIG.timeoutMs
    },
    documentAction: getDocumentActionRuntime(),
    cloud: {
      azureAppService: Boolean(process.env.WEBSITE_SITE_NAME),
      nodeEnv: process.env.NODE_ENV || "development"
    }
  });
});

app.post("/api/schedule/generate", async (req, res) => {
  try {
    const payload = validateSchedulePayload(req.body);
    const schedule = generateSchedule(payload);
    const prompt = buildPlanPrompt(payload, schedule);

    try {
      const aiSummary = await callCopilot(prompt);
      res.json({ ...schedule, aiSummary, source: "copilot-sdk" });
    } catch (error) {
      res.status(207).json({
        ...schedule,
        aiSummary: null,
        aiError: error.message,
        source: "deterministic-validator"
      });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/review/generate", async (req, res) => {
  try {
    const localReview = generateLocalReview(req.body);
    const prompt = buildReviewPrompt(req.body, localReview);

    try {
      const review = await callCopilot(prompt);
      res.json({ review, source: "copilot-sdk" });
    } catch (error) {
      res.status(207).json({
        review: localReview,
        aiError: error.message,
        source: "deterministic-validator"
      });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/process", upload.single("file"), async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";
    const file = req.file || null;

    if (!text && !fileName && !file) {
      res.status(400).json({ error: "문서 텍스트 또는 파일 정보가 필요합니다." });
      return;
    }

    const result = await processDocumentAction({ text, file, fileName });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/reminders", async (_req, res) => {
  const reminders = await listReminders();
  res.json([...reminders].sort((left, right) => left.dueDate.localeCompare(right.dueDate)));
});

app.get("/api/summary", async (_req, res) => {
  res.json(await getExpenseSummary());
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`RoutineFit server listening on ${port}`);
});

function buildPlanPrompt(payload, schedule) {
  const deadlineScheduleContext = buildDeadlineScheduleContext(payload);
  const context = {
    selectedDate: payload.planningStartDate,
    userPlanningNote: payload.planningNote,
    fixedEvents: payload.fixedEvents,
    tasks: payload.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      durationMinutes: task.durationMinutes,
      durationSource: task.durationSource,
      durationReason: task.durationReason,
      priority: task.priority,
      dueDate: task.dueDate,
      dueLabel: task.dueLabel
    })),
    deadlineScheduleContext,
    previousPlanHistory: payload.planHistory,
    unavailableBlocks: schedule.unavailableBlocks,
    scheduledPlan: schedule.plan,
    validation: schedule.validation
  };

  return [
    "당신은 개인 생산성 향상 웹앱의 AI 일정 코치입니다.",
    "목표: 검증된 하루 플랜을 사용자가 이해하고 실행할 수 있게 설명하세요.",
    "중요 규칙:",
    "- 제공된 JSON 컨텍스트에 있는 사실만 사용하세요.",
    "- 다음날 이후 플랜을 자동 생성하거나 약속하지 마세요.",
    "- 사용자 요청에 명시적인 예외가 없으면 deadlineScheduleContext를 보고 마감일까지의 고정 일정과 남은 시간 압박을 우선순위 근거에 반영하세요.",
    "- previousPlanHistory가 있으면 같은 작업의 이전 진행률과 남은 시간을 다음 플랜 조정 근거로 활용하세요.",
    "- validation.valid가 false이면 문제를 숨기지 말고 주의 섹션에 설명하세요.",
    "- AI 추정 시간은 추정임을 명확히 표시하고, durationReason을 근거로 설명하세요.",
    "출력 형식은 반드시 다음 제목을 포함한 짧은 한국어 Markdown으로 작성하세요:",
    "1. 오늘의 핵심 계획",
    "2. 우선순위 근거",
    "3. 비가용 시간 회피",
    "4. 남은 작업 또는 주의점",
    "5. 바로 다음 행동",
    "컨텍스트:",
    JSON.stringify(context, null, 2)
  ].join("\n\n");
}

function buildDeadlineScheduleContext(payload) {
  const selectedDate = payload.planningStartDate;

  return payload.tasks.map((task) => {
    const dueDate = task.dueDate || selectedDate;
    const fixedEventsUntilDueDate = payload.fixedEvents
      .filter((event) => event.date >= selectedDate && event.date <= dueDate)
      .map((event) => ({
        id: event.id,
        date: event.date,
        title: event.title,
        start: event.start,
        end: event.end,
        durationMinutes: calculateTimeRangeMinutes(event.start, event.end)
      }));
    const fixedEventMinutes = fixedEventsUntilDueDate.reduce(
      (sum, event) => sum + event.durationMinutes,
      0
    );

    return {
      taskId: task.id,
      title: task.title,
      dueDate,
      dueLabel: task.dueLabel,
      requiredMinutes: task.durationMinutes,
      fixedEventsUntilDueDate,
      fixedEventMinutesUntilDueDate: fixedEventMinutes
    };
  });
}

function calculateTimeRangeMinutes(start, end) {
  return Math.max(0, parseClockTime(end) - parseClockTime(start));
}

function parseClockTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function buildReviewPrompt(payload, localReview) {
  const context = {
    plan: payload.plan || [],
    progress: payload.progress || {},
    remainingWork: payload.remainingWork || [],
    previousPlanHistory: payload.previousPlanHistory || [],
    validation: payload.validation || null,
    deterministicReview: localReview
  };

  return [
    "당신은 개인 생산성 실행 리뷰 코치입니다.",
    "목표: 사용자의 진행률과 남은 작업을 다음 플랜 개선 데이터로 바꿔 설명하세요.",
    "중요 규칙:",
    "- 100% 미만 항목을 실패로 단정하지 말고 다음 계획 개선 데이터로 해석하세요.",
    "- remainingWork가 있으면 다음 플랜에 반영할 남은 시간을 구체적으로 언급하세요.",
    "- previousPlanHistory는 과거 패턴과 분리된 이전 플랜 기록으로 보고 다음 계획에 참고할 점만 요약하세요.",
    "- 제공된 데이터에 없는 원인이나 개인정보를 추측하지 마세요.",
    "- deterministicReview와 validation을 기준으로 과장 없이 설명하세요.",
    "출력 형식은 반드시 다음 제목을 포함한 짧은 한국어 Markdown으로 작성하세요:",
    "1. 오늘 실행 요약",
    "2. 남은 작업",
    "3. 다음 플랜 조정",
    "4. 격려 메시지",
    "컨텍스트:",
    JSON.stringify(context, null, 2)
  ].join("\n\n");
}
