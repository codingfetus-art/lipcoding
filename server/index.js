import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callCopilot } from "./src/copilotAgent.js";
import {
  generateSchedule,
  generateLocalReview,
  validateSchedulePayload
} from "./src/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

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

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`RoutineFit server listening on ${port}`);
});

function buildPlanPrompt(payload, schedule) {
  return [
    "당신은 개인 생산성 향상 웹앱의 AI 일정 코치입니다.",
    "아래 검증된 일정 초안을 바탕으로 사용자에게 보여줄 짧은 한국어 요약을 작성하세요.",
    "고정 일정, 식사 패턴, 평소 비워두는 시간대를 피했다는 점과 마감 일정 안에 완료되도록 분산한 점을 포함하세요.",
    "하드코딩된 가정처럼 말하지 말고, 제공된 데이터 기준으로만 설명하세요.",
    JSON.stringify({ input: payload, schedule }, null, 2)
  ].join("\n\n");
}

function buildReviewPrompt(payload, localReview) {
  return [
    "당신은 개인 생산성 실행 리뷰 코치입니다.",
    "사용자의 플랜 완료 상태를 보고 한국어로 짧고 구체적인 리뷰를 작성하세요.",
    "미완료를 실패로 단정하지 말고 다음 계획 개선 데이터로 해석하세요.",
    "아래 로컬 검증 리뷰를 참고하되 더 자연스럽게 정리하세요.",
    JSON.stringify({ payload, localReview }, null, 2)
  ].join("\n\n");
}
