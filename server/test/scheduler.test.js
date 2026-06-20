import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTime,
  generateSchedule,
  parseTime,
  rangesOverlap,
  validateSchedulePayload
} from "../src/scheduler.js";

test("parses and formats HH:mm values", () => {
  assert.equal(parseTime("12:30"), 750);
  assert.equal(formatTime(750), "12:30");
  assert.throws(() => parseTime("25:00"), /범위를 벗어났습니다/);
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
  assert.ok(result.unavailableBlocks.some((block) => block.reason.includes("lunch")));
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
