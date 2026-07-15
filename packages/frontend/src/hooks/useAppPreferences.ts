import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const ACCENT_PRESETS = [
  { id: "coral", hex: "#cc785c", label: "Coral" },
  { id: "amber", hex: "#c98a4b", label: "Amber" },
  { id: "sage", hex: "#7c9885", label: "Sage" },
  { id: "slate", hex: "#6f8fb0", label: "Slate" },
] as const;

const THEME_KEY = "dsa-theme";
const ACCENT_KEY = "dsa-accent";
const FOCUS_KEY = "dsa-focus-mode";
const GLOW_KEY = "dsa-accent-glow";

/** Survive Vite HMR so toggle listeners stay attached to the same store. */
const STORE_KEY = "__dsaAppPreferencesStore__";

/** Light-mode ink for each accent (Atelier Editorial inkMap). */
const ACCENT_INK_LIGHT: Record<string, string> = {
  "#cc785c": "#a8502e",
  "#c98a4b": "#a06d2a",
  "#7c9885": "#3e7d54",
  "#6f8fb0": "#3465c0",
  // Design-doc extras kept for forward compat
  "#7fbb8f": "#3e7d54",
  "#6ba8ff": "#3465c0",
  "#e0a75e": "#a06d2a",
};

/**
 * Full surface/type/chrome tokens per theme.
 * Mirrors Atelier Editorial `renderVals` (vBg / vPanel / vLine / vBtn / …).
 * Applied as inline custom properties so every screen updates together.
 */
const THEME_VARS: Record<Theme, Record<string, string>> = {
  /* Deep warm-black from Design Explorations 2a / Atelier fusion brief */
  dark: {
    "--bg": "#0f0e0c",
    "--bg-elevated": "#141210",
    "--bg-card": "#1a1815",
    "--bg-surface": "#221f1a",
    "--border": "rgba(245,242,234,0.10)",
    "--border-soft": "rgba(245,242,234,0.06)",
    "--border-strong": "rgba(245,242,234,0.16)",
    "--ghost": "rgba(245,242,234,0.04)",
    "--text": "#f5f2ea",
    "--text-muted": "#9b968b",
    "--text-subtle": "#67635a",
    "--btn": "#f5f2ea",
    "--btn-text": "#0f0e0c",
    "--on-accent": "#f5f2ea",
    "--success": "#7fbb8f",
    "--success-soft": "rgba(127,187,143,0.13)",
    "--warning": "#e0a75e",
    "--warning-soft": "rgba(224,167,94,0.13)",
    "--danger": "#d96c5a",
    "--danger-soft": "rgba(217,108,90,0.14)",
    "--info": "#5db8a6",
    "--heat-0": "rgba(245,242,234,0.06)",
    "--heat-1": "rgba(245,242,234,0.06)",
    "--skeleton-sheen": "rgba(250,249,245,0.04)",
    "--overlay": "rgba(15,14,12,0.78)",
    "--shadow-sm": "0 1px 2px rgba(0,0,0,0.28)",
    "--shadow": "0 2px 8px rgba(0,0,0,0.36)",
    "--shadow-lg": "0 8px 24px rgba(0,0,0,0.48)",
  },
  light: {
    "--bg": "#f4f1e9",
    "--bg-elevated": "#efeadd",
    "--bg-card": "#e7e1d2",
    "--bg-surface": "#ddd6c4",
    "--border": "rgba(34,30,21,0.16)",
    "--border-soft": "rgba(34,30,21,0.09)",
    "--border-strong": "rgba(34,30,21,0.24)",
    "--ghost": "rgba(34,30,21,0.05)",
    "--text": "#221e15",
    "--text-muted": "#6d6759",
    "--text-subtle": "#9a927d",
    "--btn": "#221e15",
    "--btn-text": "#f4f1e9",
    "--on-accent": "#ffffff",
    "--success": "#3e7d54",
    "--success-soft": "rgba(62,125,84,0.10)",
    "--warning": "#a06d2a",
    "--warning-soft": "rgba(160,109,42,0.10)",
    "--danger": "#a83e2e",
    "--danger-soft": "rgba(168,62,46,0.10)",
    "--info": "#5e83a8",
    "--heat-0": "rgba(34,30,21,0.09)",
    "--heat-1": "rgba(34,30,21,0.09)",
    "--skeleton-sheen": "rgba(255,255,255,0.6)",
    "--overlay": "rgba(20,20,19,0.45)",
    "--shadow-sm": "0 1px 2px rgba(80,55,35,0.07)",
    "--shadow": "0 4px 10px rgba(80,55,35,0.09)",
    "--shadow-lg": "0 8px 28px rgba(80,55,35,0.12)",
  },
};

interface Prefs {
  theme: Theme;
  accent: string;
  focusMode: boolean;
  accentGlow: boolean;
}

interface PrefsStore {
  state: Prefs;
  listeners: Set<() => void>;
}

function hexAlpha(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function accentInkFor(theme: Theme, accent: string): string {
  if (theme === "dark") return accent;
  return ACCENT_INK_LIGHT[accent.toLowerCase()] ?? accent;
}

function readTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function loadPrefs(): Prefs {
  return {
    theme: readTheme(),
    accent: localStorage.getItem(ACCENT_KEY) ?? ACCENT_PRESETS[0].hex,
    focusMode: readBool(FOCUS_KEY, false),
    accentGlow: readBool(GLOW_KEY, true),
  };
}

function applyPreferences({ theme, accent }: Prefs): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  for (const [k, v] of Object.entries(THEME_VARS[theme])) {
    root.style.setProperty(k, v);
  }

  const softAlpha = theme === "light" ? 0.16 : 0.12;
  const ink = accentInkFor(theme, accent);

  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-ink", ink);
  root.style.setProperty("--accent-hover", accent);
  root.style.setProperty("--accent-soft", hexAlpha(accent, softAlpha));
  root.style.setProperty("--accent-ring", hexAlpha(accent, softAlpha * 2));

  // Heatmap intensity ramp — same alphas as Atelier Editorial heatAlpha
  root.style.setProperty("--heat-fill-1", hexAlpha(accent, 0.22));
  root.style.setProperty("--heat-fill-2", hexAlpha(accent, 0.5));
  root.style.setProperty("--heat-fill-3", hexAlpha(accent, 0.95));
  // Legacy heatmap classes still read --heat-2/3/4
  root.style.setProperty("--heat-2", hexAlpha(accent, 0.22));
  root.style.setProperty("--heat-3", hexAlpha(accent, 0.5));
  root.style.setProperty("--heat-4", hexAlpha(accent, 0.95));
}

const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  accent: ACCENT_PRESETS[0].hex,
  focusMode: false,
  accentGlow: true,
};

function getStore(): PrefsStore {
  const g = globalThis as typeof globalThis & { [STORE_KEY]?: PrefsStore };
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = {
      state: typeof window !== "undefined" ? loadPrefs() : { ...DEFAULT_PREFS },
      listeners: new Set(),
    };
  }
  return g[STORE_KEY];
}

function emit(): void {
  for (const fn of getStore().listeners) fn();
}

function setPrefs(patch: Partial<Prefs>): void {
  const store = getStore();
  store.state = { ...store.state, ...patch };
  if (patch.theme != null) localStorage.setItem(THEME_KEY, patch.theme);
  if (patch.accent != null) localStorage.setItem(ACCENT_KEY, patch.accent);
  if (patch.focusMode != null) localStorage.setItem(FOCUS_KEY, String(patch.focusMode));
  if (patch.accentGlow != null) localStorage.setItem(GLOW_KEY, String(patch.accentGlow));
  applyPreferences(store.state);
  emit();
}

function subscribe(onStoreChange: () => void): () => void {
  const { listeners } = getStore();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): Prefs {
  return getStore().state;
}

function getServerSnapshot(): Prefs {
  return DEFAULT_PREFS;
}

if (typeof window !== "undefined") {
  applyPreferences(getStore().state);
}

export function useAppPreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => setPrefs({ theme: next }), []);
  const toggleTheme = useCallback(() => {
    const current = getStore().state.theme;
    setPrefs({ theme: current === "dark" ? "light" : "dark" });
  }, []);
  const setAccent = useCallback((hex: string) => setPrefs({ accent: hex }), []);
  const setFocusMode = useCallback((on: boolean) => setPrefs({ focusMode: on }), []);
  const setAccentGlow = useCallback((on: boolean) => setPrefs({ accentGlow: on }), []);

  return {
    theme: prefs.theme,
    accent: prefs.accent,
    focusMode: prefs.focusMode,
    accentGlow: prefs.accentGlow,
    setTheme,
    toggleTheme,
    setAccent,
    setFocusMode,
    setAccentGlow,
  };
}
