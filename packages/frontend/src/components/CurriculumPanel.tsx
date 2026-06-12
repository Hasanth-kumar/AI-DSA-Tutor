import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { SkeletonRows } from "./Skeleton.js";
import type { CurriculumItem, CurriculumState } from "../types/api.js";

interface Props {
  onChanged?: () => void;
}

export function CurriculumPanel({ onChanged }: Props) {
  const [state, setState] = useState<CurriculumState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getCurriculum();
      setState(data);
      setDraft(data.topicNames.join("\n"));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load curriculum";
      const hint =
        message === "Failed to fetch"
          ? "Cannot reach the API. Run `pnpm dev:all` and open the app via the Vite URL (localhost:5173 or your LAN IP)."
          : message;
      setError(hint);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSwitch = async (item: CurriculumItem) => {
    if (!item.topicId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.setCurriculumActiveTopic(item.topicId);
      setState(data);
      onChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to switch topic";
      setError(
        message === "Failed to fetch"
          ? "Cannot reach the API. Check that the backend is running on port 3000."
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleAutoAdvance = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.setCurriculumActiveTopic(null);
      setState(data);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear selection");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTopics = async () => {
    const names = draft
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    if (names.length === 0) {
      setError("Add at least one topic name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api.updateCurriculum(names);
      setState(data);
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save topics");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.resetCurriculum();
      setState(data);
      setDraft(data.topicNames.join("\n"));
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset curriculum");
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="card curriculum-panel" aria-busy="true">
        <h3 className="card-section-title">Study curriculum</h3>
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const items = state.selection?.items ?? [];

  return (
    <div className="card curriculum-panel">
      <div className="curriculum-header">
        <h3 className="card-section-title m-0">Study curriculum</h3>
        <div className="curriculum-actions">
          {state.activeTopicId && (
            <button
              type="button"
              className="curriculum-btn curriculum-btn--ghost"
              onClick={() => void handleAutoAdvance()}
              disabled={busy}
            >
              Auto-advance
            </button>
          )}
          <button
            type="button"
            className="curriculum-btn curriculum-btn--ghost"
            onClick={() => setEditing((v) => !v)}
            disabled={busy}
          >
            {editing ? "Cancel" : "Edit topics"}
          </button>
        </div>
      </div>

      <p className="curriculum-hint muted">
        Work through topics in order. When all problems in a topic are solved, the plan moves to the next one.
      </p>

      {error && <div className="error-banner curriculum-error">{error}</div>}

      {editing ? (
        <div className="curriculum-editor">
          <label>
            Topic order (one per line)
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              disabled={busy}
            />
          </label>
          <div className="curriculum-editor-actions">
            <button
              type="button"
              className="curriculum-btn"
              onClick={() => void handleSaveTopics()}
              disabled={busy}
            >
              Save order
            </button>
            <button
              type="button"
              className="curriculum-btn curriculum-btn--ghost"
              onClick={() => void handleReset()}
              disabled={busy}
            >
              Reset to default
            </button>
          </div>
        </div>
      ) : (
        <ol className="curriculum-list">
          {items.map((item) => (
            <li
              key={item.name}
              className={`curriculum-item curriculum-item--${item.status}`}
            >
              <div className="curriculum-item-main">
                <span className="curriculum-item-name">{item.name}</span>
                {item.totalCount > 0 && (
                  <span className="curriculum-item-progress">
                    {item.totalCount - item.unsolvedCount}/{item.totalCount} done
                  </span>
                )}
                {item.status === "missing" && (
                  <span className="curriculum-item-missing">not in mirror</span>
                )}
              </div>
              {item.topicId && item.status !== "current" && (
                <button
                  type="button"
                  className="curriculum-btn curriculum-btn--small"
                  onClick={() => void handleSwitch(item)}
                  disabled={busy}
                >
                  Switch
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
