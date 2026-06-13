import { useEffect, useMemo, useRef } from "react";
import { copyToClipboard } from "../lib/copyToClipboard.js";
import { renderMarkdownToHtml } from "../lib/renderMarkdown.js";

interface Props {
  content: string;
  className?: string;
}

const COPIED_LABEL = "Copied!";
const COPY_LABEL = "Copy";
const COPIED_MS = 2000;

function setCodeCopyState(btn: HTMLButtonElement, copied: boolean) {
  btn.classList.toggle("coach-copy-btn--copied", copied);
  btn.setAttribute("aria-label", copied ? COPIED_LABEL : "Copy code");
  const label = btn.querySelector(".coach-copy-btn__label");
  if (label) label.textContent = copied ? COPIED_LABEL : COPY_LABEL;

  const icon = btn.querySelector(".coach-copy-btn__icon");
  if (!icon) return;

  icon.innerHTML = copied
    ? `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
    : `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"></rect><path d="M4.5 10.5h-1a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg>`;
}

/** Renders coach assistant replies with markdown, LaTeX, and copyable code blocks. */
export function CoachMarkdown({ content, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdownToHtml(content), [content]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const timeouts = new Map<HTMLButtonElement, number>();

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const btn = target.closest<HTMLButtonElement>(".coach-copy-btn--code");
      if (!btn || !container.contains(btn)) return;

      event.preventDefault();
      const code = btn.closest(".coach-code-block")?.querySelector("pre code");
      if (!code) return;

      void copyToClipboard(code.textContent ?? "").then((ok) => {
        if (!ok) return;

        const existing = timeouts.get(btn);
        if (existing) window.clearTimeout(existing);

        setCodeCopyState(btn, true);
        const timeoutId = window.setTimeout(() => {
          setCodeCopyState(btn, false);
          timeouts.delete(btn);
        }, COPIED_MS);
        timeouts.set(btn, timeoutId);
      });
    };

    container.addEventListener("click", onClick);
    return () => {
      container.removeEventListener("click", onClick);
      for (const timeoutId of timeouts.values()) window.clearTimeout(timeoutId);
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={className ?? "coach-assistant-text"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
