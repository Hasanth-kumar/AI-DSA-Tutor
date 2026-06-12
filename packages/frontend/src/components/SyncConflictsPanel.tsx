import { useCallback, useState } from "react";
import { api } from "../api/client.js";
import { usePolling } from "../hooks/usePolling.js";
import type { SyncConflict } from "../types/api.js";

const CONFLICT_POLL_MS = 60_000;

function formatValue(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${v ?? "—"}`)
    .join(" · ");
}

/** Simple "pick winner" UI for Notion sync conflicts (5.2). */
export function SyncConflictsPanel() {
  const fetchConflicts = useCallback(() => api.getSyncConflicts(), []);
  const { data, refresh } = usePolling(fetchConflicts, CONFLICT_POLL_MS, {
    initialLoading: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conflicts: SyncConflict[] = data?.conflicts ?? [];
  if (conflicts.length === 0) return null;

  const resolve = async (id: string, winner: "local" | "remote") => {
    setBusy(id);
    setError(null);
    try {
      await api.resolveSyncConflict(id, winner);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card conflict-panel">
      <h3 className="card-section-title">Sync conflicts</h3>
      <p className="muted text-sm mt-0">
        These records changed both locally and in Notion between syncs. Pick which
        version wins.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <ul className="conflict-list">
        {conflicts.map((c) => (
          <li key={c.id} className="conflict-item">
            <div className="conflict-item-name">
              {c.entityName ?? c.entityId}
              <span className="muted"> ({c.entityType})</span>
            </div>
            <div className="conflict-versions">
              <div>
                <span className="conflict-label">Local</span>
                <code>{formatValue(c.localValue)}</code>
              </div>
              <div>
                <span className="conflict-label">Notion</span>
                <code>{formatValue(c.remoteValue)}</code>
              </div>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={busy === c.id}
                onClick={() => void resolve(c.id, "local")}
              >
                Keep local
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy === c.id}
                onClick={() => void resolve(c.id, "remote")}
              >
                Keep Notion
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
