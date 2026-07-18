import type { CSSProperties, ReactNode } from "react";
import type { NavMeta } from "../hooks/useNavMeta.js";

export type AppTab =
  | "today"
  | "overview"
  | "review"
  | "resolve"
  | "graph"
  | "activity"
  | "session"
  | "coach"
  | "settings";

interface NavItem {
  id: AppTab;
  label: string;
  icon: ReactNode;
  context?: (meta: NavMeta) => string | null;
  badge?: (meta: NavMeta) => number | null;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "today",
    label: "Today",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5a1 1 0 011 1V3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1h3v-.5a1 1 0 011-1zM4.5 6v6.5h7V6h-7zm2 2h3v3h-3V8z" />
      </svg>
    ),
    context: (m) =>
      m.todayTopic
        ? `${m.todayTopic}${m.todayDuration ? ` · ~${m.todayDuration}m` : ""}`
        : null,
  },
  {
    id: "coach",
    label: "Coach",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M14 2H2a1 1 0 00-1 1v8a1 1 0 001 1h2v2.5l3-2.5h7a1 1 0 001-1V3a1 1 0 00-1-1zM5 7a1 1 0 110-2 1 1 0 010 2zm3 0a1 1 0 110-2 1 1 0 010 2zm3 0a1 1 0 110-2 1 1 0 010 2z" />
      </svg>
    ),
    context: (m) => (m.coachContext ? `${m.coachContext} thread` : null),
  },
  {
    id: "review",
    label: "Review",
    icon: (
      <svg viewBox="0 0 16 16">
        <rect x="2" y="3" width="9" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 1.5h9a1 1 0 011 1v10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="4.5" y1="9" x2="8.5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    context: (m) =>
      m.reviewDue != null && m.reviewDue > 0 ? `${m.reviewDue} cards due now` : null,
    badge: (m) => (m.reviewDue && m.reviewDue > 0 ? m.reviewDue : null),
  },
  {
    id: "resolve",
    label: "Re-solve",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2v3h-3" strokeLinecap="round" />
        <path d="M6 8l1.5 1.5L10.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    context: (m) =>
      m.resolveDue != null && m.resolveDue > 0
        ? `${m.resolveDue} problem${m.resolveDue === 1 ? "" : "s"} due`
        : null,
    badge: (m) => (m.resolveDue && m.resolveDue > 0 ? m.resolveDue : null),
  },
  {
    id: "session",
    label: "Session",
    icon: (
      <svg viewBox="0 0 16 16">
        <circle cx="8" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 6v3.5l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M6 1.5h4M8 1.5V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
    context: () => "Last 30 days",
  },
  {
    id: "graph",
    label: "Graph",
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
    context: (m) =>
      m.topicCount != null ? `${m.topicCount} topics mapped` : null,
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
    context: (m) =>
      m.streakDays != null && m.streakDays > 0
        ? `${m.streakDays}-day streak`
        : null,
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="8" cy="8" r="2.2" />
        <path d="M8 1.4v1.6M8 13v1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M1.4 8h1.6M13 8h1.6M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
      </svg>
    ),
  },
];

const MID = (NAV_ITEMS.length - 1) / 2;

interface Props {
  tab: AppTab;
  meta: NavMeta;
  theme: "dark" | "light";
  onSelect: (tab: AppTab) => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
}

function ThemeIcon({ theme }: { theme: "dark" | "light" }) {
  return theme === "dark" ? (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="3.2" />
      <path
        d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"
        strokeLinecap="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M11.2 10.6A5.4 5.4 0 016.1 2.8a5.6 5.6 0 107.1 7.8z" />
    </svg>
  );
}

export function Sidebar({
  tab,
  meta,
  theme,
  onSelect,
  onToggleTheme,
  onOpenShortcuts,
}: Props) {
  return (
    <>
      <aside className="sidebar-v2 fan-nav">
        <div className="fan-scrim" aria-hidden />
        <nav className="nav-v2" aria-label="Primary">
          {NAV_ITEMS.map((item, i) => {
            const row = i - MID;
            const theta = (row / MID) * (Math.PI / 2.6);
            const style = {
              "--row": row,
              "--bow": Math.cos(theta).toFixed(4),
              "--d": `${Math.round(Math.abs(row) * 28)}ms`,
            } as CSSProperties;
            const ctx = item.context?.(meta);
            const badge = item.badge?.(meta);
            return (
              <button
                key={item.id}
                type="button"
                style={style}
                className={`nav-v2-btn${tab === item.id ? " active" : ""}${
                  item.id === "settings" ? " nav-v2-btn--settings" : ""
                }`}
                aria-current={tab === item.id ? "page" : undefined}
                aria-label={item.label}
                onClick={() => onSelect(item.id)}
              >
                <span className="nav-v2-tile">
                  {item.icon}
                  {badge != null && <span className="nav-v2-badge">{badge}</span>}
                </span>
                <span className="nav-v2-body">
                  <span className="nav-v2-label">{item.label}</span>
                  {ctx && <span className="nav-v2-context">{ctx}</span>}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-v2-footer">
          <div className="sidebar-v2-actions" role="group" aria-label="Quick controls">
            <button
              type="button"
              className={`sidebar-v2-icon-btn${tab === "settings" ? " active" : ""}`}
              onClick={() => onSelect("settings")}
              aria-label="Settings"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                <circle cx="8" cy="8" r="2.2" />
                <path d="M8 1.4v1.6M8 13v1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M1.4 8h1.6M13 8h1.6M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
              </svg>
              <span className="sidebar-v2-icon-label">Settings</span>
            </button>
            <button
              type="button"
              className="sidebar-v2-icon-btn"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              <ThemeIcon theme={theme} />
              <span className="sidebar-v2-icon-label">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </button>
          </div>
        </div>
      </aside>

      <div className="corner-utils" role="group" aria-label="Quick controls">
        <button
          type="button"
          onClick={onOpenShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (⌘K)"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <rect x="1.5" y="4" width="13" height="8.5" rx="1.5" />
            <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 8.75h.01M11.5 8.75h.01M5.5 10.5h5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode (T)" : "Dark mode (T)"}
        >
          <ThemeIcon theme={theme} />
        </button>
      </div>
    </>
  );
}
