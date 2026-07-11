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

const OUTCOMES: { id: ResolveOutcomeKind; label: string }[] = [
  { id: "solved", label: "Solved cold" },
  { id: "assisted", label: "Needed help" },
  { id: "failed", label: "Couldn't solve" },
];

const RATINGS: ResolveRating[] = ["again", "hard", "good", "easy"];

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
    <div className="mistake-capture">
      <div className="mistake-capture-question">
        How did the re-solve of <strong>{problemName}</strong> go?
      </div>
      <div className="mistake-capture-options">
        {OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`btn mistake-tag-btn${outcome === o.id ? " mistake-tag-btn--active" : ""}`}
            onClick={() => {
              setOutcome(o.id);
              setOverride(null);
            }}
          >
            {o.label}
          </button>
        ))}
        <label className="muted text-sm" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            style={{ width: "4.5rem" }}
            aria-label="Minutes taken"
          />
          min
        </label>
      </div>
      <div className="mistake-capture-options" role="group" aria-label="FSRS rating">
        <span className="muted text-sm">
          Rating{override && override !== inferred ? " (overridden)" : ""}:
        </span>
        {RATINGS.map((r) => (
          <button
            key={r}
            type="button"
            className={`btn mistake-tag-btn${rating === r ? " mistake-tag-btn--active" : ""}`}
            onClick={() => setOverride(r === inferred ? null : r)}
          >
            {RATING_LABELS[r]}
          </button>
        ))}
      </div>
      <div className="mistake-capture-actions">
        <button type="button" className="btn btn-ghost mistake-tag-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? "Saving…" : "Record re-solve"}
        </button>
      </div>
      {error && <div className="error-banner mt-2">{error}</div>}
    </div>
  );
}
