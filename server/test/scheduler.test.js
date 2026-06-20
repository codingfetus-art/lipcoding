import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTime,
  generateSchedule,
  generateLocalReview,
  parseTime,
  rangesOverlap,
  validateSchedulePayload
} from "../src/scheduler.js";

test("parses and formats HH:mm values", () => {
  assert.equal(parseTime("12:30"), 750);
  assert.equal(formatTime(750), "12:30");
  assert.throws(() => parseTime("25:00"), /범위를 벗어났습니다/);
});

test("estimates missing duration and forces urgent task into today's plan", () => {
  const payload = validateSchedulePayload({
    planningStartDate: "2026-06-20",
    planningNote:
      "오늘 너무 바빠도 발표자료 만들기는 꼭 끝내야 해. 운동은 시간이 부족하면 내일로 넘겨도 돼.",
    fixedEvents: [],
    tasks: [
      {
        id: "task-deck",
        title: "발표자료 만들기",
        durationMinutes: null,
        durationDescription: "자료 조사는 했고 슬라이드는 아직 시작 전",
        priority: "high",
        dueDate: "2026-06-21",
        dueLabel: "내일 발표 전"
      },
      {
        id: "task-workout",
        title: "운동",
        durationMinutes: null,
        priority: "medium",
        dueDate: "2026-06-22",
        dueLabel: "이번 주 루틴"
      }
    ],
    historyRecords: []
  });

  assert.equal(payload.tasks[0].durationSource, "ai-estimated");
  assert.equal(payload.tasks[0].durationMinutes, 120);
  assert.equal(payload.tasks[0].dueDate, "2026-06-20");
  assert.equal(payload.tasks[1].durationMinutes, 40);

  const result = generateSchedule(payload);

  assert.deepEqual(result.dates, ["2026-06-20"]);
  assert.equal(result.validation.valid, true);
  assert.ok(result.plan.some((item) => item.taskId === "task-deck" && item.date === "2026-06-20"));
  assert.ok(result.plan.every((item) => typeof item.progressPercent === "number"));
});

test("does not generate next-day plan automatically", () => {
  const payload = validateSchedulePayload({
    planningStartDate: "2026-06-20",
    fixedEvents: [
      {
        id: "event-full-day",
        date: "2026-06-20",
        title: "오늘 종일 일정",
        start: "08:00",
        end: "22:00"
      }
    ],
    tasks: [
      {
        id: "task-future",
        title: "다음날까지 해도 되는 일",
        durationMinutes: 60,
        priority: "medium",
        dueDate: "2026-06-21",
        dueLabel: "내일까지"
      }
    ],
    historyRecords: []
  });

  const result = generateSchedule(payload);

  assert.deepEqual(result.dates, ["2026-06-20"]);
  assert.equal(result.plan[0].status, "unscheduled");
  assert.equal(result.validation.valid, true);
});

test("reviews progress percentages instead of completion statuses", () => {
  const review = generateLocalReview({
    plan: [
      { id: "plan-1", title: "발표자료" },
      { id: "plan-2", title: "운동" }
    ],
    progress: {
      "plan-1": 50,
      "plan-2": 100
    }
  });

  assert.match(review, /평균 진행률은 75%/);
  assert.match(review, /100% 미만/);
});

test("uses saved progress history to schedule only remaining task time", () => {
  const payload = validateSchedulePayload({
    planningStartDate: "2026-06-21",
    fixedEvents: [],
    tasks: [
      {
        id: "task-deck",
        title: "발표자료 만들기",
        durationMinutes: 120,
        priority: "high",
        dueDate: "2026-06-21",
        dueLabel: "오늘 안에"
      }
    ],
    historyRecords: [],
    planHistory: [
      {
        id: "history-deck",
        type: "plan",
        taskId: "task-deck",
        planItemId: "task-deck-1",
        label: "발표자료 만들기",
        date: "2026-06-20",
        start: "09:00",
        end: "11:00",
        progressPercent: 50,
        status: "partial"
      }
    ]
  });

  assert.equal(payload.tasks[0].durationMinutes, 60);
  assert.match(payload.tasks[0].durationReason, /남은 60분/);

  const result = generateSchedule(payload);
  const scheduledMinutes = result.plan
    .filter((item) => item.taskId === "task-deck" && item.status !== "unscheduled")
    .reduce(
      (sum, item) => sum + parseTime(item.end) - parseTime(item.start),
      0
    );

  assert.equal(scheduledMinutes, 60);
  assert.equal(result.validation.valid, true);
});

test("detects overlapping ranges on the same date", () => {
  assert.equal(
    rangesOverlap(
      { date: "2026-06-20", startMinutes: 600, endMinutes: 660 },
      { date: "2026-06-20", startMinutes: 650, endMinutes: 700 }
    ),
    true
  );
  assert.equal(
    rangesOverlap(
      { date: "2026-06-20", startMinutes: 600, endMinutes: 660 },
      { date: "2026-06-21", startMinutes: 650, endMinutes: 700 }
    ),
    false
  );
});

test("generates a schedule that avoids fixed and inferred meal blocks", () => {
  const payload = validateSchedulePayload({
    planningStartDate: "2026-06-20",
    fixedEvents: [
      {
        id: "event-1",
        date: "2026-06-20",
        title: "회의",
        start: "10:00",
        end: "11:00"
      }
    ],
    tasks: [
      {
        id: "task-1",
        title: "발표자료 만들기",
        durationMinutes: 120,
        priority: "high",
        dueDate: "2026-06-21",
        dueLabel: "내일 발표 전"
      },
      {
        id: "task-2",
        title: "메일 정리",
        durationMinutes: 25,
        priority: "low",
        dueDate: "2026-06-20",
        dueLabel: "오늘 업무 종료 전"
      }
    ],
    historyRecords: [
      {
        id: "meal-1",
        type: "meal",
        label: "lunch",
        start: "12:20",
        durationMinutes: 45
      },
      {
        id: "meal-2",
        type: "meal",
        label: "lunch",
        start: "12:40",
        durationMinutes: 45
      },
      {
        id: "quiet-1",
        type: "routine",
        label: "아침 준비",
        start: "08:00",
        end: "09:00"
      }
    ]
  });

  const result = generateSchedule(payload);

  assert.equal(result.validation.valid, true);
  assert.ok(
    result.unavailableBlocks.some((block) =>
      block.label === "점심식사" && block.reason.includes("점심식사는 보통") && block.reason.includes("사이")
    )
  );
  assert.ok(result.plan.every((item) => item.status !== "unscheduled"));
});

test("reports a validation issue when due work cannot fit before deadline", () => {
  const payload = validateSchedulePayload({
    planningStartDate: "2026-06-20",
    fixedEvents: [
      {
        id: "event-full-day",
        date: "2026-06-20",
        title: "종일 일정",
        start: "08:00",
        end: "22:00"
      }
    ],
    tasks: [
      {
        id: "task-impossible",
        title: "긴급 보고서",
        durationMinutes: 60,
        priority: "high",
        dueDate: "2026-06-20",
        dueLabel: "오늘 안에"
      }
    ],
    historyRecords: []
  });

  const result = generateSchedule(payload);

  assert.equal(result.validation.valid, false);
  assert.match(result.validation.issues.join(" "), /완료할 수 있는 시간이 부족|배치하지 못했습니다/);
});
