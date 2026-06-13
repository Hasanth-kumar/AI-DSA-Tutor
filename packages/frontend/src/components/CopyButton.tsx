import { useState } from "react";
import { copyToClipboard } from "../lib/copyToClipboard.js";

interface Props {
  text: string;
  label?: string;
  copiedLabel?: string;
  title?: string;
  className?: string;
  showLabel?: boolean;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4.5 10.5h-1a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5v1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied!",
  title = "Copy to clipboard",
  className,
  showLabel = false,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      className={`coach-copy-btn${copied ? " coach-copy-btn--copied" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => void handleCopy()}
      title={copied ? copiedLabel : title}
      aria-label={copied ? copiedLabel : title}
    >
      <span className="coach-copy-btn__icon">{copied ? <CheckIcon /> : <CopyIcon />}</span>
      {showLabel && (
        <span className="coach-copy-btn__label">{copied ? copiedLabel : label}</span>
      )}
    </button>
  );
}
