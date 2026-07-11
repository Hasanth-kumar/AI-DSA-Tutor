import { useCallback, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { PageHeader } from "../components/PageHeader.js";
import { RATING_LABELS, ResolveCompleteForm } from "../components/ResolveCompleteForm.js";
import { Skeleton, SkeletonRows } from "../components/Skeleton.js";
import { usePolling } from "../hooks/usePolling.js";
import type { ResolveQueueItem } from "../types/api.js";

const QUEUE_POLL_MS = 30_000;
const MS_PER_DAY = 86_400_000;

/** "3d over" / "today" / "in 5d" / "Jul 28" — the row's schedule distance. */
function distance(item: ResolveQueueItem): string {
  if (item.status === "overdue") return `${item.daysOverdue}d over`;
  if (item.status === "due") return "today";
  if (item.due == null) return "unscheduled";
  const days = Math.ceil((item.due - Date.now()) / MS_PER_DAY);
  if (days <= 7) return `in ${days}d`;
  return new Date(item.due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fsrsLabel(item: ResolveQueueItem): string {
  if (item.reps === 0) return "first re-solve";
  const bits = [`${item.reps} rep${item.reps === 1 ? "" : "s"}`];
  if (item.lapses > 0) bits.push(`${item.lapses} lapse${item.lapses === 1 ? "" : "s"}`);
  if (item.stability != null) bits.push(`${Math.round(item.stability)}d stable`);
  return bits.join(" · ");
}

function Row({
  item,
  index,
  offRail,
  slowThresholdMin,
  onMessage,
  onChanged,
}: {
  item: ResolveQueueItem;
  index: number;
  /** Suspended/retired rows render without a spine marker — off the schedule. */
  offRail?: boolean;
  slowThresholdMin?: Record<"Easy" | "Medium" | "Hard", number>;
  onMessage: (text: string, ok: boolean) => void;
  onChanged: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const overdue = item.status === "overdue";
  const actionable = overdue || item.status === "due" || item.status === "scheduled";

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    try {
      await fn();
      onMessage(okText, true);
      onChanged();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Action failed", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rsv-row${offRail ? " rsv-row--paused" : ""}`}
      style={{ "--i": index } as React.CSSProperties}
    >
      {!offRail && (
        <span
          className={`rsv-marker${overdue || item.status === "due" ? " rsv-marker--filled" : ""}`}
          aria-hidden
        />
      )}
      <div className="rsv-body">
        <div className="rsv-line">
          {item.leetcodeLink ? (
            <a href={item.leetcodeLink} target="_blank" rel="noreferrer" className="rsv-name">
              {item.name}
            </a>
          ) : (
            <span className="rsv-name">{item.name}</span>
          )}
          <span className={`diff-badge diff-${item.difficulty?.toLowerCase() ?? "medium"}`}>
            {(item.difficulty ?? "?").slice(0, 3).toUpperCase()}
          </span>
          {offRail && (
            <span className="rsv-flag">{item.status === "suspended" ? "leech" : "retired"}</span>
          )}
          <span className={`rsv-distance${overdue ? " rsv-distance--overdue" : ""}`}>
            {offRail ? "" : distance(item)}
          </span>
        </div>
        <div className="rsv-line rsv-line--meta">
          <span className="rsv-reason">{item.reason}</span>
          <span className="rsv-fsrs">{fsrsLabel(item)}</span>
        </div>
        {completing ? (
          <div className="rsv-form">
            <ResolveCompleteForm
              problemId={item.problemId}
              problemName={item.name}
              difficulty={item.difficulty}
              slowThresholdMin={slowThresholdMin}
              onCancel={() => setCompleting(false)}
              onDone={(result) => {
                setCompleting(false);
                onMessage(
                  result.leech
                    ? "Marked as a leech — paused until the topic's next revision session."
                    : `Rated ${RATING_LABELS[result.rating]} — next in ${result.intervalDays}d${
                        result.retired ? ", retired 🎉" : ""
                      }.`,
                  true,
                );
                onChanged();
              }}
            />
          </div>
        ) : (
          <div className="rsv-actions">
            {actionable && (
              <button
                type="button"
                className={`${item.status === "scheduled" ? "btn-ghost-v2" : "btn-primary-v2"} rsv-btn`}
                onClick={() => setCompleting(true)}
              >
                {item.status === "scheduled" ? "Re-solve early" : "Re-solve"}
              </button>
            )}
            {(overdue || item.status === "due") && (
              <button
                type="button"
                className="btn-ghost-v2 rsv-btn"
                disabled={busy}
                onClick={() =>
                  void run(() => api.skipResolve(item.problemId), `${item.name} moved to tomorrow.`)
                }
              >
                Skip
              </button>
            )}
            {offRail ? (
              <button
                type="button"
                className="btn-secondary-v2 rsv-btn"
                disabled={busy}
                onClick={() =>
                  void run(() => api.admitResolve(item.problemId), `${item.name} back on the schedule.`)
                }
              >
                Re-admit
              </button>
            ) : (
              <span className="rsv-quiet-actions">
                <button
                  type="button"
                  className="btn-ghost-v2 rsv-btn"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api.setResolveFlags(item.problemId, { suspended: true }),
                      `${item.name} paused.`,
                    )
                  }
                >
                  Pause
                </button>
                <button
                  type="button"
                  className="btn-ghost-v2 rsv-btn"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api.setResolveFlags(item.problemId, { retired: true }),
                      `${item.name} retired.`,
                    )
                  }
                >
                  Retire
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The re-solve ledger (§10): one schedule spine, split by a literal TODAY
 * rule. Above the rule is execution debt; below is what FSRS has pushed out;
 * paused problems sit off the rail entirely.
 */
export function ResolvePage() {
  const fetchQueue = useCallback(() => api.getResolveQueue(), []);
  const { data: queue, loading, refresh } = usePolling(fetchQueue, QUEUE_POLL_MS);

  const fetchProblems = useCallback(() => api.getProblems(), []);
  const { data: problemsData } = usePolling(fetchProblems, 60_000, { initialLoading: false });

  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [admitId, setAdmitId] = useState("");

  const onMessage = (text: string, ok: boolean) => setMessage({ text, ok });
  const items = useMemo(() => queue?.items ?? [], [queue]);

  const byDue = (a: ResolveQueueItem, b: ResolveQueueItem) => (a.due ?? 0) - (b.due ?? 0);
  const debt = items.filter((i) => i.status === "overdue" || i.status === "due").sort(byDue);
  const later = items.filter((i) => i.status === "scheduled").sort(byDue);
  const paused = items.filter((i) => i.status === "suspended" || i.status === "retired");

  const pooledIds = useMemo(() => new Set(items.map((i) => i.problemId)), [items]);
  const admittable = (problemsData?.problems ?? []).filter((p) => !pooledIds.has(p.id));

  const admit = async () => {
    if (!admitId) return;
    try {
      const item = await api.admitResolve(admitId);
      setMessage({ text: `${item.name} queued — due today.`, ok: true });
      setAdmitId("");
      setQueueOpen(false);
      void refresh();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Queue failed", ok: false });
    }
  };

  if (loading && !queue) {
    return (
      <div className="page-content">
        <PageHeader eyebrow="Spaced repetition" title="Re-solve" subtitle="Loading the schedule…" />
        <div aria-busy="true">
          <Skeleton variant="block" height={120} />
          <SkeletonRows rows={4} />
        </div>
      </div>
    );
  }

  let spineIndex = 0;

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Re-solve"
        subtitle="Solved problems return on an adaptive schedule, before execution skill fades."
        actions={
          <button
            type="button"
            className="btn-ghost-v2"
            aria-expanded={queueOpen}
            onClick={() => setQueueOpen((v) => !v)}
          >
            + Queue a problem
          </button>
        }
      />

      {queueOpen && (
        <div className="rsv-admit">
          <select
            value={admitId}
            onChange={(e) => setAdmitId(e.target.value)}
            aria-label="Problem to queue for re-solve"
          >
            <option value="">Pick a problem…</option>
            {admittable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.difficulty ? ` (${p.difficulty})` : ""}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary-v2" disabled={!admitId} onClick={() => void admit()}>
            Queue it
          </button>
        </div>
      )}

      {message && (
        <div className={message.ok ? "success-banner" : "error-banner"}>{message.text}</div>
      )}

      <div className="rsv-ledger">
        {items.length === 0 && (
          <p className="rsv-empty">
            The pool is empty. Solves that show struggle signals — mistakes, coach help, slow
            times, Hard difficulty — are scheduled here automatically.
          </p>
        )}

        {debt.length > 0 && (
          <div className="rsv-rail rsv-rail--debt">
            <div className="rsv-rail-label">Overdue</div>
            {debt.map((item) => (
              <Row
                key={item.problemId}
                item={item}
                index={spineIndex++}
                slowThresholdMin={queue?.slowThresholdMin}
                onMessage={onMessage}
                onChanged={() => void refresh()}
              />
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="rsv-today" role="separator" aria-label="Today">
            <span className="rsv-today-tag">Today</span>
            <span className="rsv-today-meta">
              {queue?.dueCount ?? 0} due · capacity {queue?.capacity ?? 0}
            </span>
          </div>
        )}

        {later.length > 0 && (
          <div className="rsv-rail">
            <div className="rsv-rail-label">Upcoming</div>
            {later.map((item) => (
              <Row
                key={item.problemId}
                item={item}
                index={spineIndex++}
                slowThresholdMin={queue?.slowThresholdMin}
                onMessage={onMessage}
                onChanged={() => void refresh()}
              />
            ))}
          </div>
        )}

        {paused.length > 0 && (
          <div className="rsv-paused">
            <div className="rsv-rail-label">Paused &amp; retired</div>
            {paused.map((item) => (
              <Row
                key={item.problemId}
                item={item}
                index={spineIndex++}
                offRail
                slowThresholdMin={queue?.slowThresholdMin}
                onMessage={onMessage}
                onChanged={() => void refresh()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
