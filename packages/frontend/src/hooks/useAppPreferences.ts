import { useCallback, useEffect, useState } from "react";

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

const THEME_VARS: Record<Theme, Record<string, string>> = {
  dark: {
    "--bg": "#181715",
    "--bg-elevated": "#1f1e1b",
    "--bg-card": "#252320",
    "--bg-surface": "#2c2a26",
    "--border": "rgba(250,249,245,0.09)",
    "--border-soft": "rgba(250,249,245,0.05)",
    "--border-strong": "rgba(250,249,245,0.15)",
    "--text": "#faf9f5",
    "--text-muted": "#a09d96",
    "--text-subtle": "#6c6a64",
    "--heat-0": "#2c2a26",
    "--heat-1": "#2c2a26",
    "--overlay": "rgba(24, 23, 21, 0.72)",
  },
  light: {
    "--bg": "#f3f0e8",
    "--bg-elevated": "#faf8f2",
    "--bg-card": "#fffdf8",
    "--bg-surface": "#ece7dc",
    "--border": "rgba(41,38,32,0.13)",
    "--border-soft": "rgba(41,38,32,0.07)",
    "--border-strong": "rgba(41,38,32,0.2)",
    "--text": "#2a2722",
    "--text-muted": "#6f6a60",
    "--text-subtle": "#9c958a",
    "--heat-0": "#e7e2d6",
    "--heat-1": "#e7e2d6",
    "--overlay": "rgba(20, 20, 19, 0.45)",
  },
};

interface Prefs {
  theme: Theme;
  accent: string;
  focusMode: boolean;
  accentGlow: boolean;
}

function hexAlpha(hex: string, alpha: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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

  for (const [k, v] of Object.entries(THEME_VARS[theme])) {
    root.style.setProperty(k, v);
  }

  const softAlpha = theme === "light" ? 0.15 : 0.12;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-hover", accent);
  root.style.setProperty("--accent-soft", hexAlpha(accent, softAlpha));
  root.style.setProperty("--accent-ring", hexAlpha(accent, 0.3));
}

let prefsState: Prefs = typeof window !== "undefined" ? loadPrefs() : {
  theme: "dark",
  accent: ACCENT_PRESETS[0].hex,
  focusMode: false,
  accentGlow: true,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

function setPrefs(patch: Partial<Prefs>): void {
  prefsState = { ...prefsState, ...patch };
  if (patch.theme != null) localStorage.setItem(THEME_KEY, patch.theme);
  if (patch.accent != null) localStorage.setItem(ACCENT_KEY, patch.accent);
  if (patch.focusMode != null) localStorage.setItem(FOCUS_KEY, String(patch.focusMode));
  if (patch.accentGlow != null) localStorage.setItem(GLOW_KEY, String(patch.accentGlow));
  applyPreferences(prefsState);
  emit();
}

if (typeof window !== "undefined") {
  applyPreferences(prefsState);
}

export function useAppPreferences() {
  const [, tick] = useState(0);

  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const { theme, accent, focusMode, accentGlow } = prefsState;

  const setTheme = useCallback((next: Theme) => setPrefs({ theme: next }), []);
  const toggleTheme = useCallback(
    () => setPrefs({ theme: theme === "dark" ? "light" : "dark" }),
    [theme],
  );
  const setAccent = useCallback((hex: string) => setPrefs({ accent: hex }), []);
  const setFocusMode = useCallback((on: boolean) => setPrefs({ focusMode: on }), []);
  const setAccentGlow = useCallback((on: boolean) => setPrefs({ accentGlow: on }), []);

  return {
    theme,
    accent,
    focusMode,
    accentGlow,
    setTheme,
    toggleTheme,
    setAccent,
    setFocusMode,
    setAccentGlow,
  };
}
