export const SCHEDULE_CONFIG = Object.freeze({
  dayStart: "08:00",
  dayEnd: "22:00",
  defaultPlanningDays: 3,
  maxPlanningDays: 7,
  mealPaddingMinutes: 30,
  mealDurationMinutes: 60,
  missedPatternDurationMinutes: 45,
  missedPatternThreshold: 2,
  minBreakMinutes: 10,
  minTaskBlockMinutes: 20,
  maxTaskBlockMinutes: 60,
  defaultEstimatedDurationMinutes: 45,
  durationEstimationRules: [
    { pattern: "발표|자료|슬라이드|보고서", minutes: 120 },
    { pattern: "조사|리서치|분석", minutes: 90 },
    { pattern: "코딩|개발|구현", minutes: 120 },
    { pattern: "메일|답장|정리", minutes: 25 },
    { pattern: "운동|산책", minutes: 40 },
    { pattern: "짧게|간단|빠르게", minutes: 20 }
  ],
  planningNoteUrgencyKeywords: ["오늘", "무조건", "꼭", "끝내야", "완료"],
  planningNoteDeferrableKeywords: ["미뤄도", "내일로", "시간이 부족하면"],
  priorityRank: {
    high: 0,
    medium: 1,
    low: 2
  }
});

export const COPILOT_CONFIG = Object.freeze({
  model: process.env.COPILOT_MODEL || null,
  timeoutMs: Number(process.env.COPILOT_TIMEOUT_MS || 45000),
  runtimeOverrideConfigured: Boolean(
    process.env.COPILOT_RUNTIME_PATH || process.env.COPILOT_CLI_PATH
  )
});
