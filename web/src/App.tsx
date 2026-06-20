import { useEffect, useMemo, useState } from "react";
import {
  processDocument,
  getSummary,
  getReminders,
  type ProcessResult,
  type Summary,
  type Reminder,
} from "./api";

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

const TYPE_META: Record<
  string,
  { icon: string; label: string; tone: string }
> = {
  receipt: { icon: "🧾", label: "영수증", tone: "receipt" },
  bill: { icon: "📨", label: "청구서", tone: "bill" },
  contract: { icon: "📑", label: "계약서", tone: "contract" },
  other: { icon: "📄", label: "기타 문서", tone: "other" },
};

function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

/** Days until a YYYY-MM-DD date (today = 0). */
function daysUntil(dateStr: string): number | null {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function ddayLabel(dateStr: string): string {
  const d = daysUntil(dateStr);
  if (d === null) return "";
  if (d === 0) return "D-DAY";
  if (d < 0) return `D+${Math.abs(d)}`;
  return `D-${d}`;
}

/** Render a string with **bold** segments and line breaks as React nodes. */
function renderRich(text: string) {
  return text.split("\n").map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <span key={li} className="rich-line">
        {parts.map((p, pi) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={pi}>{p.slice(2, -2)}</strong>
          ) : (
            <span key={pi}>{p}</span>
          )
        )}
      </span>
    );
  });
}

export default function App() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  async function refresh() {
    setSummary(await getSummary());
    setReminders(await getReminders());
  }

  useEffect(() => {
    refresh();
  }, []);

  const maxCategory = useMemo(() => {
    if (!summary) return 0;
    return Math.max(1, ...Object.values(summary.byCategory));
  }, [summary]);

  const sortedReminders = useMemo(
    () => [...reminders].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [reminders]
  );

  async function onSubmit() {
    setError(null);
    setResult(null);
    if (!text.trim() && !file) {
      setError("문서 텍스트를 입력하거나 파일을 선택하세요.");
      return;
    }
    setLoading(true);
    try {
      const r = await processDocument({ text: text.trim() || undefined, file });
      setResult(r);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
    } finally {
      setLoading(false);
    }
  }

  const meta = result ? TYPE_META[result.documentType] ?? TYPE_META.other : null;

  return (
    <div className="app">
      <div className="bg-orbs" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>

      <header className="hero">
        <div className="hero-badge">
          <span className="pulse" /> Powered by GitHub Copilot SDK
        </div>
        <h1>
          문서 <span className="grad">액션 에이전트</span>
        </h1>
        <p className="tagline">
          영수증·청구서·계약서를 올리면 AI 에이전트가 스스로 분류하고
          <br />
          기록·분석·리마인드·초안 작성까지 <b>알아서 처리</b>합니다.
        </p>
      </header>

      <main className="layout">
        <div className="col-main">
          <section className="card input-card">
            <div className="card-head">
              <h2>📥 문서 입력</h2>
              <span className="hint">텍스트 붙여넣기 또는 이미지 업로드</span>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="영수증 / 청구서 / 계약서 내용을 붙여넣으세요..."
              rows={8}
            />

            <div className="samples">
              <span className="samples-label">빠른 예시</span>
              <button onClick={() => setText(SAMPLE_RECEIPT)} type="button">
                🧾 영수증
              </button>
              <button onClick={() => setText(SAMPLE_BILL)} type="button">
                📨 청구서
              </button>
              <button onClick={() => setText(SAMPLE_CONTRACT)} type="button">
                📑 계약서
              </button>
            </div>

            <label className="dropzone">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className="dz-icon">📎</span>
              <span className="dz-text">
                {file ? file.name : "이미지 / PDF 첨부 (선택)"}
              </span>
            </label>

            <button
              className="primary"
              onClick={onSubmit}
              disabled={loading}
              type="button"
            >
              {loading ? (
                <>
                  <span className="spinner" /> AI가 처리 중...
                </>
              ) : (
                <>✨ AI에게 맡기기</>
              )}
            </button>
            {error && <p className="error">⚠️ {error}</p>}
          </section>

          {loading && !result && (
            <section className="card skeleton-card">
              <div className="sk sk-badge" />
              <div className="sk sk-line" />
              <div className="sk sk-line short" />
              <div className="sk sk-line" />
            </section>
          )}

          {result && meta && (
            <section className="card result-card">
              <div className="result-head">
                <span className={`badge badge-${meta.tone}`}>
                  <span className="badge-icon">{meta.icon}</span>
                  {meta.label}
                </span>
                <h2>처리 결과</h2>
              </div>

              <p className="summary">{renderRich(result.summary)}</p>

              {result.steps.length > 0 && (
                <div className="steps">
                  <h3>🤖 AI가 수행한 작업</h3>
                  <ol className="timeline">
                    {result.steps.map((s, i) => (
                      <li key={i}>
                        <span className="tl-dot" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="result-grid">
                {result.expense && (
                  <div className="detail">
                    <h3>💸 지출 기록</h3>
                    <p className="detail-main">{won(result.expense.total)}</p>
                    <p className="detail-sub">
                      {result.expense.merchant} · {result.expense.category} ·{" "}
                      {result.expense.date}
                    </p>
                  </div>
                )}

                {result.reminder && (
                  <div className="detail">
                    <h3>⏰ 리마인드</h3>
                    <p className="detail-main">{result.reminder.dueDate}</p>
                    <p className="detail-sub">
                      {result.reminder.title}
                      {result.reminder.amount
                        ? ` · ${won(result.reminder.amount)}`
                        : ""}
                    </p>
                  </div>
                )}
              </div>

              {result.draftMessage && (
                <div className="detail">
                  <h3>✍️ 작성된 초안</h3>
                  <pre className="draft">{result.draftMessage}</pre>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="col-side">
          <section className="card dashboard-card">
            <div className="card-head">
              <h2>📊 이번 달 요약</h2>
            </div>
            {summary && (
              <>
                <div className="total-box">
                  <span className="total-label">총 지출</span>
                  <span className="total-amount">{won(summary.total)}</span>
                  <span className="total-count">{summary.count}건</span>
                </div>
                {Object.keys(summary.byCategory).length === 0 ? (
                  <p className="muted">아직 기록된 지출이 없습니다.</p>
                ) : (
                  <ul className="categories">
                    {Object.entries(summary.byCategory)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt]) => (
                        <li key={cat}>
                          <div className="cat-row">
                            <span className="cat-name">{cat}</span>
                            <span className="cat-amt">{won(amt)}</span>
                          </div>
                          <div className="cat-bar">
                            <div
                              className="cat-fill"
                              style={{ width: `${(amt / maxCategory) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="card dashboard-card">
            <div className="card-head">
              <h2>🗓️ 다가오는 마감</h2>
            </div>
            {sortedReminders.length === 0 ? (
              <p className="muted">등록된 리마인드가 없습니다.</p>
            ) : (
              <ul className="reminders">
                {sortedReminders.map((r) => {
                  const d = daysUntil(r.dueDate);
                  const urgent = d !== null && d <= 3;
                  return (
                    <li key={r.id}>
                      <div className="rem-main">
                        <span className="rem-title">{r.title}</span>
                        <span className="rem-date">{r.dueDate}</span>
                      </div>
                      <span className={`dday ${urgent ? "dday-urgent" : ""}`}>
                        {ddayLabel(r.dueDate)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </main>

      <footer className="foot">문서 액션 에이전트 · Copilot SDK + Azure</footer>
    </div>
  );
}
