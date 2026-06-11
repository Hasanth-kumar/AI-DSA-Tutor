import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { StatusStrip } from "./components/StatusStrip.js";
import { useLiveEvents } from "./hooks/useLiveEvents.js";

const TodayPage = lazy(() =>
  import("./pages/TodayPage.js").then((m) => ({ default: m.TodayPage })),
);
const OverviewPage = lazy(() =>
  import("./pages/OverviewPage.js").then((m) => ({ default: m.OverviewPage })),
);
const CoachingPage = lazy(() =>
  import("./pages/CoachingPage.js").then((m) => ({ default: m.CoachingPage })),
);
const GraphPage = lazy(() =>
  import("./pages/GraphPage.js").then((m) => ({ default: m.GraphPage })),
);
const ActivityPage = lazy(() =>
  import("./pages/ActivityPage.js").then((m) => ({ default: m.ActivityPage })),
);
const SessionPage = lazy(() =>
  import("./pages/SessionPage.js").then((m) => ({ default: m.SessionPage })),
);

type Tab = "today" | "overview" | "graph" | "activity" | "session" | "coach";
type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "dsa-theme";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  {
    id: "today",
    label: "Today",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5a1 1 0 011 1V3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h3v-.5a1 1 0 011-1zM4.5 6v6.5h7V6h-7zm2 2h3v3h-3V8z" />
      </svg>
    ),
  },
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M2 2h5v5H2V2zm0 7h5v5H2V9zm7-7h5v5H9V2zm0 7h5v5H9V9z" />
      </svg>
    ),
  },
  {
    id: "coach",
    label: "Coach",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 2H2a1 1 0 00-1 1v8a1 1 0 001 1h2v2.5l3-2.5h7a1 1 0 001-1V3a1 1 0 00-1-1zM5 7a1 1 0 110-2 1 1 0 010 2zm3 0a1 1 0 110-2 1 1 0 010 2zm3 0a1 1 0 110-2 1 1 0 010 2z" />
      </svg>
    ),
  },
  {
    id: "graph",
    label: "Knowledge graph",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <circle cx="3" cy="8" r="2" />
        <circle cx="13" cy="3" r="2" />
        <circle cx="13" cy="13" r="2" />
        <circle cx="8" cy="8" r="1.5" />
        <line x1="5" y1="8" x2="6.5" y2="8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9.5" y1="8" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9.5" y1="8" x2="11" y2="11.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: "activity",
    label: "Activity",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="10" width="2" height="5" rx="1" />
        <rect x="4.5" y="7" width="2" height="8" rx="1" />
        <rect x="8" y="4" width="2" height="11" rx="1" />
        <rect x="11.5" y="1" width="2" height="14" rx="1" />
      </svg>
    ),
  },
  {
    id: "session",
    label: "Session tracker",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 6v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M6 1.5h4M8 1.5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

const SHORTCUTS: { key: string; action: string }[] = [
  { key: "s", action: "Start session (Today)" },
  { key: "l", action: "Log / mark done (Today)" },
  { key: "c", action: "Focus coach chat" },
  { key: "?", action: "Toggle this help" },
];

function useIsMobile(breakpoint = 960) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${breakpoint}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isMobile;
}

/** System-preference default + manual toggle, persisted (5.4). */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [theme, toggle];
}

export function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [coachAnchorId, setCoachAnchorId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const isMobile = useIsMobile();
  const { connected: sseConnected } = useLiveEvents();

  const selectTab = useCallback(
    (id: Tab) => {
      setTab(id);
      if (isMobile) setSidebarCollapsed(true);
    },
    [isMobile],
  );

  /** One click from a Today problem card into an anchored coach chat (1.2). */
  const openCoach = useCallback(
    (problemId: string) => {
      setCoachAnchorId(problemId || null);
      selectTab("coach");
    },
    [selectTab],
  );

  // Keyboard shortcuts (5.4): skip when typing or holding modifiers.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (e.key === "Escape") {
        setShowShortcuts(false);
      } else if (e.key === "s") {
        e.preventDefault();
        selectTab("today");
        window.dispatchEvent(new CustomEvent("dsa:start-session"));
      } else if (e.key === "l") {
        e.preventDefault();
        selectTab("today");
        window.dispatchEvent(new CustomEvent("dsa:focus-done"));
      } else if (e.key === "c") {
        e.preventDefault();
        selectTab("coach");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectTab]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const onBrandIconKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleSidebar();
    }
  };

  const showBrandIconInNav = isMobile && sidebarCollapsed;

  const brandIcon = (
    <div
      className="brand-icon"
      role="button"
      tabIndex={0}
      aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!sidebarCollapsed}
      onClick={(e) => {
        e.stopPropagation();
        toggleSidebar();
      }}
      onKeyDown={onBrandIconKeyDown}
    >
      <svg viewBox="0 0 16 16">
        <path d="M8 1L2 4.5v5L8 13l6-3.5v-5L8 1zm0 2.2l3.8 2.2L8 7.6 4.2 5.4 8 3.2zM3.5 6.8L7 8.7V11L3.5 9V6.8zm5 4.2V8.7l3.5-1.9V9L8.5 11z" />
      </svg>
    </div>
  );

  return (
    <div
      className={`app-shell${isMobile ? " app-shell--mobile" : ""}${sidebarCollapsed ? " sidebar-collapsed" : ""}${tab === "coach" ? " coach-active" : ""}`}
    >
      <aside className={`sidebar${sidebarCollapsed ? " sidebar--collapsed" : ""}`}>
        {!showBrandIconInNav && (
          <div className="brand">
            {brandIcon}
            <div className="brand-text">
              <strong>DSA Mastery OS</strong>
              <span>intelligence layer</span>
            </div>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d={sidebarCollapsed ? "M6 4l4 4-4 4" : "M10 4l-4 4 4 4"} />
            </svg>
          </button>
          </div>
        )}

        <div className="nav-section-label">Navigation</div>

        <nav className="nav">
          {showBrandIconInNav && brandIcon}
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "active" : ""}
              onClick={() => selectTab(t.id)}
            >
              {t.icon}
              <span className="nav-label">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "☀" : "☾"}
            <span className="nav-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <div className="sidebar-status">
            <div className={`status-dot${sseConnected ? "" : " status-dot--idle"}`} />
            <span>{sseConnected ? "Live · push updates" : "Polling fallback"}</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <StatusStrip />
        <Suspense fallback={<div className="card"><p className="muted" style={{ margin: 0 }}>Loading…</p></div>}>
          {tab === "today" && <TodayPage onOpenCoach={openCoach} />}
          {tab === "overview" && <OverviewPage />}
          {tab === "coach" && <CoachingPage anchorProblemId={coachAnchorId} />}
          {tab === "graph" && <GraphPage />}
          {tab === "activity" && <ActivityPage />}
          {tab === "session" && <SessionPage />}
        </Suspense>
      </main>

      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal card" onClick={(e) => e.stopPropagation()}>
            <h3>Keyboard shortcuts</h3>
            <ul>
              {SHORTCUTS.map((s) => (
                <li key={s.key}>
                  <kbd>{s.key}</kbd>
                  <span>{s.action}</span>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>
              Press <kbd>Esc</kbd> or click outside to close.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
