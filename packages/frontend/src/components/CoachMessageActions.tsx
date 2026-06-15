import { CopyButton } from "./CopyButton.js";

interface Props {
  text: string;
  showEdit?: boolean;
  showRetry?: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
  disabled?: boolean;
  align?: "start" | "end";
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13 3v4H9M3 13V9h4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 6.5A5 5 0 0 1 11 3.5L13 3M13 10a5 5 0 0 1-7.5 3.5L3 13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoachMessageActions({
  text,
  showEdit,
  showRetry,
  onEdit,
  onRetry,
  disabled,
  align = "end",
}: Props) {
  return (
    <div
      className={`coach-msg-actions${align === "start" ? " coach-msg-actions--start" : ""}`}
    >
      <CopyButton text={text} title="Copy message" />
      {showEdit && onEdit && (
        <button
          type="button"
          className="coach-copy-btn"
          onClick={onEdit}
          disabled={disabled}
          title="Edit message"
          aria-label="Edit message"
        >
          <span className="coach-copy-btn__icon">
            <EditIcon />
          </span>
        </button>
      )}
      {showRetry && onRetry && (
        <button
          type="button"
          className="coach-copy-btn"
          onClick={onRetry}
          disabled={disabled}
          title="Retry response"
          aria-label="Retry response"
        >
          <span className="coach-copy-btn__icon">
            <RetryIcon />
          </span>
        </button>
      )}
    </div>
  );
}
