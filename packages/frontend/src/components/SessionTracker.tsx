import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveProductivityFromDuration } from "@dsa/intelligence";
import { api } from "../api/client.js";
import type { Problem, Session, Topic } from "../types/api.js";

interface Props {
  topics: Topic[];
  problems: Problem[];
  sessions: Session[];
  onLogged: () => void;
}

const SESSION_STEPS = [
  { id: "warmup", label: "Warm-up" },
  { id: "focus", label: "Focus" },
  { id: "capture", label: "Capture" },
  { id: "done", label: "Done" },
] as const;

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function SessionTracker({ topics, problems, sessions, onLogged }: Props) {
  const [topicId, setTopicId] = useState("");
  const [problemId, setProblemId] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [showSetup, setShowSetup] = useState(true);

  const topicProblems = useMemo(
    () => problems.filter((p) => p.topicId === topicId),
    [problems, topicId],
  );

  const selectedTopic = topics.find((t) => t.id === topicId);
  const selectedProblem = problems.find((p) => p.id === problemId);

  const topicName = useCallback(
    (id: string | null) => topics.find((t) => t.id === id)?.name ?? "Unknown",
    [topics],
  );

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const minutes = Math.max(1, Math.round(elapsed / 60) || 1);
  const productivity = deriveProductivityFromDuration(minutes);

  const todaySessions = sessions.filter((s) => isToday(s.date));
  const solvedToday = todaySessions.reduce((sum, s) => sum + (s.problemsSolved ?? 0), 0);

  const displayName =
    selectedProblem?.name ?? selectedTopic?.name ?? "Pick a topic to begin";

  const targetMinutes = selectedTopic?.averageTimeTaken
    ? Math.max(15, Math.round(selectedTopic.averageTimeTaken))
    : 25;

  const difficultyLabel = selectedProblem?.difficulty ?? selectedTopic?.difficulty ?? "—";

  const handleStart = () => {
    if (!topicId) {
      setMessage({ text: "Select a topic first.", ok: false });
      setShowSetup(true);
      return;
    }
    setShowSetup(false);
    setRunning(true);
    setMessage(null);
  };

  const handleSubmit = async () => {
    if (!topicId) {
      setMessage({ text: "Pick a topic before logging.", ok: false });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setRunning(false);
    try {
      const result = await api.logSession({
        topicId,
        problemId: problemId || undefined,
        problemsSolved: problemId ? 1 : Math.max(1, Math.round(minutes / 30)),
        studyDuration: minutes,
        pushToNotion: false,
      });
      setMessage({
        text: `Logged! ${topicName(topicId)} · ${productivity}/100 productivity · confidence ${result.confidence}/100`,
        ok: true,
      });
      setElapsed(0);
      elapsedRef.current = 0;
      onLogged();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to log session",
        ok: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const focusStep = running || elapsed > 0 ? 1 : showSetup ? 0 : 1;

  return (
    <>
      <div className="session-focus-strip" role="group" aria-label="Session progress">
        {SESSION_STEPS.map((step, i) => (
          <div key={step.id} className="session-focus-strip-item">
            {i > 0 && <span className="session-focus-strip-line" aria-hidden />}
            <span
              className={`session-focus-step${
                i < focusStep ? " session-focus-step--done" : ""
              }${i === focusStep ? " session-focus-step--current" : ""}`}
            >
              <span className="session-focus-dot" aria-hidden />
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {showSetup && (
        <section className="panel-v2 session-setup" style={{ marginBottom: "1.4rem" }}>
          <div className="form-row m-0">
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
              Problem <span className="muted text-xs">(optional)</span>
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
          <button
            type="button"
            className="btn-primary-v2"
            style={{ marginTop: "0.75rem" }}
            disabled={!topicId}
            onClick={handleStart}
          >
            Begin focus
          </button>
        </section>
      )}

      <section className="session-hero">
        <div className="session-hero-glow" aria-hidden />
        <div className="session-hero-body">
          <div className="session-hero-kicker">Now solving</div>
          <div className="session-hero-problem">{displayName}</div>
          <div className="session-timer-display">{formatTimer(elapsed)}</div>
          <div className="session-hero-meta">
            target ~{targetMinutes} min · {difficultyLabel}
          </div>
          <div className="session-hero-actions">
            <button
              type="button"
              className="btn-secondary-v2"
              style={{ padding: "0.7rem 1.4rem", fontSize: "0.9rem" }}
              onClick={() => setRunning((r) => !r)}
              disabled={!topicId}
            >
              {running ? "Pause" : elapsed > 0 ? "Resume" : "Start timer"}
            </button>
            <button
              type="button"
              className="btn-primary-v2"
              style={{ padding: "0.7rem 1.6rem", fontSize: "0.9rem" }}
              disabled={submitting || !topicId || elapsed < 60}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Saving…" : "✓ Log & finish"}
            </button>
          </div>
          {!showSetup && (
            <button
              type="button"
              className="btn-ghost-v2"
              style={{ marginTop: "0.9rem", fontSize: "0.75rem" }}
              onClick={() => setShowSetup(true)}
            >
              Change topic / problem
            </button>
          )}
        </div>
      </section>

      {message && (
        <div className={`${message.ok ? "success-banner" : "error-banner"} mt-3`}>
          {message.text}
        </div>
      )}

      <div className="session-stats-row">
        <div className="session-stat-card">
          <div className="session-stat-label">Warm-up</div>
          <div className="session-stat-value session-stat-value--success">—</div>
        </div>
        <div className="session-stat-card">
          <div className="session-stat-label">Mistakes</div>
          <div className="session-stat-value">—</div>
        </div>
        <div className="session-stat-card">
          <div className="session-stat-label">Solved today</div>
          <div className="session-stat-value">
            {solvedToday} problem{solvedToday === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </>
  );
}
