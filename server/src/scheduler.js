import { SCHEDULE_CONFIG } from "./config.js";

const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSED_STATUSES = new Set(["missed", "partial", "skipped"]);

export function validateSchedulePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("요청 데이터가 필요합니다.");
  }

  const planningStartDate = payload.planningStartDate || todayKey();
  const fixedEvents = ensureArray(payload.fixedEvents, "fixedEvents");
  const tasks = ensureArray(payload.tasks, "tasks");
  const historyRecords = ensureArray(payload.historyRecords, "historyRecords");

  return {
    planningStartDate,
    fixedEvents: fixedEvents.map(normalizeFixedEvent),
    tasks: tasks.map(normalizeTask),
    historyRecords: historyRecords.map(normalizeHistoryRecord)
  };
}

export function generateSchedule(payload, config = SCHEDULE_CONFIG) {
  const dates = buildPlanningDates(payload, config);
  const unavailableBlocks = buildUnavailableBlocks(payload, dates, config);
  const plan = allocateTasks(payload.tasks, dates, unavailableBlocks, config);
  const validation = validatePlan(plan, unavailableBlocks, payload.tasks);

  return {
    dates,
    unavailableBlocks: unavailableBlocks.map(stripMinuteFields),
    plan,
    validation
  };
}

export function generateLocalReview(payload) {
  const plan = ensureArray(payload?.plan, "plan");
  const statuses = payload?.statuses || {};
  const counts = plan.reduce(
    (acc, item) => {
      const status = statuses[item.id] || "pending";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { completed: 0, partial: 0, missed: 0, skipped: 0, pending: 0 }
  );

  const total = plan.length;
  const completed = counts.completed || 0;
  const unfinished = total - completed;
  const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  if (total === 0) {
    return "리뷰할 플랜이 없습니다. 먼저 플랜을 생성하고 완료 여부를 기록하세요.";
  }

  return [
    `오늘 계획 ${total}개 중 ${completed}개를 완료해 완료율은 ${completionRate}%입니다.`,
    unfinished > 0
      ? "미완료 또는 부분 완료된 항목은 다음 계획에서 더 작은 작업 블록으로 나누는 것이 좋습니다."
      : "모든 항목을 완료했습니다. 다음 계획에서도 현재 리듬을 유지하세요.",
    "마감 일정이 있는 작업은 마감 전 완료를 보장하도록 남은 시간을 다시 분산 배치하세요."
  ].join(" ");
}

export function parseTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) {
    throw new Error(`잘못된 시간 형식입니다: ${value}`);
  }

  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error(`시간 범위를 벗어났습니다: ${value}`);
  }

  return hour * 60 + minute;
}

export function formatTime(minutes) {
  const normalized = Math.max(0, Math.min(minutes, MINUTES_PER_DAY - 1));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function rangesOverlap(left, right) {
  return left.date === right.date && left.startMinutes < right.endMinutes && right.startMinutes < left.endMinutes;
}

function ensureArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 배열이 필요합니다.`);
  }

  return value;
}

function normalizeFixedEvent(event) {
  const startMinutes = parseTime(event.start);
  const endMinutes = parseTime(event.end);
  assertPositiveRange(startMinutes, endMinutes, event.title || "고정 일정");

  return {
    id: event.id,
    date: requireString(event.date, "fixedEvents.date"),
    title: requireString(event.title, "fixedEvents.title"),
    start: event.start,
    end: event.end,
    startMinutes,
    endMinutes
  };
}

function normalizeTask(task) {
  const durationMinutes = Number(task.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`할 일 소요 시간이 올바르지 않습니다: ${task.title}`);
  }

  return {
    id: task.id,
    title: requireString(task.title, "tasks.title"),
    durationMinutes,
    priority: task.priority || "medium",
    dueDate: task.dueDate || null,
    dueLabel: task.dueLabel || task.dueDate || "마감 일정 없음"
  };
}

function normalizeHistoryRecord(record) {
  const startMinutes = parseTime(record.start);
  const endMinutes = record.end
    ? parseTime(record.end)
    : startMinutes + Number(record.durationMinutes || SCHEDULE_CONFIG.mealDurationMinutes);

  assertPositiveRange(startMinutes, endMinutes, record.label || "과거 기록");

  return {
    id: record.id,
    date: record.date || null,
    type: requireString(record.type, "historyRecords.type"),
    label: requireString(record.label, "historyRecords.label"),
    start: record.start,
    end: formatTime(endMinutes),
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes,
    status: record.status || null
  };
}

function requireString(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw new Error(`${fieldName} 값이 필요합니다.`);
  }

  return value;
}

function assertPositiveRange(startMinutes, endMinutes, label) {
  if (endMinutes <= startMinutes) {
    throw new Error(`${label}의 종료 시간이 시작 시간보다 늦어야 합니다.`);
  }
}

function buildPlanningDates(payload, config) {
  const start = parseDate(payload.planningStartDate);
  const latestDue = payload.tasks
    .map((task) => task.dueDate)
    .filter(Boolean)
    .map(parseDate)
    .sort((left, right) => right - left)[0];
  const requestedDays = latestDue
    ? Math.floor((latestDue - start) / DAY_MS) + 1
    : config.defaultPlanningDays;
  const days = Math.max(1, Math.min(requestedDays, config.maxPlanningDays));

  return Array.from({ length: days }, (_, index) => dateKey(addDays(start, index)));
}

function buildUnavailableBlocks(payload, dates, config) {
  const fixedBlocks = payload.fixedEvents
    .filter((event) => dates.includes(event.date))
    .map((event) => createBlock(event.date, event.startMinutes, event.endMinutes, event.title, "fixed-event"));
  const mealBlocks = inferMealPatternBlocks(payload.historyRecords, dates, config);
  const routineBlocks = inferRoutineBlocks(payload.historyRecords, dates, config);

  return mergeBlocks([...fixedBlocks, ...mealBlocks, ...routineBlocks]);
}

function inferMealPatternBlocks(records, dates, config) {
  const grouped = groupBy(
    records.filter((record) => record.type === "meal"),
    (record) => record.label
  );

  return Object.entries(grouped).flatMap(([label, items]) => {
    const averageStart = Math.round(
      items.reduce((sum, item) => sum + item.startMinutes, 0) / items.length
    );
    const averageDuration = Math.round(
      items.reduce((sum, item) => sum + item.durationMinutes, 0) / items.length
    );
    const duration = Math.max(averageDuration, config.mealDurationMinutes);
    const start = averageStart - config.mealPaddingMinutes;
    const end = averageStart + duration + config.mealPaddingMinutes;

    return dates.map((date) =>
      createBlock(date, start, end, `${label} 패턴`, "meal-pattern")
    );
  });
}

function inferRoutineBlocks(records, dates, config) {
  const routineRecords = records.filter((record) => record.type === "routine");
  const missedPlanRecords = records.filter(
    (record) => record.type === "plan" && MISSED_STATUSES.has(record.status)
  );
  const routineBlocks = routineRecords.flatMap((record) =>
    dates.map((date) =>
      createBlock(date, record.startMinutes, record.endMinutes, record.label, "routine-pattern")
    )
  );
  const missedBlocks = inferMissedPlanBlocks(missedPlanRecords, dates, config);

  return [...routineBlocks, ...missedBlocks];
}

function inferMissedPlanBlocks(records, dates, config) {
  const grouped = groupBy(records, (record) => Math.floor(record.startMinutes / 30) * 30);

  return Object.entries(grouped)
    .filter(([, items]) => items.length >= config.missedPatternThreshold)
    .flatMap(([startMinute]) => {
      const start = Number(startMinute);
      const end = start + config.missedPatternDurationMinutes;

      return dates.map((date) =>
        createBlock(date, start, end, "반복 미완료 패턴", "missed-pattern")
      );
    });
}

function allocateTasks(tasks, dates, unavailableBlocks, config) {
  const busyBlocks = [...unavailableBlocks];
  const sortedTasks = [...tasks].sort((left, right) => {
    const leftDue = left.dueDate || dates[dates.length - 1];
    const rightDue = right.dueDate || dates[dates.length - 1];
    return (
      leftDue.localeCompare(rightDue) ||
      priorityRank(left.priority, config) - priorityRank(right.priority, config)
    );
  });
  const plan = [];

  for (const task of sortedTasks) {
    let remainingMinutes = task.durationMinutes;
    const dueDate = task.dueDate || dates[dates.length - 1];
    const availableDates = dates.filter((date) => date <= dueDate);

    while (remainingMinutes > 0) {
      const blockMinutes = Math.min(remainingMinutes, config.maxTaskBlockMinutes);
      const slot = findSlot(availableDates, busyBlocks, blockMinutes, config);

      if (!slot) {
        plan.push(createUnscheduledPlan(task, remainingMinutes));
        break;
      }

      const chunkMinutes =
        remainingMinutes < config.minTaskBlockMinutes ? remainingMinutes : blockMinutes;
      const endMinutes = slot.startMinutes + chunkMinutes;
      const item = {
        id: `${task.id}-${plan.length + 1}`,
        taskId: task.id,
        title:
          task.durationMinutes === chunkMinutes
            ? task.title
            : `${task.title} ${Math.ceil((task.durationMinutes - remainingMinutes + 1) / config.maxTaskBlockMinutes)}차`,
        date: slot.date,
        start: formatTime(slot.startMinutes),
        end: formatTime(endMinutes),
        startMinutes: slot.startMinutes,
        endMinutes,
        status: "pending",
        dueDate: task.dueDate,
        dueLabel: task.dueLabel
      };

      plan.push(item);
      busyBlocks.push(
        createBlock(
          slot.date,
          slot.startMinutes,
          endMinutes + config.minBreakMinutes,
          item.title,
          "generated-plan"
        )
      );
      remainingMinutes -= chunkMinutes;
    }
  }

  return plan.map(stripMinuteFields);
}

function findSlot(dates, busyBlocks, durationMinutes, config) {
  const dayStart = parseTime(config.dayStart);
  const dayEnd = parseTime(config.dayEnd);

  for (const date of dates) {
    const dayBusy = busyBlocks
      .filter((block) => block.date === date)
      .sort((left, right) => left.startMinutes - right.startMinutes);
    let cursor = dayStart;

    for (const block of dayBusy) {
      if (cursor + durationMinutes <= block.startMinutes) {
        return { date, startMinutes: cursor };
      }
      cursor = Math.max(cursor, block.endMinutes);
    }

    if (cursor + durationMinutes <= dayEnd) {
      return { date, startMinutes: cursor };
    }
  }

  return null;
}

function validatePlan(plan, unavailableBlocks, tasks) {
  const issues = [];
  const scheduled = plan.filter((item) => item.status !== "unscheduled");
  const scheduledWithMinutes = scheduled.map((item) => ({
    ...item,
    startMinutes: parseTime(item.start),
    endMinutes: parseTime(item.end)
  }));

  for (const item of scheduledWithMinutes) {
    const conflict = unavailableBlocks.find((block) => rangesOverlap(item, block));
    if (conflict) {
      issues.push(`${item.title}이 ${conflict.reason} 시간과 겹칩니다.`);
    }
  }

  for (let index = 0; index < scheduledWithMinutes.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < scheduledWithMinutes.length; nextIndex += 1) {
      if (rangesOverlap(scheduledWithMinutes[index], scheduledWithMinutes[nextIndex])) {
        issues.push(`${scheduledWithMinutes[index].title}과 ${scheduledWithMinutes[nextIndex].title}이 겹칩니다.`);
      }
    }
  }

  for (const task of tasks) {
    const taskMinutes = scheduledWithMinutes
      .filter((item) => item.taskId === task.id)
      .reduce((sum, item) => sum + item.endMinutes - item.startMinutes, 0);

    if (task.dueDate && taskMinutes < task.durationMinutes) {
      issues.push(`${task.title}을 마감 일정 안에 완료할 수 있는 시간이 부족합니다.`);
    }

    const lateItem = scheduledWithMinutes.find(
      (item) => item.taskId === task.id && task.dueDate && item.date > task.dueDate
    );
    if (lateItem) {
      issues.push(`${task.title}이 마감 일정 이후에 배치됐습니다.`);
    }
  }

  for (const item of plan.filter((entry) => entry.status === "unscheduled")) {
    issues.push(`${item.title}의 남은 ${item.remainingMinutes}분을 배치하지 못했습니다.`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function createBlock(date, startMinutes, endMinutes, reason, source) {
  const normalizedStart = Math.max(0, startMinutes);
  const normalizedEnd = Math.min(MINUTES_PER_DAY, endMinutes);

  return {
    id: `${source}-${date}-${normalizedStart}-${normalizedEnd}-${reason}`,
    date,
    reason,
    source,
    start: formatTime(normalizedStart),
    end: formatTime(normalizedEnd),
    startMinutes: normalizedStart,
    endMinutes: normalizedEnd
  };
}

function createUnscheduledPlan(task, remainingMinutes) {
  return {
    id: `${task.id}-unscheduled`,
    taskId: task.id,
    title: task.title,
    date: task.dueDate || null,
    start: null,
    end: null,
    status: "unscheduled",
    remainingMinutes,
    dueDate: task.dueDate,
    dueLabel: task.dueLabel
  };
}

function mergeBlocks(blocks) {
  const sorted = blocks
    .filter((block) => block.endMinutes > block.startMinutes)
    .sort((left, right) => left.date.localeCompare(right.date) || left.startMinutes - right.startMinutes);
  const merged = [];

  for (const block of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.date === block.date &&
      previous.endMinutes >= block.startMinutes
    ) {
      previous.endMinutes = Math.max(previous.endMinutes, block.endMinutes);
      previous.end = formatTime(previous.endMinutes);
      previous.reason = `${previous.reason}, ${block.reason}`;
      continue;
    }

    merged.push({ ...block });
  }

  return merged;
}

function stripMinuteFields(item) {
  const { startMinutes, endMinutes, ...rest } = item;
  return rest;
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function priorityRank(priority, config) {
  return config.priorityRank[priority] ?? config.priorityRank.medium;
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`잘못된 날짜 형식입니다: ${value}`);
  }

  return date;
}

function addDays(date, days) {
  return new Date(date.getTime() + DAY_MS * days);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function todayKey() {
  return dateKey(new Date());
}
