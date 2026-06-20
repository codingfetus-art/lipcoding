import { useEffect, useMemo, useState } from "react";

const SAMPLE_RECEIPT = `스타벅스 강남R점
2026-06-19 14:32
아메리카노 T   4,500
카페라떼 T     5,500
합계          10,000
카드결제 신한 ****1234`;

const SAMPLE_BILL = `[SK텔레콤] 6월 이용요금 청구서
청구금액: 55,000원
납부기한: 2026-07-05
자동이체 미등록`;

const SAMPLE_CONTRACT = `부동산 월세 임대차 계약서
임대인: 김OO  임차인: 이OO
보증금: 10,000,000원 / 월세: 700,000원
계약기간: 2026-07-01 ~ 2027-06-30
특약: 만기 1개월 전 미통보 시 자동 갱신`;

const TYPE_META = {
  receipt: { icon: "🧾", label: "영수증", tone: "receipt" },
  bill: { icon: "📨", label: "청구서", tone: "bill" },
  contract: { icon: "📑", label: "계약서", tone: "contract" },
  other: { icon: "📄", label: "기타 문서", tone: "other" }
};

const EMPTY_SUMMARY = {
  total: 0,
  byCategory: {},
  count: 0
};

function won(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function daysUntil(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

function ddayLabel(dateStr) {
  const days = daysUntil(dateStr);
  if (days === null) {
    return "";
  }
  if (days === 0) {
    return "D-DAY";
  }
  return days < 0 ? `D+${Math.abs(days)}` : `D-${days}`;
}

function renderRich(text) {
  return text.split("\n").map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <span key={lineIndex} className="doc-rich-line">
        {parts.map((part, partIndex) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={partIndex}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={partIndex}>{part}</span>
          )
        )}
      </span>
    );
  });
}

async function postDocument({ text, file }) {
  const formData = new FormData();
  if (text) {
    formData.append("text", text);
  }
  if (file) {
    formData.append("file", file);
  }

  const response = await fetch("/api/process", {
    method: "POST",
    body: formData
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "문서 처리 실패");
  }
  return data;
}

async function readJsonResponse(response, fallbackMessage) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || fallbackMessage);
    error.code = data.code;
    throw error;
  }
  return data;
}

async function getSummary() {
  const response = await fetch("/api/summary");
  return readJsonResponse(response, "문서 요약 조회 실패");
}

async function getReminders() {
  const response = await fetch("/api/reminders");
  return readJsonResponse(response, "문서 리마인드 조회 실패");
}

async function getDocumentActionRuntime() {
  const response = await fetch("/api/health");
  const health = await readJsonResponse(response, "문서 액션 설정 확인 실패");
  return health.documentAction;
}

async function readSupportedFile(file) {
  if (!file) {
    return "";
  }

  const textLike =
    file.type.startsWith("text/") ||
    [".txt", ".md", ".csv", ".json"].some((extension) =>
      file.name.toLowerCase().endsWith(extension)
    );

  return textLike ? file.text() : "";
}

export default function DlsdydDocumentAgent({ onReminderCreated }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState("");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [reminders, setReminders] = useState([]);

  async function refresh() {
    const runtime = await getDocumentActionRuntime();
    if (runtime?.storageBackend !== "cosmos") {
      setStorageReady(false);
      setSummary(EMPTY_SUMMARY);
      setReminders([]);
      setStorageNotice(
        "문서 액션 저장소는 Azure Cosmos DB가 필요합니다. AZURE_COSMOS_ENDPOINT를 설정하고 Azure CLI 로그인 또는 Managed Identity 권한을 준비하세요."
      );
      return;
    }

    setStorageReady(true);
    const [summaryResult, remindersResult] = await Promise.allSettled([getSummary(), getReminders()]);
    const notices = [];

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
    } else {
      setSummary(EMPTY_SUMMARY);
      notices.push(summaryResult.reason.message);
    }

    if (remindersResult.status === "fulfilled") {
      setReminders(Array.isArray(remindersResult.value) ? remindersResult.value : []);
    } else {
      setReminders([]);
      notices.push(remindersResult.reason.message);
    }

    setStorageNotice([...new Set(notices)].join(" "));
  }

  useEffect(() => {
    refresh().catch((requestError) => setStorageNotice(requestError.message));
  }, []);

  const maxCategory = useMemo(() => {
    if (!summary) {
      return 0;
    }
    return Math.max(1, ...Object.values(summary.byCategory));
  }, [summary]);

  const sortedReminders = useMemo(
    () => [...reminders].sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
    [reminders]
  );

  async function handleSubmit() {
    setError("");
    setCalendarNotice("");
    setResult(null);
    const fileText = await readSupportedFile(file);
    const combinedText = [text.trim(), fileText.trim()].filter(Boolean).join("\n\n");

    if (!combinedText && !file) {
      setError("문서 텍스트를 입력하거나 파일을 선택하세요.");
      return;
    }

    setLoading(true);
    try {
      if (!storageReady) {
        throw new Error("Azure Cosmos DB 설정이 완료된 뒤 문서를 처리할 수 있습니다.");
      }

      const processed = await postDocument({
        text: combinedText || undefined,
        file
      });
      setResult(processed);
      if (processed.reminder && onReminderCreated) {
        const event = onReminderCreated(processed.reminder);
        if (event) {
          setCalendarNotice(
            `${event.date} ${event.start}-${event.end} 캘린더에 추가하고 기준 날짜를 마감일로 이동했습니다.`
          );
        }
      }
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const meta = result ? TYPE_META[result.documentType] ?? TYPE_META.other : null;
  const monthlyTotal = summary ? won(summary.total) : "0원";
  const reminderCount = sortedReminders.length;
  const processedLabel = meta ? meta.label : "대기 중";

  return (
    <section className="page-panel doc-agent">
      <div className="page-heading doc-page-heading">
        <div>
          <p className="eyebrow dark">Document action</p>
          <h2>문서 액션 에이전트</h2>
          <p className="muted">
            영수증·청구서·계약서를 처리하고, 납부기한과 계약 만기일은
            RoutineFit 캘린더에 연결합니다.
          </p>
        </div>
      </div>

      <div className="summary-strip doc-metric-strip">
        <article className="summary-card">
          <span>이번 달 지출</span>
          <strong>{monthlyTotal}</strong>
          <small>문서 액션에서 저장된 영수증 기준</small>
        </article>
        <article className="summary-card">
          <span>다가오는 마감</span>
          <strong>{reminderCount}건</strong>
          <small>청구서 납부기한과 계약 만기일</small>
        </article>
        <article className="summary-card">
          <span>최근 처리 문서</span>
          <strong>{processedLabel}</strong>
          <small>{result ? "마지막 처리 결과 기준" : "아직 처리 전입니다"}</small>
        </article>
      </div>

      {storageNotice && (
        <p className="doc-storage-notice">
          ⚙️ {storageNotice} Azure App Settings 또는 로컬 환경변수에 AZURE_COSMOS_ENDPOINT를
          설정하면 Cosmos DB 저장·조회가 활성화됩니다.
        </p>
      )}

      <div className="doc-layout">
        <div className="doc-main">
          <section className="doc-card doc-input-card">
            <div className="doc-card-head">
              <h3>📥 문서 입력</h3>
              <span>텍스트 붙여넣기 또는 파일 선택</span>
            </div>

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="영수증 / 청구서 / 계약서 내용을 붙여넣으세요..."
              rows="8"
            />

            <div className="doc-samples">
              <span>빠른 예시</span>
              <button type="button" onClick={() => setText(SAMPLE_RECEIPT)}>
                🧾 영수증
              </button>
              <button type="button" onClick={() => setText(SAMPLE_BILL)}>
                📨 청구서
              </button>
              <button type="button" onClick={() => setText(SAMPLE_CONTRACT)}>
                📑 계약서
              </button>
            </div>

            <label className="doc-dropzone">
              <input
                type="file"
                accept="image/*,application/pdf,text/*,.txt,.md,.csv,.json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span>📎</span>
              <strong>{file ? file.name : "이미지 / PDF / 텍스트 파일 첨부"}</strong>
            </label>

            <button className="doc-primary" onClick={handleSubmit} disabled={loading || !storageReady} type="button">
              {loading ? "AI가 처리 중..." : storageReady ? "✨ AI에게 맡기기" : "Cosmos DB 설정 필요"}
            </button>
            {error && <p className="doc-error">⚠️ {error}</p>}
            {calendarNotice && <p className="doc-success">✅ {calendarNotice}</p>}
          </section>

          {result && meta && (
            <section className="doc-card doc-result-card">
              <div className="doc-result-head">
                <span className={`doc-badge doc-badge-${meta.tone}`}>
                  <span>{meta.icon}</span>
                  {meta.label}
                </span>
                <h3>처리 결과</h3>
              </div>

              <p className="doc-summary">{renderRich(result.summary)}</p>

              {result.steps.length > 0 && (
                <div className="doc-steps">
                  <h4>🤖 AI가 수행한 작업</h4>
                  <ol>
                    {result.steps.map((step, index) => (
                      <li key={`${step}-${index}`}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="doc-result-grid">
                {result.expense && (
                  <div className="doc-detail">
                    <h4>💸 지출 기록</h4>
                    <strong>{won(result.expense.total)}</strong>
                    <span>
                      {result.expense.merchant} · {result.expense.category} · {result.expense.date}
                    </span>
                  </div>
                )}

                {result.reminder && (
                  <div className="doc-detail">
                    <h4>⏰ 리마인드</h4>
                    <strong>{result.reminder.dueDate}</strong>
                    <span>
                      {result.reminder.title}
                      {result.reminder.amount ? ` · ${won(result.reminder.amount)}` : ""}
                    </span>
                  </div>
                )}
              </div>

              {result.draftMessage && (
                <div className="doc-detail">
                  <h4>✍️ 작성된 초안</h4>
                  <pre>{result.draftMessage}</pre>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="doc-side">
          <section className="doc-card">
            <div className="doc-card-head">
              <h3>📊 이번 달 요약</h3>
            </div>
            {summary && (
              <>
                <div className="doc-total-box">
                  <span>총 지출</span>
                  <strong>{won(summary.total)}</strong>
                  <small>{summary.count}건</small>
                </div>
                {Object.keys(summary.byCategory).length === 0 ? (
                  <p className="doc-muted">아직 기록된 지출이 없습니다.</p>
                ) : (
                  <ul className="doc-categories">
                    {Object.entries(summary.byCategory)
                      .sort((left, right) => right[1] - left[1])
                      .map(([category, amount]) => (
                        <li key={category}>
                          <div>
                            <span>{category}</span>
                            <strong>{won(amount)}</strong>
                          </div>
                          <span style={{ width: `${(amount / maxCategory) * 100}%` }} />
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="doc-card">
            <div className="doc-card-head">
              <h3>🗓️ 다가오는 마감</h3>
            </div>
            {sortedReminders.length === 0 ? (
              <p className="doc-muted">등록된 리마인드가 없습니다.</p>
            ) : (
              <ul className="doc-reminders">
                {sortedReminders.map((reminder) => {
                  const days = daysUntil(reminder.dueDate);
                  const urgent = days !== null && days <= 3;
                  return (
                    <li key={reminder.id}>
                      <div>
                        <strong>{reminder.title}</strong>
                        <span>{reminder.dueDate}</span>
                      </div>
                      <em className={urgent ? "urgent" : ""}>{ddayLabel(reminder.dueDate)}</em>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
