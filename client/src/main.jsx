import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import DlsdydDocumentAgent from "./DlsdydDocumentAgent.jsx";
import { generatePlan, generateReview } from "./api.js";
import { createDemoData } from "./demoData.js";
import "./style.css";

const STORAGE_KEY = "routinefit-state-v1";
const CALENDAR_START_HOUR = 8;
const CALENDAR_END_HOUR = 22;
const CALENDAR_PIXELS_PER_HOUR = 72;
const CALENDAR_START_MINUTES = CALENDAR_START_HOUR * 60;
const CALENDAR_HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, index) => CALENDAR_START_HOUR + index
);
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DOCUMENT_REMINDER_START = "09:00";
const DOCUMENT_REMINDER_END = "09:30";
const MEAL_PATTERN_LABELS = {
  breakfast: "아침식사",
  lunch: "점심식사",
  dinner: "저녁식사"
};

function loadInitialState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return normalizeInitialState(JSON.parse(stored));
  }

  return normalizeInitialState(createDemoData());
}

function saveState(nextState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
}

function normalizeInitialState(state) {
  const historyRecords = Array.isArray(state.historyRecords) ? state.historyRecords : [];
  const planHistory = Array.isArray(state.planHistory) ? state.planHistory : [];
  const legacyPlanHistory = historyRecords.filter((record) => record.type === "plan");

  return {
    ...state,
    fixedEvents: Array.isArray(state.fixedEvents) ? state.fixedEvents : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    historyRecords: historyRecords.filter((record) => record.type !== "plan"),
    planHistory: mergePlanHistoryRecords(planHistory, legacyPlanHistory)
  };
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function App() {
  const [state, setState] = useState(loadInitialState);
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: state.planningStartDate,
    start: "09:00",
    end: "10:00"
  });
  const [newTask, setNewTask] = useState({
    title: "",
    durationMode: "manual",
    durationMinutes: "",
    durationDescription: "",
    priority: "medium",
    dueDate: state.planningStartDate,
    dueLabel: ""
  });
  const [schedule, setSchedule] = useState(null);
  const [review, setReview] = useState(null);
  const [planProgress, setPlanProgress] = useState({});
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [activePage, setActivePage] = useState("home");
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");

  const payload = useMemo(
    () => ({
      planningStartDate: state.planningStartDate,
      planningNote: state.planningNote || "",
      fixedEvents: state.fixedEvents,
      tasks: state.tasks,
      historyRecords: state.historyRecords,
      planHistory: state.planHistory || []
    }),
    [state]
  );
  const selectedDatePlan = useMemo(
    () =>
      (schedule?.plan ?? []).filter(
        (item) =>
          item.date === state.planningStartDate &&
          item.status !== "unscheduled"
      ),
    [schedule, state.planningStartDate]
  );
  const historyPatternSummaries = useMemo(
      () => buildHistoryPatternSummaries(state.historyRecords),
      [state.historyRecords]
  );

  useEffect(() => {
    let ignore = false;

    fetch("/api/health")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "헬스체크 조회 실패");
        }
        return data;
      })
      .then((data) => {
        if (!ignore) {
          setHealth(data);
          setHealthError("");
        }
      })
      .catch((requestError) => {
        if (!ignore) {
          setHealth(null);
          setHealthError(requestError.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  function updateState(updater) {
    setState((current) => saveState(updater(current)));
  }

  function addFixedEvent(event) {
    event.preventDefault();
    if (!newEvent.title.trim()) {
      setError("고정 일정 제목을 입력하세요.");
      return;
    }

    updateState((current) => ({
      ...current,
      fixedEvents: [
        ...current.fixedEvents,
        {
          ...newEvent,
          id: createId("event"),
          title: newEvent.title.trim()
        }
      ]
    }));
    setNewEvent((current) => ({ ...current, title: "" }));
    setError("");
  }

  function addTask(event) {
    event.preventDefault();
    if (!newTask.title.trim()) {
      setError("할 일 제목을 입력하세요.");
      return;
    }
    if (
      newTask.durationMode === "manual" &&
      (!Number.isFinite(Number(newTask.durationMinutes)) ||
        Number(newTask.durationMinutes) <= 0)
    ) {
      setError("1분 이상의 예상 시간을 입력하거나 AI 추정을 선택하세요.");
      return;
    }

    updateState((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          ...newTask,
          id: createId("task"),
          title: newTask.title.trim(),
          durationMinutes:
            newTask.durationMode === "ai-estimated"
              ? null
              : Number(newTask.durationMinutes),
          durationDescription: newTask.durationDescription.trim()
        }
      ]
    }));
    setNewTask((current) => ({
      ...current,
      title: "",
      durationMode: "manual",
      durationMinutes: "",
      durationDescription: "",
      dueLabel: ""
    }));
    setError("");
  }

  async function handleGeneratePlan() {
    setLoading("plan");
    setError("");
    setReview(null);
    try {
      const result = await generatePlan(payload);
      setSchedule(result);
      setPlanProgress(
        Object.fromEntries(
          result.plan.map((item) => [item.id, item.progressPercent || 0])
        )
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  async function handleGenerateReview() {
    if (!schedule) {
      setError("먼저 플랜을 생성하세요.");
      return;
    }

    setLoading("review");
    setError("");
    try {
      const result = await generateReview({
        plan: selectedDatePlan,
        progress: planProgress,
        remainingWork: buildRemainingWork(selectedDatePlan, planProgress),
        previousPlanHistory: state.planHistory || [],
        validation: schedule.validation
      });
      setReview(result);
      appendPlanHistory(selectedDatePlan, planProgress);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  function appendPlanHistory(plan, progress) {
    const completedRecords = plan
      .filter((item) => item.status !== "unscheduled" && item.start && item.end)
      .map((item) => {
        const progressPercent = Number(progress[item.id] || 0);
        return {
          id: createId("history"),
          planItemId: item.id,
          date: item.date,
          type: "plan",
          label: item.title,
          taskId: item.taskId,
          start: item.start,
          end: item.end,
          progressPercent,
          remainingMinutes: calculateRemainingMinutes(item, progressPercent),
          status: progressToStatus(progressPercent)
        };
      });

    updateState((current) => ({
      ...current,
      planHistory: mergePlanHistoryRecords(current.planHistory || [], completedRecords)
    }));
  }

  function resetDemo() {
    const demo = createDemoData();
    setState(saveState(demo));
    setSchedule(null);
    setReview(null);
    setPlanProgress({});
    setError("");
  }

  function updatePlanningNote(value) {
    updateState((current) => ({
      ...current,
      planningNote: value
    }));
  }

  function updatePlanningStartDate(value) {
    updateState((current) => ({
      ...current,
      planningStartDate: value
    }));
    setNewEvent((current) => ({ ...current, date: value }));
    setNewTask((current) => ({ ...current, dueDate: value }));
    setReview(null);
  }

  function resetDailyPlan() {
    setSchedule(null);
    setReview(null);
    setPlanProgress({});
    setError("");
  }

  function addDocumentReminderToCalendar(reminder) {
    if (!reminder?.id || !reminder?.dueDate) {
      return null;
    }

    const event = {
      id: `doc-reminder-${reminder.id}`,
      date: reminder.dueDate,
      title: `마감: ${reminder.title}`,
      start: DOCUMENT_REMINDER_START,
      end: DOCUMENT_REMINDER_END
    };

    updateState((current) => ({
      ...current,
      planningStartDate: reminder.dueDate,
      fixedEvents: [
        ...current.fixedEvents.filter((item) => item.id !== event.id),
        event
      ]
    }));
    setNewEvent((current) => ({ ...current, date: reminder.dueDate }));
    setNewTask((current) => ({ ...current, dueDate: reminder.dueDate }));
    setReview(null);

    return event;
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">웹 전용 생산성 코치</p>
        <h1>RoutineFit AI Scheduler</h1>
        <p>
          모바일에서 월간 일정과 하루 플랜을 먼저 보고, 세부 입력과 리뷰는
          필요한 페이지에서 관리합니다.
        </p>
      </section>

      <nav className="page-nav" aria-label="주요 화면">
        <button
          className={activePage === "home" ? "active" : "secondary"}
          type="button"
          onClick={() => setActivePage("home")}
        >
          일정 홈
        </button>
        <button
          className={activePage === "setup" ? "active" : "secondary"}
          type="button"
          onClick={() => setActivePage("setup")}
        >
          플랜 설정
        </button>
        <button
          className={activePage === "results" ? "active" : "secondary"}
          type="button"
          onClick={() => setActivePage("results")}
        >
          결과·리뷰
        </button>
        <button
          className={activePage === "documentAgent" ? "active" : "secondary"}
          type="button"
          onClick={() => setActivePage("documentAgent")}
        >
          문서 액션
        </button>
      </nav>

      {activePage !== "home" && (
        <div className="date-context" aria-live="polite">
          <span>현재 설정된 날짜</span>
          <strong>{state.planningStartDate}</strong>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}
      {schedule?.aiError && (
        <div className="alert warning">
          Copilot SDK 호출 실패: {schedule.aiError}. 검증된 로컬 플랜을
          표시합니다.
        </div>
      )}

      {activePage === "home" && (
        <section className="page-panel">
          <DashboardSummary
            selectedDate={state.planningStartDate}
            fixedEvents={state.fixedEvents}
            tasks={state.tasks}
            schedule={schedule}
          />

          <CloudReadinessPanel health={health} healthError={healthError} />

          <MonthCalendar
            selectedDate={state.planningStartDate}
            fixedEvents={state.fixedEvents}
            tasks={state.tasks}
            plan={schedule?.plan ?? []}
            onSelectDate={updatePlanningStartDate}
          />

          <CalendarTimeline
            date={state.planningStartDate}
            fixedEvents={state.fixedEvents}
            unavailableBlocks={schedule?.unavailableBlocks ?? []}
            plan={schedule?.plan ?? []}
            progress={planProgress}
            isPreview={!schedule}
            onResetPlan={resetDailyPlan}
          />
        </section>
      )}

      {activePage === "setup" && (
        <section className="page-panel">
          <div className="page-heading">
            <div>
              <p className="eyebrow dark">Plan setup</p>
              <h2>AI 플랜 입력 관리</h2>
            </div>
            <div className="page-actions">
              <button onClick={handleGeneratePlan} disabled={loading === "plan"}>
                {loading === "plan" ? "플랜 생성 중..." : "AI 플랜 생성"}
              </button>
              <button className="secondary" onClick={resetDemo}>
                데모 데이터 초기화
              </button>
            </div>
          </div>

          <section className="grid">
          <Card title="AI 플랜 요청">
          <label className="field-label" htmlFor="planning-date">
            플랜 기준 날짜
          </label>
          <input
            id="planning-date"
            type="date"
            value={state.planningStartDate}
            onChange={(event) => updatePlanningStartDate(event.target.value)}
          />
          <label className="field-label" htmlFor="planning-note">
            플랜 생성 전에 AI에게 전달할 말
          </label>
          <textarea
            id="planning-note"
            value={state.planningNote || ""}
            onChange={(event) => updatePlanningNote(event.target.value)}
            placeholder="예: 오늘 너무 바빠서 발표자료 초안은 꼭 끝내야 해."
            rows="7"
          />
          <p className="muted">
            이 요청은 우선순위, 오늘 처리할 범위, 내일로 넘길 작업 판단에
            반영됩니다.
          </p>
        </Card>

        <Card title="고정 일정">
          <form className="stack" onSubmit={addFixedEvent}>
            <input
              value={newEvent.title}
              onChange={(event) =>
                setNewEvent({ ...newEvent, title: event.target.value })
              }
              placeholder="회의, 수업, 약속"
            />
            <div className="row">
              <input
                type="date"
                value={newEvent.date}
                onChange={(event) =>
                  setNewEvent({ ...newEvent, date: event.target.value })
                }
              />
              <input
                type="time"
                value={newEvent.start}
                onChange={(event) =>
                  setNewEvent({ ...newEvent, start: event.target.value })
                }
              />
              <input
                type="time"
                value={newEvent.end}
                onChange={(event) =>
                  setNewEvent({ ...newEvent, end: event.target.value })
                }
              />
            </div>
            <button type="submit">일정 추가</button>
          </form>
          <ItemList
            items={state.fixedEvents}
            renderItem={(item) => (
              <>
                <strong>{item.title}</strong>
                <span>
                  {item.date} {item.start}-{item.end}
                </span>
              </>
            )}
          />
        </Card>

        <Card title="해야 할 일">
          <form className="stack" onSubmit={addTask}>
            <input
              value={newTask.title}
              onChange={(event) =>
                setNewTask({ ...newTask, title: event.target.value })
              }
              placeholder="할 일 제목"
            />
            <div className="row">
              <select
                aria-label="예상 시간 입력 방식"
                value={newTask.durationMode}
                onChange={(event) =>
                  setNewTask({
                    ...newTask,
                    durationMode: event.target.value,
                    durationMinutes:
                      event.target.value === "ai-estimated"
                        ? ""
                        : newTask.durationMinutes
                  })
                }
              >
                <option value="manual">시간 직접 입력</option>
                <option value="ai-estimated">AI 추정 선택</option>
              </select>
              <input
                type="number"
                min="1"
                step="5"
                value={newTask.durationMinutes}
                onChange={(event) =>
                  setNewTask({
                    ...newTask,
                    durationMinutes: event.target.value
                  })
                }
                placeholder="예상 분"
                disabled={newTask.durationMode === "ai-estimated"}
              />
              <select
                value={newTask.priority}
                onChange={(event) =>
                  setNewTask({ ...newTask, priority: event.target.value })
                }
              >
                <option value="high">높음</option>
                <option value="medium">중간</option>
                <option value="low">낮음</option>
              </select>
              <input
                type="date"
                value={newTask.dueDate}
                onChange={(event) =>
                  setNewTask({ ...newTask, dueDate: event.target.value })
                }
              />
            </div>
            <input
              value={newTask.dueLabel}
              onChange={(event) =>
                setNewTask({ ...newTask, dueLabel: event.target.value })
              }
              placeholder="마감 일정 설명"
            />
            <textarea
              value={newTask.durationDescription}
              onChange={(event) =>
                setNewTask({
                  ...newTask,
                  durationDescription: event.target.value
                })
              }
              placeholder="예상 시간이 애매하면 현재 상황을 설명하세요. 예: 자료 조사는 했고 슬라이드는 아직 시작 전"
              rows="3"
            />
            <button type="submit">할 일 추가</button>
          </form>
          <ItemList
            items={state.tasks}
            renderItem={(item) => (
              <>
                <strong>{item.title}</strong>
                <span>
                  {item.durationMinutes ? `${item.durationMinutes}분` : "AI 추정"} · {item.priority} ·{" "}
                  {item.dueLabel || item.dueDate}
                </span>
                {item.durationDescription && (
                  <span>시간 추정 설명: {item.durationDescription}</span>
                )}
              </>
            )}
          />
        </Card>

        <Card title="과거 패턴">
          <p className="muted">
            이전 기록을 묶어 점심식사, 저녁식사, 아침 준비처럼 보통 비워두는
            시간대를 요약합니다.
          </p>
          <ItemList
            items={historyPatternSummaries}
            emptyText="아직 인식된 과거 패턴이 없습니다."
            renderItem={(item) => (
              <>
                <strong>{item.summary}</strong>
                <span>{item.detail}</span>
              </>
            )}
          />
        </Card>

        <Card title="이전 플랜 기록">
          <p className="muted">
            생성된 플랜의 진행률과 남은 시간을 따로 저장해 다음 플랜에서
            참고합니다.
          </p>
          <ItemList
            items={buildPlanHistorySummaries(state.planHistory || [])}
            emptyText="아직 저장된 이전 플랜 기록이 없습니다."
            renderItem={(item) => (
              <>
                <strong>{item.summary}</strong>
                <span>{item.detail}</span>
              </>
            )}
          />
        </Card>
          </section>
        </section>
      )}

      {activePage === "results" && (
        <section className="page-panel">
          <div className="page-heading">
            <div>
              <p className="eyebrow dark">Results</p>
              <h2>플랜 결과와 리뷰</h2>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => setActivePage("setup")}
            >
              입력 수정하기
            </button>
          </div>

          {schedule ? (
            <>
          <section className="grid results">
          <Card title="인식된 비가용 시간">
            <ItemList
              items={schedule.unavailableBlocks}
              renderItem={(item) => (
                <>
                  <strong>{item.label || item.reason}</strong>
                  <span>
                    {item.date} {item.start}-{item.end} · {item.reason}
                  </span>
                </>
              )}
            />
          </Card>

          <Card title="생성된 플랜">
            <ItemList
              items={selectedDatePlan}
              emptyText="현재 설정된 날짜에 표시할 생성 플랜이 없습니다."
              renderItem={(item) => (
                <>
                  <strong>{item.title}</strong>
                  <span>
                    {item.date} {item.start}-{item.end}
                  </span>
                  {item.durationSource === "ai-estimated" && (
                    <span>AI 추정 시간: {item.durationReason}</span>
                  )}
                  <ProgressEditor
                    item={item}
                    selectedDate={state.planningStartDate}
                    value={planProgress[item.id] || 0}
                    onChange={(value) =>
                      setPlanProgress({
                        ...planProgress,
                        [item.id]: value
                      })
                    }
                  />
                </>
              )}
            />
            <button
              onClick={handleGenerateReview}
              disabled={loading === "review" || selectedDatePlan.length === 0}
            >
              {loading === "review"
                ? "진행률 저장 중..."
                : "진행률 저장 및 AI 실행 리뷰"}
            </button>
          </Card>

          <ValidationPanel schedule={schedule} />
          </section>
            </>
          ) : (
            <section className="card">
              <h2>아직 생성된 플랜이 없습니다.</h2>
              <p className="muted">
                플랜 설정 페이지에서 AI 플랜을 생성하면 결과와 진행률 저장 화면이
                여기에 표시됩니다.
              </p>
              <button type="button" onClick={() => setActivePage("setup")}>
                플랜 설정으로 이동
              </button>
            </section>
          )}

          {review && (
            <section className="review-card">
              <h2>AI 리뷰</h2>
              {review.aiError && (
                <div className="alert warning">
                  Copilot SDK 호출 실패: {review.aiError}. 검증된 로컬 리뷰를
                  표시합니다.
                </div>
              )}
              <p>{review.review}</p>
            </section>
          )}
        </section>
      )}

      {activePage === "documentAgent" && (
        <DlsdydDocumentAgent onReminderCreated={addDocumentReminderToCalendar} />
      )}
    </main>
  );
}

function MonthCalendar({ selectedDate, fixedEvents, tasks, plan, onSelectDate }) {
  const monthDays = buildMonthDays(selectedDate);
  const monthLabel = formatMonthLabel(selectedDate);

  return (
    <section className="calendar-card month-card">
      <div className="calendar-header">
        <div>
          <p className="eyebrow dark">Monthly overview</p>
          <h2>{monthLabel} 일정 보기</h2>
        </div>
      </div>
      <div className="month-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="month-grid">
        {monthDays.map((day) => {
          const summaries = getDaySummaries(day.date, fixedEvents, tasks, plan);
          const isSelected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              className={`month-day${day.inMonth ? "" : " outside"}${isSelected ? " selected" : ""}`}
              type="button"
              onClick={() => onSelectDate(day.date)}
              aria-pressed={isSelected}
            >
              <span className="month-day-number">{day.dayOfMonth}</span>
              <span className="month-day-summary">
                {summaries.length ? summaries.join(" · ") : "일정 없음"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CalendarTimeline({
  date,
  fixedEvents,
  unavailableBlocks,
  plan,
  progress,
  isPreview = false,
  onResetPlan
}) {
  const entries = buildCalendarEntries(date, fixedEvents, unavailableBlocks, plan, progress);

  return (
    <section className="calendar-card">
      <div className="calendar-header">
        <div>
          <p className="eyebrow dark">Daily timeline</p>
          <h2>{date} 하루 플랜</h2>
        </div>
        <div className="calendar-header-actions">
          <p className="muted">
            {isPreview
              ? "플랜 생성 전에는 고정 일정을 먼저 상단 시간표에 표시합니다."
              : "선택한 하루만 캘린더처럼 시각화합니다."}
          </p>
          {!isPreview && (
            <button className="secondary" type="button" onClick={onResetPlan}>
              하루 플랜 초기화
            </button>
          )}
        </div>
      </div>
      <div
        className="calendar-grid"
        style={{
          minHeight: `${(CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_PIXELS_PER_HOUR}px`
        }}
      >
        <div className="calendar-hours" aria-hidden="true">
          {CALENDAR_HOURS.map((hour) => (
            <div key={hour} className="calendar-hour">
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="calendar-lane">
          {CALENDAR_HOURS.slice(0, -1).map((hour) => (
            <div key={hour} className="calendar-line" />
          ))}
          {entries.map((entry) => (
            <article
              key={entry.id}
              className={`calendar-event ${entry.type}`}
              style={entry.style}
            >
              <strong>{entry.title}</strong>
              <span>
                {entry.start}-{entry.end}
                {entry.type === "plan" ? ` · ${entry.progressPercent}%` : ""}
              </span>
            </article>
          ))}
          {!entries.length && (
            <p className="calendar-empty">
              이 날짜에 표시할 고정 일정이나 생성된 플랜이 아직 없습니다.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Card({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function DashboardSummary({ selectedDate, fixedEvents, tasks, schedule }) {
  const selectedFixedEvents = fixedEvents.filter((event) => event.date === selectedDate);
  const selectedDueTasks = tasks.filter((task) => task.dueDate === selectedDate);
  const selectedPlanItems = (schedule?.plan ?? []).filter(
    (item) => item.date === selectedDate && item.status !== "unscheduled"
  );
  const issueCount = schedule?.validation?.issues?.length ?? 0;

  return (
    <section className="summary-strip" aria-label="선택 날짜 요약">
      <SummaryCard label="선택 날짜" value={selectedDate} detail="현재 보고 있는 하루" />
      <SummaryCard
        label="고정 일정"
        value={`${selectedFixedEvents.length}개`}
        detail={selectedFixedEvents.length ? "시간표에 먼저 반영" : "등록된 일정 없음"}
      />
      <SummaryCard
        label="마감 할 일"
        value={`${selectedDueTasks.length}개`}
        detail={selectedDueTasks.length ? "오늘 우선 확인" : "오늘 마감 없음"}
      />
      <SummaryCard
        label="플랜 상태"
        value={schedule ? `${selectedPlanItems.length}개` : "대기"}
        detail={
          schedule
            ? issueCount
              ? `검증 이슈 ${issueCount}개`
              : "검증 통과"
            : "플랜 설정에서 생성"
        }
        tone={schedule && issueCount ? "warning" : "default"}
      />
    </section>
  );
}

function SummaryCard({ label, value, detail, tone = "default" }) {
  return (
    <article className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function CloudReadinessPanel({ health, healthError }) {
  const documentAction = health?.documentAction;
  const cloud = health?.cloud;
  const ai = health?.ai;
  const cosmosReady = documentAction?.storageBackend === "cosmos";
  const azureReady = Boolean(cloud?.azureAppService);
  const statusClass = cosmosReady ? "success" : healthError ? "danger" : "pending";
  const statusLabel = cosmosReady ? "Cosmos 연결" : healthError ? "확인 실패" : "확인 중";

  return (
    <section className="card cloud-readiness-card">
      <div className="validation-topline">
        <div>
          <p className="eyebrow dark">Judge-ready cloud check</p>
          <h2>심사용 Azure·AI 상태</h2>
        </div>
        <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
      </div>

      {healthError ? (
        <p className="alert warning">헬스체크 확인 실패: {healthError}</p>
      ) : (
        <div className="summary-strip cloud-summary-strip">
          <SummaryCard
            label="호스팅"
            value={azureReady ? "Azure App Service" : "Local"}
            detail={azureReady ? "공개 배포 URL에서 실행 중" : "로컬 개발 서버"}
          />
          <SummaryCard
            label="저장소"
            value={documentAction?.storageBackend || "확인 중"}
            detail={
              cosmosReady
                ? `인증: ${documentAction.cosmosAuthMode}`
                : "Cosmos DB 연결 전"
            }
            tone={cosmosReady ? "default" : "warning"}
          />
          <SummaryCard
            label="AI 안전장치"
            value="검증 우선"
            detail="Copilot 실패 시 deterministic plan 반환"
          />
          <SummaryCard
            label="Copilot SDK"
            value={ai?.provider || "copilot-sdk"}
            detail={`타임아웃 ${ai?.timeoutMs ?? 45000}ms`}
          />
        </div>
      )}

      <div className="judge-proof-list">
        <span>데모 증거</span>
        <ul>
          <li>청구서 마감일은 문서 액션에서 RoutineFit 캘린더 일정으로 연결됩니다.</li>
          <li>Cosmos DB는 `/userId` 파티션과 중복 키로 저장/조회 무결성을 유지합니다.</li>
          <li>AI 설명은 서버 검증 결과를 기반으로 생성되어 환각 위험을 줄입니다.</li>
        </ul>
      </div>
    </section>
  );
}

function ValidationPanel({ schedule }) {
  const issues = schedule.validation.issues;
  const valid = schedule.validation.valid;

  return (
    <section className="card validation-card">
      <div className="validation-topline">
        <div>
          <p className="eyebrow dark">Validation</p>
          <h2>플랜 검증</h2>
        </div>
        <span className={`status-pill ${valid ? "success" : "danger"}`}>
          {valid ? "통과" : `${issues.length}개 이슈`}
        </span>
      </div>

      <div className="validation-metrics">
        <SummaryCard
          label="무결성"
          value={valid ? "안정" : "확인 필요"}
          detail={valid ? "겹침 없이 배치됨" : "아래 이슈 확인"}
          tone={valid ? "default" : "warning"}
        />
        <SummaryCard
          label="검증 이슈"
          value={`${issues.length}개`}
          detail={issues.length ? "수정 또는 재생성 필요" : "발견된 문제 없음"}
          tone={issues.length ? "warning" : "default"}
        />
      </div>

      {issues.length ? (
        <ul className="issue-list">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">발견된 무결성 문제가 없습니다.</p>
      )}

      {schedule.aiSummary && (
        <div className="ai-summary-box">
          <span>AI 요약</span>
          <p>{schedule.aiSummary}</p>
        </div>
      )}
    </section>
  );
}

function ProgressEditor({ item, selectedDate, value, onChange }) {
  const canEditProgress = item.date === selectedDate && item.status !== "unscheduled";

  return (
    <div className="progress-control">
      <span>진행률 {value}%</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        disabled={!canEditProgress}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min="0"
        max="100"
        step="5"
        value={value}
        disabled={!canEditProgress}
        onChange={(event) => onChange(clampPercent(Number(event.target.value)))}
      />
      {!canEditProgress && (
        <small className="muted">
          현재 보고 있는 날짜({selectedDate})의 플랜만 진행률을 수정할 수 있습니다.
        </small>
      )}
    </div>
  );
}

function buildCalendarEntries(date, fixedEvents, unavailableBlocks, plan, progress) {
  const fixedEntries = fixedEvents
    .filter((event) => event.date === date)
    .map((event) => createCalendarEntry({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      type: "fixed"
    }));
  const unavailableEntries = unavailableBlocks
    .filter((block) => block.date === date)
    .map((block) => createCalendarEntry({
      id: block.id,
      title: block.label || block.reason,
      start: block.start,
      end: block.end,
      type: block.source === "meal-pattern" ? "meal" : "blocked"
    }));
  const planEntries = plan
    .filter((item) => item.date === date && item.start && item.end)
    .map((item) =>
      createCalendarEntry({
        id: item.id,
        title: item.title,
        start: item.start,
        end: item.end,
        type: "plan",
        progressPercent: Number(progress[item.id] || 0)
      })
    );

  return [...unavailableEntries, ...fixedEntries, ...planEntries].sort(
    (left, right) => parseTimeToMinutes(left.start) - parseTimeToMinutes(right.start)
  );
}

function createCalendarEntry({ id, title, start, end, type, progressPercent = 0 }) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  const top = ((startMinutes - CALENDAR_START_MINUTES) / 60) * CALENDAR_PIXELS_PER_HOUR;
  const height = Math.max(
    32,
    ((endMinutes - startMinutes) / 60) * CALENDAR_PIXELS_PER_HOUR
  );

  return {
    id,
    title,
    start,
    end,
    type,
    progressPercent,
    style: {
      top: `${Math.max(0, top)}px`,
      height: `${height}px`
    }
  };
}

function parseTimeToMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function mergePlanHistoryRecords(planHistory, newRecords) {
  const recordByPlanItem = new Map(
    planHistory
      .filter((record) => record.planItemId)
      .map((record) => [record.planItemId, record])
  );
  const untouchedRecords = planHistory.filter((record) => !record.planItemId);

  for (const record of newRecords) {
    recordByPlanItem.set(record.planItemId, record);
  }

  return [...untouchedRecords, ...recordByPlanItem.values()];
}

function buildPlanHistorySummaries(planHistory) {
  return [...planHistory]
    .sort((left, right) => `${right.date || ""}${right.start || ""}`.localeCompare(`${left.date || ""}${left.start || ""}`))
    .slice(0, 8)
    .map((record) => ({
      id: record.id,
      summary: `${record.label} · 진행률 ${record.progressPercent ?? 0}%`,
      detail: `${record.date || "날짜 없음"} ${record.start}-${record.end} · 남은 ${record.remainingMinutes ?? 0}분`
    }));
}

function buildHistoryPatternSummaries(historyRecords) {
  const summaries = [
    ...buildMealPatternSummaries(historyRecords),
    ...buildRoutinePatternSummaries(historyRecords)
  ];

  return summaries.sort((left, right) => left.startMinutes - right.startMinutes);
}

function buildMealPatternSummaries(historyRecords) {
  const groups = groupBy(
    historyRecords.filter((record) => record.type === "meal" && record.start),
    (record) => record.label
  );

  return Object.entries(groups).map(([label, records]) => {
    const startMinutes = average(
      records.map((record) => parseTimeToMinutes(record.start))
    );
    const endMinutes = average(
      records.map((record) => parseTimeToMinutes(record.start) + Number(record.durationMinutes || 0))
    );
    const displayLabel = MEAL_PATTERN_LABELS[label] || label;

    return {
      id: `meal-pattern-${label}`,
      startMinutes,
      summary: formatPatternSummary(displayLabel, startMinutes, endMinutes),
      detail: `식사 패턴 · ${records.length}회 기록`
    };
  });
}

function buildRoutinePatternSummaries(historyRecords) {
  const groups = groupBy(
    historyRecords.filter((record) => record.type === "routine" && record.start && record.end),
    (record) => record.label
  );

  return Object.entries(groups).map(([label, records]) => {
    const startMinutes = average(
      records.map((record) => parseTimeToMinutes(record.start))
    );
    const endMinutes = average(
      records.map((record) => parseTimeToMinutes(record.end))
    );

    return {
      id: `routine-pattern-${label}`,
      startMinutes,
      summary: formatPatternSummary(label, startMinutes, endMinutes),
      detail: `루틴 패턴 · ${records.length}회 기록`
    };
  });
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    return {
      ...groups,
      [key]: [...(groups[key] || []), item]
    };
  }, {});
}

function average(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatPatternSummary(label, startMinutes, endMinutes) {
  return `${label}${topicMarker(label)} 보통 ${formatMinutes(startMinutes)}에서 ${formatMinutes(endMinutes)} 사이`;
}

function formatMinutes(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function topicMarker(label) {
  const lastCharacter = String(label).trim().at(-1);
  if (!lastCharacter) {
    return "는";
  }

  const code = lastCharacter.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) {
    return "는";
  }

  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}

function buildRemainingWork(plan, progress) {
  return plan
    .filter((item) => item.status !== "unscheduled" && item.start && item.end)
    .map((item) => {
      const progressPercent = clampPercent(Number(progress[item.id] || 0));

      return {
        planItemId: item.id,
        taskId: item.taskId,
        title: item.title,
        progressPercent,
        remainingMinutes: calculateRemainingMinutes(item, progressPercent)
      };
    })
    .filter((item) => item.remainingMinutes > 0);
}

function calculateRemainingMinutes(item, progressPercent) {
  return Math.round(
    ((parseTimeToMinutes(item.end) - parseTimeToMinutes(item.start)) *
      (100 - progressPercent)) /
      100
  );
}

function buildMonthDays(selectedDate) {
  const selected = parseDateKey(selectedDate);
  const firstDay = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());
  const totalDays = 42;

  return Array.from({ length: totalDays }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);

    return {
      date: formatDateKey(current),
      dayOfMonth: current.getDate(),
      inMonth: current.getMonth() === selected.getMonth()
    };
  });
}

function getDaySummaries(date, fixedEvents, tasks, plan) {
  const fixedCount = fixedEvents.filter((event) => event.date === date).length;
  const dueCount = tasks.filter((task) => task.dueDate === date).length;
  const planCount = plan.filter(
    (item) => item.date === date && item.status !== "unscheduled"
  ).length;
  const summaries = [];

  if (fixedCount) {
    summaries.push(`일정 ${fixedCount}`);
  }
  if (dueCount) {
    summaries.push(`할 일 ${dueCount}`);
  }
  if (planCount) {
    summaries.push(`플랜 ${planCount}`);
  }

  return summaries;
}

function formatMonthLabel(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ItemList({ items, renderItem, emptyText = "아직 데이터가 없습니다." }) {
  if (!items.length) {
    return <p className="muted">{emptyText}</p>;
  }

  return (
    <ul className="item-list">
      {items.map((item) => (
        <li key={item.id || `${item.date}-${item.start}-${item.title}`}>
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}

function progressToStatus(progressPercent) {
  if (progressPercent >= 100) {
    return "completed";
  }

  if (progressPercent <= 0) {
    return "missed";
  }

  return "partial";
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

createRoot(document.getElementById("root")).render(<App />);
