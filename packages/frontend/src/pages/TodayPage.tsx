import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { CheckCircleIcon, EmptyState } from "../components/EmptyState.js";
import { MistakeCapture } from "../components/MistakeCapture.js";
import { ProblemNotePanel } from "../components/ProblemNotePanel.js";
import { ScoreBar } from "../components/ScoreBar.js";
import { Skeleton, SkeletonLines, SkeletonRows } from "../components/Skeleton.js";
import { WarmupCard } from "../components/WarmupCard.js";
import { usePolling } from "../hooks/usePolling.js";
import type {
  ProblemNote,
  ScoreExplanation,
  Session,
  Topic,
} from "../types/api.js";

const PLAN_POLL_MS = 60_000;
const SESSIONS_POLL_MS = 60_000;
const STARTS_STORAGE_KEY = "dsa-problem-starts";
/** Fallback when "Done" is hit without ever pressing Start. */
const DEFAULT_MINUTES = 25;

interface Props {
  onOpenCoach: (problemId: string) => void;
}

type Flow =
  | { kind: "idle" }
  | { kind: "warmup" }
  | { kind: "mistake"; attemptId: string; problemId: string; problemName: string }
  | { kind: "note-offer"; problemId: string; problemName: string };

function loadStarts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STARTS_STORAGE_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

function saveStarts(starts: Record<string, number>): void {
  localStorage.setItem(STARTS_STORAGE_KEY, JSON.stringify(starts));
}

function sessionsThisMonth(sessions: Session[]): number {
  const now = new Date();
  return sessions.filter((s) => {
    const d = new Date(s.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
}

export function TodayPage({ onOpenCoach }: Props) {
  const fetchPlan = useCallback(() => api.getPlan(), []);
  const { data: plan, error, loading, refresh } = usePolling(fetchPlan, PLAN_POLL_MS);

  const fetchSessions = useCallback(
    () => api.getSessions(100).then((r) => r.sessions),
    [],
  );
  const { data: sessions } = usePolling(fetchSessions, SESSIONS_POLL_MS, {
    initialLoading: false,
  });

  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [starts, setStarts] = useState<Record<string, number>>(loadStarts);
  const [notes, setNotes] = useState<Record<string, ProblemNote>>({});
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [explain, setExplain] = useState<ScoreExplanation | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [showAllRevisions, setShowAllRevisions] = useState(false);
  const [revisionQueue, setRevisionQueue] = useState<Topic[] | null>(null);
  const [logging, setLogging] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Keyboard shortcuts from App (5.4): s = start session, l = focus first Done.
  useEffect(() => {
    const onStart = () => setFlow((f) => (f.kind === "idle" ? { kind: "warmup" } : f));
    const onFocusDone = () => {
      const btn = document.querySelector<HTMLButtonElement>(
        "[data-done-button='true']",
      );
      btn?.focus();
    };
    window.addEventListener("dsa:start-session", onStart);
    window.addEventListener("dsa:focus-done", onFocusDone);
    return () => {
      window.removeEventListener("dsa:start-session", onStart);
      window.removeEventListener("dsa:focus-done", onFocusDone);
    };
  }, []);

  // Obsidian notes for today's suggested problems (2.3).
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    void Promise.all(
      plan.suggestedProblems.map(async (p) => {
        try {
          const note = await api.getProblemNote(p.problemId);
          return [p.problemId, note] as const;
        } catch {
          return [p.problemId, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, ProblemNote> = {};
      for (const [id, note] of entries) {
        if (note) next[id] = note;
      }
      setNotes(next);
    });
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const startProblem = (problemId: string) => {
    const next = { ...starts, [problemId]: Date.now() };
    setStarts(next);
    saveStarts(next);
  };

  const elapsedMinutes = (problemId: string): number | null => {
    const start = starts[problemId];
    if (!start) return null;
    return Math.max(1, Math.round((Date.now() - start) / 60_000));
  };

  /** One-tap Done (1.3): time auto-tracked, everything else defaulted. */
  const markDone = async (problemId: string, problemName: string) => {
    if (!plan || logging) return;
    setLogging(problemId);
    setMessage(null);
    try {
      const minutes = elapsedMinutes(problemId) ?? DEFAULT_MINUTES;
      const result = await api.logSession({
        topicId: plan.primaryTopic.id,
        problemId,
        studyDuration: minutes,
      });
      const next = { ...starts };
      delete next[problemId];
      setStarts(next);
      saveStarts(next);

      if (result.attemptId) {
        setFlow({ kind: "mistake", attemptId: result.attemptId, problemId, problemName });
      } else {
        setMessage({ text: `Logged ${problemName} (${minutes} min).`, ok: true });
      }
      void refresh();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Failed to log problem",
        ok: false,
      });
    } finally {
      setLogging(null);
    }
  };

  const toggleExplain = async () => {
    if (showExplain) {
      setShowExplain(false);
      return;
    }
    setShowExplain(true);
    if (!explain && plan) {
      try {
        setExplain(await api.getScoreExplanation(plan.primaryTopic.id));
      } catch {
        // tooltip is best-effort
      }
    }
  };

  const toggleAllRevisions = async () => {
    if (showAllRevisions) {
      setShowAllRevisions(false);
      return;
    }
    setShowAllRevisions(true);
    if (!revisionQueue) {
      try {
        const res = await api.getRevisionQueue();
        setRevisionQueue(res.queue);
      } catch {
        setRevisionQueue([]);
      }
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      await api.triggerSync();
      setMessage({ text: "Notion sync complete.", ok: true });
      void refresh();
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : "Sync failed",
        ok: false,
      });
    } finally {
      setSyncing(false);
    }
  };

  const monthCount = useMemo(() => sessionsThisMonth(sessions ?? []), [sessions]);
  const dueTotal = plan?.revisionTotalDue ?? plan?.revisionTopics.length ?? 0;
  const topRevision = plan?.revisionTopics[0] ?? null;

  if (loading && !plan) {
    return (
      <div>
        <header className="page-header">
          <div className="page-header-text">
            <h2>Today</h2>
            <p>What to study right now — zero decisions needed.</p>
          </div>
        </header>
        <div className="grid" aria-busy="true">
          <div className="card">
            <Skeleton variant="text" width={110} />
            <Skeleton variant="title" width="45%" height={26} />
            <SkeletonLines lines={2} />
            <Skeleton variant="row" height={46} style={{ marginTop: "1rem" }} />
          </div>
          <div className="card">
            <Skeleton variant="title" width={170} />
            <SkeletonRows rows={3} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <div className="page-header-text">
          <h2>Today</h2>
          <p>What to study right now — zero decisions needed.</p>
        </div>
        <div className="today-header-meta">
          <span className="today-month-chip" title="Sessions logged this month">
            {monthCount} session{monthCount === 1 ? "" : "s"} this month
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={syncing}
            onClick={() => void runSync()}
            title="Sync with Notion now"
          >
            {syncing ? "Syncing…" : "⟳ Sync"}
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {message && (
        <div className={message.ok ? "success-banner" : "error-banner"}>
          {message.text}
        </div>
      )}

      {plan && (
        <div className="grid">
          {/* ── 1. Primary topic ── */}
          <div className="card today-topic-card">
            <div className="today-topic-row">
              <div>
                <div className="today-topic-label">Today&apos;s topic</div>
                <div className="today-topic-name">{plan.primaryTopic.name}</div>
                <p className="plan-reasoning" style={{ margin: "0.4rem 0 0" }}>
                  {plan.reasoning}
                </p>
              </div>
              <div className="today-topic-side">
                <span className="plan-duration">~{plan.estimatedDuration} min</span>
                <button type="button" className="btn btn-ghost" onClick={() => void toggleExplain()}>
                  {showExplain ? "Hide" : "Why this?"}
                </button>
              </div>
            </div>

            {showExplain && (
              <div className="today-explain">
                {explain ? (
                  <ScoreBar explanation={explain} />
                ) : (
                  <SkeletonLines lines={2} />
                )}
              </div>
            )}

            {flow.kind === "idle" && (
              <button
                type="button"
                className="btn btn-primary today-start-btn"
                onClick={() => setFlow({ kind: "warmup" })}
              >
                ▶ Start session
              </button>
            )}
          </div>

          {/* ── Warm-up flow (3.1) ── */}
          {flow.kind === "warmup" && (
            <WarmupCard
              topicId={plan.primaryTopic.id}
              topicName={plan.primaryTopic.name}
              onComplete={() => {
                setFlow({ kind: "idle" });
                const first = plan.suggestedProblems[0];
                if (first && !starts[first.problemId]) startProblem(first.problemId);
              }}
            />
          )}

          {/* ── Mistake capture (1.4) ── */}
          {flow.kind === "mistake" && (
            <div className="card">
              <MistakeCapture
                attemptId={flow.attemptId}
                problemName={flow.problemName}
                onDone={() =>
                  setFlow({
                    kind: "note-offer",
                    problemId: flow.problemId,
                    problemName: flow.problemName,
                  })
                }
              />
            </div>
          )}

          {/* ── Note template offer (2.4) ── */}
          {flow.kind === "note-offer" && (
            <div className="card note-offer">
              <span>
                Capture your insight on <strong>{flow.problemName}</strong> in Obsidian?
              </span>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const problemId = flow.problemId;
                    setFlow({ kind: "idle" });
                    api
                      .createNoteTemplate(problemId)
                      .then((res) =>
                        setMessage({
                          text: res.created
                            ? `Note created in vault: ${res.path}`
                            : "Note not created",
                          ok: res.created,
                        }),
                      )
                      .catch((err) =>
                        setMessage({
                          text: err instanceof Error ? err.message : "Note creation failed",
                          ok: false,
                        }),
                      );
                  }}
                >
                  📓 Create note
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setFlow({ kind: "idle" })}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* ── 2. Suggested problems (max 3) ── */}
          <div className="card">
            <h3 className="card-section-title mb-3">Suggested problems</h3>
            {plan.suggestedProblems.length === 0 && (
              <p className="muted text-sm">
                No unsolved problems for this topic — add some in Notion or just revise.
              </p>
            )}
            <ul className="today-problems">
              {plan.suggestedProblems.slice(0, 3).map((p) => {
                const started = starts[p.problemId] != null;
                const note = notes[p.problemId];
                const minutes = elapsedMinutes(p.problemId);
                return (
                  <li key={p.problemId} className="today-problem">
                    <div className="today-problem-main">
                      <div className="today-problem-name">
                        {p.leetcodeLink ? (
                          <a href={p.leetcodeLink} target="_blank" rel="noreferrer">
                            {p.name}
                          </a>
                        ) : (
                          p.name
                        )}
                        <span
                          className={`diff-badge diff-${p.difficulty?.toLowerCase() ?? "medium"}`}
                        >
                          {p.difficulty ?? "?"}
                        </span>
                        {note && (
                          <button
                            type="button"
                            className="note-chip"
                            title="You have an Obsidian note for this problem"
                            onClick={() =>
                              setOpenNoteId(openNoteId === p.problemId ? null : p.problemId)
                            }
                          >
                            📓 note
                          </button>
                        )}
                      </div>
                      {started && (
                        <span className="today-problem-timer">
                          ⏱ {minutes ?? 0} min
                        </span>
                      )}
                    </div>

                    <div className="today-problem-actions">
                      {!started && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => startProblem(p.problemId)}
                        >
                          Start
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-primary"
                        data-done-button="true"
                        disabled={logging === p.problemId}
                        onClick={() => void markDone(p.problemId, p.name)}
                      >
                        {logging === p.problemId ? "Saving…" : "✓ Done"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        title="Open coach anchored to this problem"
                        onClick={() => onOpenCoach(p.problemId)}
                      >
                        💬 Coach
                      </button>
                    </div>

                    {openNoteId === p.problemId && note && (
                      <ProblemNotePanel note={note} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ── 3. Revision — one item, never a guilt-list (1.5) ── */}
          <div className="card">
            <h3 className="card-section-title mb-2">Revision</h3>
            {dueTotal === 0 && (
              <EmptyState
                compact
                icon={<CheckCircleIcon />}
                title="Nothing due today"
                hint="Spaced repetition is happy — revisions will queue up here."
              />
            )}
            {topRevision && (
              <div className="today-revision">
                <div>
                  <div className="today-revision-name">{topRevision.name}</div>
                  <div className="muted text-xs">
                    confidence {topRevision.confidence}/100
                    {topRevision.isWeakArea ? " · weak area" : ""}
                  </div>
                </div>
              </div>
            )}
            {dueTotal > 1 && (
              <button
                type="button"
                className="btn btn-ghost mt-2"
                onClick={() => void toggleAllRevisions()}
              >
                {showAllRevisions ? "Show less" : `Show all (${dueTotal})`}
              </button>
            )}
            {(plan.revisionDeferred ?? 0) > 0 && (
              <p className="muted text-xs mt-2 mb-0">
                {plan.revisionDeferred} overdue topics were rescheduled forward — no
                backlog wall, they&apos;ll come back over the next days.
              </p>
            )}
            {showAllRevisions && revisionQueue && (
              <ul className="today-revision-list">
                {revisionQueue.map((t) => (
                  <li key={t.id}>
                    <span>{t.name}</span>
                    <span className="muted">
                      {t.nextRevisionAt
                        ? `due ${new Date(t.nextRevisionAt).toLocaleDateString()}`
                        : "never revised"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
