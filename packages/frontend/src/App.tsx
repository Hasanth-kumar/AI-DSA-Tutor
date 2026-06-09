import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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

type Tab = "overview" | "graph" | "activity" | "session" | "coach";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
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

export function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const isMobile = useIsMobile();

  const selectTab = useCallback(
    (id: Tab) => {
      setTab(id);
      if (isMobile) setSidebarCollapsed(true);
    },
    [isMobile],
  );

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
          <div className="sidebar-status">
            <div className="status-dot" />
            <span>Live · auto-refresh 30s</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <Suspense fallback={<div className="card"><p className="muted" style={{ margin: 0 }}>Loading…</p></div>}>
          {tab === "overview" && <OverviewPage />}
          {tab === "coach" && <CoachingPage />}
          {tab === "graph" && <GraphPage />}
          {tab === "activity" && <ActivityPage />}
          {tab === "session" && <SessionPage />}
        </Suspense>
      </main>
    </div>
  );
}
