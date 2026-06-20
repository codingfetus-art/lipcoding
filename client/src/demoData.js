const DAY_MS = 24 * 60 * 60 * 1000;

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDemoData() {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const dayAfterTomorrow = new Date(today.getTime() + DAY_MS * 2);

  const todayKey = toDateInput(today);
  const tomorrowKey = toDateInput(tomorrow);
  const dayAfterTomorrowKey = toDateInput(dayAfterTomorrow);

  return {
    planningStartDate: todayKey,
    fixedEvents: [
      {
        id: "event-meeting",
        date: todayKey,
        title: "프로젝트 회의",
        start: "10:00",
        end: "11:00"
      },
      {
        id: "event-class",
        date: todayKey,
        title: "온라인 수업",
        start: "15:00",
        end: "16:00"
      }
    ],
    tasks: [
      {
        id: "task-deck",
        title: "발표자료 만들기",
        durationMinutes: 150,
        priority: "high",
        dueDate: tomorrowKey,
        dueLabel: "내일 발표 전까지"
      },
      {
        id: "task-mail",
        title: "메일 정리",
        durationMinutes: 25,
        priority: "low",
        dueDate: todayKey,
        dueLabel: "오늘 업무 종료 전"
      },
      {
        id: "task-workout",
        title: "운동",
        durationMinutes: 40,
        priority: "medium",
        dueDate: dayAfterTomorrowKey,
        dueLabel: "이번 주 루틴 유지"
      }
    ],
    historyRecords: [
      {
        id: "history-lunch-1",
        date: toDateInput(new Date(today.getTime() - DAY_MS)),
        type: "meal",
        label: "lunch",
        start: "12:20",
        durationMinutes: 45
      },
      {
        id: "history-lunch-2",
        date: toDateInput(new Date(today.getTime() - DAY_MS * 2)),
        type: "meal",
        label: "lunch",
        start: "12:35",
        durationMinutes: 45
      },
      {
        id: "history-lunch-3",
        date: toDateInput(new Date(today.getTime() - DAY_MS * 3)),
        type: "meal",
        label: "lunch",
        start: "12:10",
        durationMinutes: 45
      },
      {
        id: "history-dinner-1",
        date: toDateInput(new Date(today.getTime() - DAY_MS)),
        type: "meal",
        label: "dinner",
        start: "18:40",
        durationMinutes: 50
      },
      {
        id: "history-dinner-2",
        date: toDateInput(new Date(today.getTime() - DAY_MS * 2)),
        type: "meal",
        label: "dinner",
        start: "19:00",
        durationMinutes: 50
      },
      {
        id: "history-morning",
        date: toDateInput(new Date(today.getTime() - DAY_MS)),
        type: "routine",
        label: "아침 준비",
        start: "08:00",
        end: "09:00"
      },
      {
        id: "history-night",
        date: toDateInput(new Date(today.getTime() - DAY_MS)),
        type: "routine",
        label: "잠들기 전 휴식",
        start: "22:00",
        end: "23:00"
      },
      {
        id: "history-missed-workout",
        date: toDateInput(new Date(today.getTime() - DAY_MS * 2)),
        type: "plan",
        label: "운동 미완료",
        start: "20:30",
        end: "21:10",
        status: "missed"
      }
    ]
  };
}
