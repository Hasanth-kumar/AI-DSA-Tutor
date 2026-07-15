import type { ReactNode } from "react";
import { BrandLogoMark } from "./BrandLogo.js";
import { formatRelativeTime } from "../lib/formatRelative.js";
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

const STUDY_NAV: NavItem[] = [
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
];

const INSIGHTS_NAV: NavItem[] = [
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
];

interface Props {
  tab: AppTab;
  meta: NavMeta;
  theme: "dark" | "light";
  collapsed: boolean;
  onSelect: (tab: AppTab) => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  onToggleCollapse: () => void;
}

function StreakFlameIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M8 1.5C8 4 5 4.5 5 7.5a3 3 0 006 0c0-1.2-.5-2-1-2.6 0 1-.6 1.6-1.2 1.6C8.2 6.5 9 4 8 1.5z"
        fill="var(--accent)"
      />
    </svg>
  );
}

function NavGroup({
  label,
  items,
  tab,
  meta,
  collapsed,
  onSelect,
}: {
  label: string;
  items: NavItem[];
  tab: AppTab;
  meta: NavMeta;
  collapsed: boolean;
  onSelect: (tab: AppTab) => void;
}) {
  return (
    <>
      <div className="nav-group-label">{label}</div>
      <nav className="nav-v2" aria-label={label}>
        {items.map((item) => {
          const ctx = item.context?.(meta);
          const badge = item.badge?.(meta);
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-v2-btn${tab === item.id ? " active" : ""}`}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => onSelect(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-v2-rail" aria-hidden />
              <span className="nav-v2-tile">{item.icon}</span>
              <span className="nav-v2-body">
                <span className="nav-v2-label">{item.label}</span>
                {ctx && <span className="nav-v2-context">{ctx}</span>}
              </span>
              {badge != null && <span className="nav-v2-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar({
  tab,
  meta,
  theme,
  collapsed,
  onSelect,
  onToggleTheme,
  onOpenShortcuts,
  onToggleCollapse,
}: Props) {
  const streakDays = meta.streakDays ?? 0;
  const streakPct = streakDays > 0 ? Math.min(100, (streakDays / 21) * 100) : 0;
  const dashOffset = 87.96 - (streakPct / 100) * 87.96;

  return (
    <aside className={`sidebar-v2${collapsed ? " sidebar-v2--collapsed" : ""}`}>
      <div className="brand-v2">
        <button
          type="button"
          className="brand-v2-icon"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          <BrandLogoMark />
        </button>
        <div className="brand-v2-text">
          <strong>DSA Mastery OS</strong>
          <span>LEARNING GUIDE</span>
        </div>
      </div>

      <button
        type="button"
        className="search-pill"
        onClick={onOpenShortcuts}
        title="Keyboard shortcuts"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" strokeLinecap="round" />
        </svg>
        <span>Jump to…</span>
        <kbd>⌘K</kbd>
      </button>

      <NavGroup
        label="Study"
        items={STUDY_NAV}
        tab={tab}
        meta={meta}
        collapsed={collapsed}
        onSelect={onSelect}
      />
      <NavGroup
        label="Insights"
        items={INSIGHTS_NAV}
        tab={tab}
        meta={meta}
        collapsed={collapsed}
        onSelect={onSelect}
      />

      <div className="sidebar-v2-footer">
        {meta.streakDays != null && (
          <div className="streak-widget" title={`${streakDays}-day streak`}>
            <div className="streak-widget-ring">
              <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
                <circle cx="17" cy="17" r="14" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle
                  cx="17"
                  cy="17"
                  r="14"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="87.96"
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 17 17)"
                />
              </svg>
              <div className="streak-widget-flame">
                <StreakFlameIcon />
              </div>
            </div>
            <div className="streak-widget-body">
              <div className="streak-widget-value">{streakDays}-day streak</div>
            </div>
          </div>
        )}

        <div className="sidebar-v2-actions" role="group" aria-label="Sidebar controls">
          <button
            type="button"
            className={`sidebar-v2-icon-btn${tab === "settings" ? " active" : ""}`}
            onClick={() => onSelect("settings")}
            aria-label="Settings"
            title={
              collapsed
                ? tab === "settings" && meta.syncLabel
                  ? `Settings · Synced ${formatRelativeTime(meta.syncLabel)}`
                  : "Settings"
                : undefined
            }
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
            title={collapsed ? (theme === "dark" ? "Light mode (T)" : "Dark mode (T)") : undefined}
          >
            {theme === "dark" ? (
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
            )}
            <span className="sidebar-v2-icon-label">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
