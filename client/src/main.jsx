import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { generatePlan, generateReview } from "./api.js";
import { createDemoData } from "./demoData.js";
import "./style.css";

const STORAGE_KEY = "routinefit-state-v1";

function loadInitialState() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }

  return createDemoData();
}

function saveState(nextState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  return nextState;
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
    durationMinutes: 30,
    priority: "medium",
    dueDate: state.planningStartDate,
    dueLabel: ""
  });
  const [schedule, setSchedule] = useState(null);
  const [review, setReview] = useState(null);
  const [planStatuses, setPlanStatuses] = useState({});
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const payload = useMemo(
    () => ({
      planningStartDate: state.planningStartDate,
      fixedEvents: state.fixedEvents,
      tasks: state.tasks,
      historyRecords: state.historyRecords
    }),
    [state]
  );

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

    updateState((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          ...newTask,
          id: createId("task"),
          title: newTask.title.trim(),
          durationMinutes: Number(newTask.durationMinutes)
        }
      ]
    }));
    setNewTask((current) => ({ ...current, title: "", dueLabel: "" }));
    setError("");
  }

  async function handleGeneratePlan() {
    setLoading("plan");
    setError("");
    setReview(null);
    try {
      const result = await generatePlan(payload);
      setSchedule(result);
      setPlanStatuses(
        Object.fromEntries(result.plan.map((item) => [item.id, "pending"]))
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
        plan: schedule.plan,
        statuses: planStatuses,
        validation: schedule.validation
      });
      setReview(result);
      appendPlanHistory(schedule.plan, planStatuses);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading("");
    }
  }

  function appendPlanHistory(plan, statuses) {
    const completedRecords = plan
      .filter((item) => item.status !== "unscheduled" && item.start && item.end)
      .map((item) => ({
        id: createId("history"),
        planItemId: item.id,
        date: item.date,
        type: "plan",
        label: item.title,
        start: item.start,
        end: item.end,
        status: statuses[item.id] || "pending"
      }));

    updateState((current) => ({
      ...current,
      historyRecords: mergePlanHistory(current.historyRecords, completedRecords)
    }));
  }

  function resetDemo() {
    const demo = createDemoData();
    setState(saveState(demo));
    setSchedule(null);
    setReview(null);
    setPlanStatuses({});
    setError("");
  }

  function mergePlanHistory(historyRecords, newRecords) {
    const recordByPlanItem = new Map(
      historyRecords
        .filter((record) => record.planItemId)
        .map((record) => [record.planItemId, record])
    );
    const untouchedRecords = historyRecords.filter((record) => !record.planItemId);

    for (const record of newRecords) {
      recordByPlanItem.set(record.planItemId, record);
    }

    return [...untouchedRecords, ...recordByPlanItem.values()];
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">웹 전용 생산성 코치</p>
        <h1>RoutineFit AI Scheduler</h1>
        <p>
          캘린더 일정, 할 일, 과거 패턴을 기반으로 비워둬야 할 시간을
          피하고 마감 일정 안에 완료 가능한 플랜을 생성합니다.
        </p>
        <div className="hero-actions">
          <button onClick={handleGeneratePlan} disabled={loading === "plan"}>
            {loading === "plan" ? "플랜 생성 중..." : "AI 플랜 생성"}
          </button>
          <button className="secondary" onClick={resetDemo}>
            데모 데이터 초기화
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {schedule?.aiError && (
        <div className="alert warning">
          Copilot SDK 호출 실패: {schedule.aiError}. 검증된 로컬 플랜을
          표시합니다.
        </div>
      )}

      <section className="grid">
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
              <input
                type="number"
                min="10"
                step="5"
                value={newTask.durationMinutes}
                onChange={(event) =>
                  setNewTask({
                    ...newTask,
                    durationMinutes: event.target.value
                  })
                }
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
            <button type="submit">할 일 추가</button>
          </form>
          <ItemList
            items={state.tasks}
            renderItem={(item) => (
              <>
                <strong>{item.title}</strong>
                <span>
                  {item.durationMinutes}분 · {item.priority} ·{" "}
                  {item.dueLabel || item.dueDate}
                </span>
              </>
            )}
          />
        </Card>

        <Card title="과거 패턴 데이터">
          <p className="muted">
            현재 플랜 입력이 아니라 이전 기록에서 식사와 비가용 패턴을
            인식합니다. 완료 리뷰 후 기록이 자동 누적됩니다.
          </p>
          <ItemList
            items={state.historyRecords.slice(-8)}
            renderItem={(item) => (
              <>
                <strong>{item.label}</strong>
                <span>
                  {item.date} · {item.type} · {item.start}
                  {item.end ? `-${item.end}` : ""}
                </span>
              </>
            )}
          />
        </Card>
      </section>

      {schedule && (
        <section className="grid results">
          <Card title="인식된 비가용 시간">
            <ItemList
              items={schedule.unavailableBlocks}
              renderItem={(item) => (
                <>
                  <strong>{item.reason}</strong>
                  <span>
                    {item.date} {item.start}-{item.end}
                  </span>
                </>
              )}
            />
          </Card>

          <Card title="생성된 플랜">
            <ItemList
              items={schedule.plan}
              renderItem={(item) => (
                <>
                  <strong>{item.title}</strong>
                  <span>
                    {item.date} {item.start}-{item.end}
                  </span>
                  <select
                    value={planStatuses[item.id] || "pending"}
                    onChange={(event) =>
                      setPlanStatuses({
                        ...planStatuses,
                        [item.id]: event.target.value
                      })
                    }
                  >
                    <option value="pending">대기</option>
                    <option value="completed">완료</option>
                    <option value="partial">부분 완료</option>
                    <option value="missed">미완료</option>
                    <option value="skipped">건너뜀</option>
                  </select>
                </>
              )}
            />
            <button onClick={handleGenerateReview} disabled={loading === "review"}>
              {loading === "review" ? "리뷰 생성 중..." : "AI 실행 리뷰"}
            </button>
          </Card>

          <Card title="검증 결과">
            <p className={schedule.validation.valid ? "valid" : "invalid"}>
              {schedule.validation.valid
                ? "겹침 없이 검증된 플랜입니다."
                : "검증 이슈가 있습니다."}
            </p>
            <ItemList
              items={schedule.validation.issues}
              emptyText="발견된 무결성 문제가 없습니다."
              renderItem={(item) => <span>{item}</span>}
            />
            {schedule.aiSummary && (
              <p className="ai-summary">{schedule.aiSummary}</p>
            )}
          </Card>
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
    </main>
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

createRoot(document.getElementById("root")).render(<App />);
