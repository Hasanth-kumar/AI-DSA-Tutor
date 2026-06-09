import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../api/client.js";
import { SessionTimer } from "./SessionTimer.js";
import type { Problem, Session, Topic } from "../types/api.js";

interface Props {
  topics: Topic[];
  problems: Problem[];
  sessions: Session[];
  onLogged: () => void;
}

function productivityLabel(value: number): string {
  if (value >= 90) return "In the zone";
  if (value >= 70) return "Good focus";
  if (value >= 50) return "Moderate";
  if (value >= 30) return "Distracted";
  return "Tough session";
}

export function SessionTracker({ topics, problems, sessions, onLogged }: Props) {
  const [topicId, setTopicId] = useState("");
  const [problemId, setProblemId] = useState("");
  const [productivity, setProductivity] = useState(75);
  const elapsedRef = useRef(0);
  const [timerKey, setTimerKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const topicProblems = useMemo(
    () => problems.filter((p) => p.topicId === topicId),
    [problems, topicId],
  );

  const topicName = useCallback(
    (id: string | null) => topics.find((t) => t.id === id)?.name ?? "Unknown",
    [topics],
  );

  const handleSubmit = async () => {
    if (!topicId) {
      setMessage({ text: "Pick a topic before logging.", ok: false });
      return;
    }
    const minutes = Math.max(1, Math.round(elapsedRef.current / 60) || 1);

    setSubmitting(true);
    setMessage(null);
    try {
      const result = await api.logSession({
        topicId,
        problemId: problemId || undefined,
        problemsSolved: problemId ? 1 : Math.max(1, Math.round(minutes / 30)),
        studyDuration: minutes,
        productivityScore: productivity,
        pushToNotion: false,
      });
      setMessage({ text: `Logged! ${topicName(topicId)} · confidence now ${result.confidence}/100`, ok: true });
      elapsedRef.current = 0;
      setTimerKey((key) => key + 1);
      onLogged();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Failed to log session", ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-2">
      <div className="card">
        {/* Step 1 */}
        <div className="step-group">
          <div className="step-group-title">
            <span className="step-number">1</span>
            What are you studying?
          </div>
          <div className="form-row" style={{ margin: 0 }}>
            <label>
              Topic
              <select
                value={topicId}
                onChange={(e) => {
                  setTopicId(e.target.value);
                  setProblemId("");
                }}
              >
                <option value="">Select a topic…</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Problem <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span>
              <select
                value={problemId}
                onChange={(e) => setProblemId(e.target.value)}
                disabled={!topicId}
              >
                <option value="">General practice</option>
                {topicProblems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.difficulty ?? "?"})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Step 2 — Timer */}
        <div className="step-group">
          <div className="step-group-title">
            <span className="step-number">2</span>
            Track your time
          </div>

          <SessionTimer key={timerKey} elapsedRef={elapsedRef} />
        </div>

        {/* Step 3 — Rate + Log */}
        <div className="step-group">
          <div className="step-group-title">
            <span className="step-number">3</span>
            How focused were you?
          </div>

          <div style={{ padding: "0.5rem 0 0.75rem" }}>
            <div className="productivity-row">
              <span>Productivity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={productivity}
                onChange={(e) => setProductivity(Number(e.target.value))}
              />
              <span className="productivity-value">{productivity}%</span>
            </div>
            <div style={{ textAlign: "center", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
              {productivityLabel(productivity)}
            </div>
          </div>

          <button
            className="btn btn-primary"
            type="button"
            style={{ width: "100%", justifyContent: "center", padding: "0.65rem" }}
            onClick={() => void handleSubmit()}
            disabled={submitting || !topicId}
          >
            {submitting ? "Saving…" : "Log session"}
          </button>
        </div>

        {message && (
          <div className={message.ok ? "success-banner" : "error-banner"} style={{ marginTop: "0.5rem" }}>
            {message.text}
          </div>
        )}
      </div>

      {/* Recent sessions */}
      <div className="card">
        <h3>Recent sessions</h3>
        {sessions.length === 0 ? (
          <div style={{ padding: "2rem 0", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem", opacity: 0.3 }}>⏱</div>
            <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
              No sessions yet — start your first timer above.
            </p>
          </div>
        ) : (
          <ul className="session-list">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id} className="session-item">
                <div>
                  <div className="session-item-topic">{topicName(s.topicId)}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div className="session-item-meta">
                  <span className="session-duration-badge">{s.studyDuration ?? 0}m</span>
                  <span style={{ color: s.productivityScore >= 70 ? "var(--success)" : "var(--text-muted)" }}>
                    {s.productivityScore}/100
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
