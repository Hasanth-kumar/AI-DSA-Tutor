import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { CurriculumItem, CurriculumState } from "../types/api.js";

interface Props {
  onChanged?: () => void;
}

function curriculumSummary(state: CurriculumState): string {
  const items = state.selection?.items ?? [];
  const current = items.find((item) => item.status === "current");
  const index = state.selection?.index ?? 0;
  const total = state.topicNames.length;
  if (current) return `${index + 1} of ${total} · ${current.name}`;
  if (total > 0) return `${total} topics`;
  return "Not set";
}

export function CurriculumPanel({ onChanged }: Props) {
  const [state, setState] = useState<CurriculumState | null>(null);
  const [open, setOpen] = useState(false);
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

  const closePanel = () => {
    setOpen(false);
    setEditing(false);
    setError(null);
  };

  const items = state?.selection?.items ?? [];
  const summary = state ? curriculumSummary(state) : "…";
  const focusHint = state?.activeTopicId ? "manual focus" : "auto-advance";

  return (
    <div className={`settings-curriculum${open ? " settings-curriculum--open" : ""}`}>
      <button
        type="button"
        className="settings-row settings-row--expandable"
        aria-expanded={open}
        onClick={() => {
          if (open) closePanel();
          else setOpen(true);
        }}
      >
        <div>
          <div className="settings-row-label">Study curriculum</div>
          <div className="settings-row-hint">
            Topic order for today&apos;s focus · {state ? focusHint : "loading"}
          </div>
        </div>
        <span className="settings-row-value">
          {summary}
          <span className="settings-row-chevron" aria-hidden>
            {open ? "▴" : "▾"}
          </span>
        </span>
      </button>

      {open && state && (
        <div className="settings-expand settings-expand--curriculum">
          {error && <div className="error-banner settings-expand-error">{error}</div>}

          {editing ? (
            <>
              <label className="settings-curriculum-editor">
                Topic order (one per line)
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={8}
                  disabled={busy}
                />
              </label>
              <div className="settings-expand-actions">
                <button
                  type="button"
                  className="btn-primary-v2"
                  onClick={() => void handleSaveTopics()}
                  disabled={busy}
                >
                  Save order
                </button>
                <button
                  type="button"
                  className="btn-ghost-v2"
                  onClick={() => void handleReset()}
                  disabled={busy}
                >
                  Reset default
                </button>
                <button
                  type="button"
                  className="btn-ghost-v2"
                  onClick={() => {
                    setEditing(false);
                    setDraft(state.topicNames.join("\n"));
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <ol className="settings-curriculum-list">
                {items.map((item) => (
                  <li
                    key={item.name}
                    className={`settings-curriculum-item settings-curriculum-item--${item.status}`}
                  >
                    <div className="settings-curriculum-item-main">
                      <span className="settings-curriculum-item-name">{item.name}</span>
                      {item.totalCount > 0 && (
                        <span className="settings-curriculum-item-meta">
                          {item.totalCount - item.unsolvedCount}/{item.totalCount} done
                        </span>
                      )}
                      {item.status === "missing" && (
                        <span className="settings-curriculum-item-meta settings-curriculum-item-meta--warn">
                          not in mirror
                        </span>
                      )}
                    </div>
                    {item.topicId && item.status !== "current" && (
                      <button
                        type="button"
                        className="btn-ghost-v2 settings-curriculum-switch"
                        onClick={() => void handleSwitch(item)}
                        disabled={busy}
                      >
                        Switch
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              <div className="settings-expand-actions">
                {state.activeTopicId && (
                  <button
                    type="button"
                    className="btn-ghost-v2"
                    onClick={() => void handleAutoAdvance()}
                    disabled={busy}
                  >
                    Auto-advance
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost-v2"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                >
                  Edit order
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
