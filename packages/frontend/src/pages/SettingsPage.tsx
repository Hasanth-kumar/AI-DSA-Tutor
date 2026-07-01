import { useCallback } from "react";
import { api } from "../api/client.js";
import { PageHeader } from "../components/PageHeader.js";
import {
  ACCENT_PRESETS,
  useAppPreferences,
  type Theme,
} from "../hooks/useAppPreferences.js";
import { usePolling } from "../hooks/usePolling.js";
import { formatRelativeTime } from "../lib/formatRelative.js";
import { CurriculumPanel } from "../components/CurriculumPanel.js";
import { SyncConflictsPanel } from "../components/SyncConflictsPanel.js";

const COACH_MODEL_KEY = "dsa-coach-model-id";
const POLL_MS = 60_000;

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`toggle-track${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

export function SettingsPage() {
  const {
    theme,
    accent,
    focusMode,
    accentGlow,
    setTheme,
    setAccent,
    setFocusMode,
    setAccentGlow,
  } = useAppPreferences();

  const fetchSync = useCallback(() => api.getSyncStatus(), []);
  const { data: sync } = usePolling(fetchSync, POLL_MS);

  const fetchLeetCode = useCallback(() => api.getLeetCodeStats(), []);
  const { data: leetcode } = usePolling(fetchLeetCode, POLL_MS, {
    initialLoading: false,
  });

  const fetchModels = useCallback(() => api.getCoachModels(), []);
  const { data: models } = usePolling(fetchModels, POLL_MS, { initialLoading: false });

  const coachModelId =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(COACH_MODEL_KEY)
      : null;
  const coachModelLabel =
    models?.models.find((m) => m.id === coachModelId)?.label ??
    models?.models[0]?.label ??
    "default";

  return (
    <div className="page-content page-content--settings">
      <PageHeader
        title="Settings"
        subtitle="Make it yours — changes apply live."
      />

      <section className="settings-section">
        <div className="settings-section-title">Appearance</div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Theme</div>
            <div className="settings-row-hint">Warm dark, or cream paper</div>
          </div>
          <div className="theme-segment" role="group" aria-label="Theme">
            {(["dark", "light"] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                className={theme === t ? "active" : ""}
                onClick={() => setTheme(t)}
              >
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Accent color</div>
            <div className="settings-row-hint">Tints highlights across every screen</div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`accent-swatch${accent === p.hex ? " active" : ""}`}
                style={{ background: p.hex }}
                aria-label={p.label}
                onClick={() => setAccent(p.hex)}
              />
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Focus mode</div>
            <div className="settings-row-hint">
              Hide momentum & curriculum — one thing at a time
            </div>
          </div>
          <Toggle on={focusMode} onChange={setFocusMode} label="Focus mode" />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Accent glow</div>
            <div className="settings-row-hint">Soft radial behind the focus card</div>
          </div>
          <Toggle on={accentGlow} onChange={setAccentGlow} label="Accent glow" />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Study</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Warm-up cards</div>
            <div className="settings-row-hint">Due cards shown before solving</div>
          </div>
          <span className="settings-row-value">3</span>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Daily review cap</div>
            <div className="settings-row-hint">Hard limit on interleaved cards</div>
          </div>
          <span className="settings-row-value">20</span>
        </div>
        <CurriculumPanel />
      </section>

      <section className="settings-section">
        <div className="settings-section-title">Integrations</div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Notion sync</div>
            <div className="settings-row-hint">
              Source of truth · last synced{" "}
              {sync?.lastSyncAt ? formatRelativeTime(sync.lastSyncAt) : "never"}
            </div>
          </div>
          <span className="status-pill">
            <span className="status-pill-dot" />
            Connected
          </span>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Coach model</div>
            <div className="settings-row-hint">Used for hints, debriefs & chat</div>
          </div>
          <span className="btn-ghost-v2" style={{ cursor: "default" }}>
            {coachModelLabel} <span style={{ fontSize: "0.6rem" }}>▾</span>
          </span>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">LeetCode</div>
            <div className="settings-row-hint">Profile stats & submission streak</div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            {leetcode ? `@${leetcode.username}` : "Not configured"}
          </span>
        </div>
      </section>

      <SyncConflictsPanel />
    </div>
  );
}
