import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client.js";
import { CardAnswer } from "../components/CardAnswer.js";
import { PageHeader } from "../components/PageHeader.js";
import type { ReviewCard, ReviewQueue } from "../types/api.js";

const GRADES: { key: string; label: string; quality: number; hint: string; tone: string }[] = [
  { key: "1", label: "Again", quality: 1, hint: "Forgot", tone: "danger" },
  { key: "2", label: "Hard", quality: 3, hint: "With effort", tone: "warning" },
  { key: "3", label: "Good", quality: 4, hint: "Minor gaps", tone: "success" },
  { key: "4", label: "Easy", quality: 5, hint: "Instant", tone: "accent" },
];

function formatCardType(type: string): string {
  return type.replace(/-/g, " ");
}

function ReviewShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-content page-content--narrow">
      <PageHeader
        eyebrow="Flashcards · interleaved"
        title="Review"
        align="center"
      />
      {children}
    </div>
  );
}

/**
 * Flashcard review (design §11) — same visual language as the warm-up card:
 * centered study surface, show-answer reveal, self-grade row. Opt-in SR engine.
 */
export function ReviewPage() {
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [reviewed, setReviewed] = useState(0);
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setQueue(null);
    api
      .getReviewQueue(20)
      .then((q) => {
        setQueue(q);
        setIndex(0);
        setRevealed(false);
        setEditing(false);
        setReviewed(0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load review queue"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = queue?.cards ?? [];
  const current: ReviewCard | undefined = cards[index];

  const advance = useCallback(() => {
    setRevealed(false);
    setEditing(false);
    setConfirmDel(false);
    setIndex((i) => i + 1);
  }, []);

  const grade = useCallback(
    async (quality: number) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        await api.gradeReviewCard(current.id, quality);
        setReviewed((n) => n + 1);
        advance();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Grade failed");
      } finally {
        setBusy(false);
      }
    },
    [current, busy, advance],
  );

  const suspend = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api.suspendReviewCard(current.id);
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suspend failed");
    } finally {
      setBusy(false);
    }
  }, [current, busy, advance]);

  const remove = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await api.deleteReviewCard(current.id);
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }, [current, busy, advance]);

  const startEdit = useCallback(() => {
    if (!current) return;
    setEditFront(current.front);
    setEditBack(current.back);
    setEditing(true);
    setRevealed(true);
  }, [current]);

  const saveEdit = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const updated = await api.editReviewCard(current.id, editFront, editBack);
      setQueue((q) => (q ? { ...q, cards: q.cards.map((c, i) => (i === index ? updated : c)) } : q));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setBusy(false);
    }
  }, [current, busy, editFront, editBack, index]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (!current) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed) {
        const g = GRADES.find((x) => x.key === e.key);
        if (g) {
          e.preventDefault();
          void grade(g.quality);
          return;
        }
      }
      if (e.key === "s") {
        e.preventDefault();
        void suspend();
      } else if (e.key === "e") {
        e.preventDefault();
        startEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, editing, grade, suspend, startEdit]);

  if (error) {
    return (
      <ReviewShell>
        <div className="error-banner">{error}</div>
        <button type="button" className="btn-secondary-v2" onClick={load}>
          Retry
        </button>
      </ReviewShell>
    );
  }

  if (!queue) {
    return (
      <ReviewShell>
        <p className="muted m-0">Loading due cards…</p>
      </ReviewShell>
    );
  }

  const leechAdvisories = queue.leechAdvisories ?? [];

  if (!current) {
    const nothingDue = cards.length === 0 && reviewed === 0;
    return (
      <ReviewShell>
        <h2 className="card-title m-0">{nothingDue ? "Nothing due" : "Session complete"}</h2>
        <p className="muted mt-3 mb-0">
          {nothingDue
            ? "No cards are due right now. Spend the time on a problem."
            : `Reviewed ${reviewed} card${reviewed === 1 ? "" : "s"} today${
                queue.hasMore ? " — more are due, but the rest can wait." : "."
              }`}
        </p>
        <button type="button" className="btn-secondary-v2 review-more-btn" onClick={load}>
          {queue.hasMore ? "Review more" : "Check again"}
        </button>
      </ReviewShell>
    );
  }

  const metaParts = [
    formatCardType(current.type),
    current.leech ? "leech" : null,
    current.lapses > 0 ? `${current.lapses} lapse${current.lapses === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  const progressPct = cards.length > 0 ? ((index + (revealed ? 1 : 0)) / cards.length) * 100 : 0;

  return (
    <ReviewShell>
      <div className="review-progress-row">
        <div className="review-progress-bar">
          <div className="review-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="review-progress-count">
          {index + 1} / {cards.length} due
        </span>
      </div>

      {editing ? (
        <div className="review-card-v2">
          <div className="review-edit">
            <label className="card-section-title">Front</label>
            <textarea
              className="review-edit-field"
              rows={3}
              value={editFront}
              onChange={(e) => setEditFront(e.target.value)}
            />
            <label className="card-section-title mt-3">Back</label>
            <textarea
              className="review-edit-field"
              rows={4}
              value={editBack}
              onChange={(e) => setEditBack(e.target.value)}
            />
            <div className="review-edit-actions">
              <button type="button" className="btn-primary-v2" disabled={busy} onClick={() => void saveEdit()}>
                Save
              </button>
              <button type="button" className="btn-secondary-v2" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="review-card-v2" key={current.id}>
            {leechAdvisories.length > 0 && (
              <p className="muted text-xs mt-0 mb-3">
                Leech cards skipped — prerequisites surfaced instead.
              </p>
            )}

            {metaParts.length > 0 && (
              <p className="review-card-meta">
                {metaParts.join(" · ")}
              </p>
            )}

            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: "1.4rem", minHeight: "200px" }}>
              <p className="review-question-serif">{current.front}</p>

              {!revealed ? (
                <button
                  type="button"
                  className="btn-ghost-v2"
                  disabled={busy}
                  onClick={() => setRevealed(true)}
                >
                  Show answer
                </button>
              ) : (
                <div className="review-answer-v2">
                  <CardAnswer content={current.back} className="coach-assistant-text" />
                </div>
              )}
            </div>
          </div>

          {revealed && (
            <div className="review-grade-grid">
              {GRADES.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  className={`review-grade-btn grade-${g.tone}`}
                  title={g.hint}
                  disabled={busy}
                  onClick={() => void grade(g.quality)}
                >
                  <span className="review-grade-btn__label">{g.label}</span>
                  <span className="review-grade-btn__hint">
                    {g.key} · {g.hint}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="review-triage">
            <button type="button" className="review-triage-btn" disabled={busy} onClick={() => void suspend()}>
              suspend
            </button>
            <button type="button" className="review-triage-btn" disabled={busy} onClick={startEdit}>
              edit
            </button>
            <button
              type="button"
              className={`review-triage-btn${confirmDel ? " review-triage-btn--danger" : ""}`}
              disabled={busy}
              onClick={() => (confirmDel ? void remove() : setConfirmDel(true))}
            >
              {confirmDel ? "confirm delete" : "delete"}
            </button>
          </div>
        </>
      )}
    </ReviewShell>
  );
}
