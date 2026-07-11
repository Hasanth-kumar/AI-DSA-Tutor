import { useCallback, useState } from "react";
import { api } from "../api/client.js";
import { usePolling } from "../hooks/usePolling.js";
import type { ResolveCompleteResult, ResolvePlanSlot } from "../types/api.js";
import { RATING_LABELS, ResolveCompleteForm } from "./ResolveCompleteForm.js";

const QUEUE_POLL_MS = 60_000;

interface Props {
  slots: ResolvePlanSlot[];
  onChanged: () => void;
}

function resultMessage(result: ResolveCompleteResult): string {
  if (result.leech) {
    return "Marked as a leech — suspended until the topic's next revision session.";
  }
  if (result.retired) return `Rated ${RATING_LABELS[result.rating]} — retired from the pool. 🎉`;
  return `Rated ${RATING_LABELS[result.rating]} — next re-solve in ${result.intervalDays} day${
    result.intervalDays === 1 ? "" : "s"
  }.`;
}

function SlotRow({
  slot,
  slowThresholdMin,
  onChanged,
  onMessage,
}: {
  slot: ResolvePlanSlot;
  slowThresholdMin?: Record<"Easy" | "Medium" | "Hard", number>;
  onChanged: () => void;
  onMessage: (text: string, ok: boolean) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const diffClass = `diff-${slot.difficulty?.toLowerCase() ?? "medium"}`;

  const skip = async () => {
    setBusy(true);
    try {
      await api.skipResolve(slot.problemId);
      onMessage(`${slot.name} deferred to tomorrow.`, true);
      onChanged();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Skip failed", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`problem-row-v2${slot.promoted ? " problem-row-v2--active" : ""}`}>
      <div className="problem-row-top">
        {slot.leetcodeLink ? (
          <a href={slot.leetcodeLink} target="_blank" rel="noreferrer" className="problem-row-name">
            {slot.name}
          </a>
        ) : (
          <span className="problem-row-name">{slot.name}</span>
        )}
        <span className={`diff-badge ${diffClass}`}>
          {(slot.difficulty ?? "?").slice(0, 3).toUpperCase()}
        </span>
        {slot.promoted && (
          <span className="chip-v2">
            <span className="chip-v2-dot" aria-hidden />
            promoted
          </span>
        )}
        {slot.daysOverdue > 0 && (
          <span className="muted text-sm">{slot.daysOverdue}d overdue</span>
        )}
      </div>
      <p className="muted text-sm" style={{ margin: "0.2rem 0 0.5rem" }}>
        {slot.reason}
      </p>
      {completing ? (
        <ResolveCompleteForm
          problemId={slot.problemId}
          problemName={slot.name}
          difficulty={slot.difficulty}
          slowThresholdMin={slowThresholdMin}
          onCancel={() => setCompleting(false)}
          onDone={(result) => {
            setCompleting(false);
            onMessage(resultMessage(result), true);
            onChanged();
          }}
        />
      ) : (
        <div className="problem-row-actions">
          <button
            type="button"
            className="btn-primary-v2"
            style={{ padding: "0.4rem 0.95rem", fontSize: "0.8rem" }}
            onClick={() => setCompleting(true)}
          >
            ✓ Done
          </button>
          <button type="button" className="btn-ghost-v2" disabled={busy} onClick={() => void skip()}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Today's committed re-solve slots (§10): a collapsed section below the new
 * problems — never the full pool. Escalation promotions render uncollapsed;
 * they are the one thing not allowed to hide.
 */
export function ResolveTodaySection({ slots, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchQueue = useCallback(() => api.getResolveQueue(), []);
  const { data: queue } = usePolling(fetchQueue, QUEUE_POLL_MS, { initialLoading: false });

  if (slots.length === 0 && !message) return null;

  const promoted = slots.filter((s) => s.promoted);
  const collapsible = slots.filter((s) => !s.promoted);
  const onMessage = (text: string, ok: boolean) => setMessage({ text, ok });

  return (
    <section className="panel-v2" style={{ marginTop: "1.4rem" }}>
      <div className="panel-v2-header">
        <h3 className="panel-v2-title">Re-solve</h3>
        <span className="panel-v2-meta">{slots.length} due</span>
      </div>
      {message && (
        <div className={message.ok ? "success-banner" : "error-banner"}>{message.text}</div>
      )}
      {promoted.map((slot) => (
        <SlotRow
          key={slot.problemId}
          slot={slot}
          slowThresholdMin={queue?.slowThresholdMin}
          onChanged={onChanged}
          onMessage={onMessage}
        />
      ))}
      {collapsible.length > 0 && !expanded && (
        <button
          type="button"
          className="btn-ghost-v2"
          style={{ width: "100%", justifyContent: "flex-start" }}
          onClick={() => setExpanded(true)}
        >
          ▶ Re-solve ({collapsible.length} due)
        </button>
      )}
      {expanded &&
        collapsible.map((slot) => (
          <SlotRow
            key={slot.problemId}
            slot={slot}
            slowThresholdMin={queue?.slowThresholdMin}
            onChanged={onChanged}
            onMessage={onMessage}
          />
        ))}
    </section>
  );
}
