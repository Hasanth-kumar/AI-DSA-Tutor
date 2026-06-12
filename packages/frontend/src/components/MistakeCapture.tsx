import { useState } from "react";
import { api } from "../api/client.js";
import { MISTAKE_TAG_OPTIONS } from "../types/api.js";

interface Props {
  attemptId: string;
  problemName: string;
  /** Called once the tag is saved (or skipped) — return to Today flow. */
  onDone: (tagged: boolean) => void;
}

/** One question, four buttons + skip (1.4). Target interaction cost: ~5 seconds. */
export function MistakeCapture({ attemptId, problemName, onDone }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = async (tag: string | null) => {
    if (saving) return;
    if (tag === null) {
      onDone(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setMistakeTag(attemptId, tag);
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="mistake-capture">
      <div className="mistake-capture-question">
        Why was <strong>{problemName}</strong> hard?
      </div>
      <div className="mistake-capture-options">
        {MISTAKE_TAG_OPTIONS.map((opt) => (
          <button
            key={opt.tag}
            type="button"
            className="btn mistake-tag-btn"
            disabled={saving}
            onClick={() => void choose(opt.tag)}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost mistake-tag-btn"
          disabled={saving}
          onClick={() => void choose(null)}
        >
          Wasn&apos;t hard
        </button>
      </div>
      {error && <div className="error-banner mt-2">{error}</div>}
    </div>
  );
}
