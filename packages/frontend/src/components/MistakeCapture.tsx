import { useState } from "react";
import { api } from "../api/client.js";
import { MISTAKE_TAG_OPTIONS } from "../types/api.js";

interface Props {
  attemptId: string;
  problemName: string;
  /** Called once tags are saved (or skipped) — return to Today flow. */
  onDone: (tagged: boolean) => void;
}

/**
 * Post-solve reflection (1.4): toggle any number of what-tripped-you-up tags
 * (they co-occur — wrong approach *and* a missed edge case). "Smooth ✓" is the
 * zero-friction exit for a clean solve. Free-text reflection lives in the
 * Obsidian note (offered next in the flow), so this stays tap-only.
 */
export function MistakeCapture({ attemptId, problemName, onDone }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const save = async (tags: string[]) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.setMistake(attemptId, { tags });
      onDone(tags.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  const tags = [...selected];

  return (
    <div className="mistake-capture">
      <div className="mistake-capture-question">
        Anything trip you up on <strong>{problemName}</strong>?
      </div>
      <div className="mistake-capture-options">
        {MISTAKE_TAG_OPTIONS.map((opt) => {
          const active = selected.has(opt.tag);
          return (
            <button
              key={opt.tag}
              type="button"
              className={`btn mistake-tag-btn${active ? " mistake-tag-btn--active" : ""}`}
              aria-pressed={active}
              disabled={saving}
              onClick={() => toggle(opt.tag)}
            >
              {active ? "✓ " : ""}
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="mistake-capture-actions">
        <button
          type="button"
          className="btn btn-ghost mistake-tag-btn"
          disabled={saving}
          onClick={() => void save([])}
        >
          Smooth ✓
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || tags.length === 0}
          onClick={() => void save(tags)}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <div className="error-banner mt-2">{error}</div>}
    </div>
  );
}
