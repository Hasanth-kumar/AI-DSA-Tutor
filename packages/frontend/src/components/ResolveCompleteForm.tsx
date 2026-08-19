import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import type {
  ResolveCompleteResult,
  ResolveOutcomeKind,
  ResolveRating,
  TopicDifficulty,
} from "../types/api.js";

/** Mirrors ProblemReviewEngine.inferRating (§5) so the UI can preview it. */
export function inferResolveRating(
  outcome: ResolveOutcomeKind,
  timeTakenMin: number | null,
  difficulty: TopicDifficulty | null,
  slowThresholdMin: Record<TopicDifficulty, number> | undefined,
): ResolveRating {
  if (outcome === "failed") return "again";
  if (outcome === "assisted") return "hard";
  const cutoff = slowThresholdMin?.[difficulty ?? "Medium"] ?? 45;
  if (timeTakenMin == null || timeTakenMin > cutoff) return "good";
  return "easy";
}

export const RATING_LABELS: Record<ResolveRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const OUTCOMES: { id: ResolveOutcomeKind; label: string; hint: string; tone: string }[] = [
  { id: "solved", label: "Solved cold", hint: "No help", tone: "got" },
  { id: "assisted", label: "Needed help", hint: "Hint or coach", tone: "shaky" },
  { id: "failed", label: "Couldn't solve", hint: "Stuck", tone: "forgot" },
];

const RATINGS: { id: ResolveRating; hint: string; tone: string }[] = [
  { id: "again", hint: "Failed", tone: "danger" },
  { id: "hard", hint: "With help", tone: "warning" },
  { id: "good", hint: "Solved", tone: "success" },
  { id: "easy", hint: "Fast & cold", tone: "accent" },
];

interface Props {
  problemId: string;
  problemName: string;
  difficulty: TopicDifficulty | null;
  slowThresholdMin?: Record<TopicDifficulty, number>;
  /** Prefill for the minutes field (e.g. from a running timer). */
  initialMinutes?: number | null;
  onDone: (result: ResolveCompleteResult) => void;
  onCancel: () => void;
}

/**
 * Re-solve completion flow (§5, §10): outcome + time in, inferred rating
 * previewed with one-tap override, one POST out.
 */
export function ResolveCompleteForm({
  problemId,
  problemName,
  difficulty,
  slowThresholdMin,
  initialMinutes,
  onDone,
  onCancel,
}: Props) {
  const [outcome, setOutcome] = useState<ResolveOutcomeKind>("solved");
  const [minutes, setMinutes] = useState<string>(
    initialMinutes != null ? String(initialMinutes) : "",
  );
  const [override, setOverride] = useState<ResolveRating | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeTakenMin = minutes.trim() === "" ? null : Math.max(1, Math.round(Number(minutes)));
  const inferred = useMemo(
    () => inferResolveRating(outcome, timeTakenMin, difficulty, slowThresholdMin),
    [outcome, timeTakenMin, difficulty, slowThresholdMin],
  );
  const rating = override ?? inferred;
  const overridden = override != null && override !== inferred;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.completeResolve(problemId, {
        outcome,
        timeTakenMin,
        ...(override && override !== inferred ? { ratingOverride: override } : {}),
      });
      onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record re-solve");
      setSaving(false);
    }
  };

  return (
    <div className="rsv-complete" role="group" aria-label={`Record re-solve of ${problemName}`}>
      <p className="rsv-complete-question">How did the re-solve go?</p>

      <div className="rsv-complete-block">
        <div className="rsv-complete-head">
          <div className="rsv-complete-label" id={`rsv-outcome-label-${problemId}`}>
            Outcome
          </div>
          <div className="rsv-min">
            <input
              id={`rsv-min-${problemId}`}
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="—"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-label="Minutes taken"
            />
            <span>min</span>
          </div>
        </div>
        <div className="rsv-complete-outcomes" role="group" aria-labelledby={`rsv-outcome-label-${problemId}`}>
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`rsv-outcome-btn rsv-outcome-btn--${o.tone}${outcome === o.id ? " is-active" : ""}`}
              aria-pressed={outcome === o.id}
              onClick={() => {
                setOutcome(o.id);
                setOverride(null);
              }}
            >
              <span className="rsv-outcome-btn__label">{o.label}</span>
              <span className="rsv-outcome-btn__hint">{o.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rsv-complete-block">
        <div className="rsv-complete-label" id={`rsv-rating-label-${problemId}`}>
          Rating
          <span className="rsv-complete-label-meta">
            {overridden ? "overridden" : `suggested ${RATING_LABELS[inferred]}`}
          </span>
        </div>
        <div
          className="review-grade-grid rsv-rating-grid"
          role="group"
          aria-labelledby={`rsv-rating-label-${problemId}`}
        >
          {RATINGS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`review-grade-btn grade-${r.tone}${rating === r.id ? " is-active" : ""}`}
              aria-pressed={rating === r.id}
              title={r.hint}
              onClick={() => setOverride(r.id === inferred ? null : r.id)}
            >
              <span className="review-grade-btn__label">{RATING_LABELS[r.id]}</span>
              <span className="review-grade-btn__hint">{r.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rsv-complete-actions">
        <button type="button" className="btn-ghost-v2" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary-v2" disabled={saving} onClick={() => void submit()}>
          {saving ? "Saving…" : "Record"}
        </button>
      </div>
      {error && <div className="error-banner mt-2">{error}</div>}
    </div>
  );
}
