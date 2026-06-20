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
  priorityRank: {
    high: 0,
    medium: 1,
    low: 2
  }
});

export const COPILOT_CONFIG = Object.freeze({
  model: process.env.COPILOT_MODEL || "gpt-5",
  timeoutMs: Number(process.env.COPILOT_TIMEOUT_MS || 45000)
});
