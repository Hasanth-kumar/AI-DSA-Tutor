import katex from "katex";
import { marked, type Tokens } from "marked";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCodeBlock({ text, lang }: Tokens.Code): string {
  const language = lang?.trim() ?? "";
  const langMarkup = language
    ? `<span class="coach-code-lang">${escapeHtml(language)}</span>`
    : `<span class="coach-code-lang coach-code-lang--empty" aria-hidden="true"></span>`;

  return (
    `<div class="coach-code-block">` +
    `<div class="coach-code-header">` +
    langMarkup +
    `<button type="button" class="coach-copy-btn coach-copy-btn--code" aria-label="Copy code">` +
    `<span class="coach-copy-btn__icon" aria-hidden="true">` +
    `<svg viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.4"></rect>` +
    `<path d="M4.5 10.5h-1a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path></svg>` +
    `</span>` +
    `<span class="coach-copy-btn__label">Copy</span>` +
    `</button>` +
    `</div>` +
    `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(text)}</code></pre>` +
    `</div>`
  );
}

marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    code: renderCodeBlock,
  },
});

const MATH_TOKEN = /⟪MATH:(\d+)⟫/g;

function renderMathSegments(markdown: string): { text: string; math: string[] } {
  const math: string[] = [];
  let text = markdown;

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    const html = katex.renderToString(tex.trim(), {
      displayMode: true,
      throwOnError: false,
    });
    math.push(html);
    return `⟪MATH:${math.length - 1}⟫`;
  });

  text = text.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    const html = katex.renderToString(tex.trim(), {
      displayMode: false,
      throwOnError: false,
    });
    math.push(html);
    return `⟪MATH:${math.length - 1}⟫`;
  });

  return { text, math };
}

function restoreMathTokens(html: string, math: string[]): string {
  return html.replace(MATH_TOKEN, (_, index) => math[Number(index)] ?? "");
}

/** Render coach/assistant markdown (GFM + inline/display LaTeX) to HTML. */
export function renderMarkdownToHtml(markdown: string): string {
  const { text, math } = renderMathSegments(markdown);
  const html = marked.parse(text, { async: false }) as string;
  return restoreMathTokens(html, math);
}

const LABELED_LINE = /^\*\*[^*]+\*\*\s*[—–-]/;

/**
 * Flashcard backs often use repeated "**Label** — detail" lines. Turn those
 * into a bullet list so review answers read cleanly instead of one flat blob.
 */
export function normalizeCardAnswerMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const lines = trimmed.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const labeled = lines.filter((line) => LABELED_LINE.test(line));

  if (labeled.length >= 2 && labeled.length === lines.length) {
    return lines.map((line) => `- ${line}`).join("\n");
  }

  return trimmed;
}
