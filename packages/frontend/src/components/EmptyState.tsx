import type { ReactNode } from "react";

interface Props {
  /** Small decorative icon (16px svg); omit for a text-only state. */
  icon?: ReactNode;
  title: string;
  hint?: string;
  /** Optional action button rendered under the message. */
  action?: ReactNode;
  compact?: boolean;
}

/** Shared empty-state pattern: small icon, one-line message, optional action. */
export function EmptyState({ icon, title, hint, action, compact }: Props) {
  return (
    <div className={`empty-state${compact ? " empty-state--compact" : ""}`}>
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {action}
    </div>
  );
}

/* Small 16px icons reused across empty states */

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 1.5a.75.75 0 011.5 0V2h3v-.5a.75.75 0 011.5 0V2H13a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h2v-.5zM3.5 6v6.5h9V6h-9z" />
    </svg>
  );
}

export function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.7 5.3l-4.5 4.5a.75.75 0 01-1.06 0l-2-2a.75.75 0 111.06-1.06l1.47 1.47 3.97-3.97a.75.75 0 111.06 1.06z" />
    </svg>
  );
}

export function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1l1.8 4.2L14 7l-4.2 1.8L8 13l-1.8-4.2L2 7l4.2-1.8L8 1zm5 9l.9 2.1L16 13l-2.1.9L13 16l-.9-2.1L10 13l2.1-.9L13 10z" />
    </svg>
  );
}

export function PlugIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 1.75a.75.75 0 011.5 0V4h1V1.75a.75.75 0 011.5 0V4H12a.75.75 0 010 1.5h-.25v2A3.75 3.75 0 018.75 11.2v3.05a.75.75 0 01-1.5 0V11.2A3.75 3.75 0 014.25 7.5v-2H4A.75.75 0 014 4h2V1.75zm-.25 3.75v2a2.25 2.25 0 004.5 0v-2h-4.5z" />
    </svg>
  );
}
