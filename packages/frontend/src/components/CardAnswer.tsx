import { useMemo } from "react";
import { normalizeCardAnswerMarkdown, renderMarkdownToHtml } from "../lib/renderMarkdown.js";

interface Props {
  content: string;
  className?: string;
}

/** Renders a flashcard back with markdown and labeled-line list formatting. */
export function CardAnswer({ content, className }: Props) {
  const html = useMemo(
    () => renderMarkdownToHtml(normalizeCardAnswerMarkdown(content)),
    [content],
  );

  return (
    <div
      className={className ?? "warmup-answer-markdown coach-assistant-text"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
