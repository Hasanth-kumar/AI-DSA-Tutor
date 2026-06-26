/**
 * Pure card ⇄ Notion-property mapper (design §8). No `@notionhq/client` import,
 * no network — just the shape translation, so it is exhaustively unit-testable
 * offline. {@link NotionSyncTarget} is the only thing that wires these into real
 * API calls.
 *
 * Notion shape (§8): **one database, one row per card**. The card's app UUID is
 * a first-class *property* (never the page id). Field ownership is encoded here:
 * `cardToNotionProperties` writes content **and** the SR write-only mirror +
 * provenance, while `notionPageToContent` reads back **content only** — SR state
 * is local-authoritative and must never round-trip in from Notion (§8).
 */
import type { CardSyncRecord } from "./SyncTarget.js";

/** A Notion property name → declared type, the canonical card-DB schema (§8). */
export const NOTION_CARD_SCHEMA = {
  Front: "title",
  UUID: "rich_text",
  Back: "rich_text",
  Topic: "rich_text",
  Type: "select",
  "Concept Tags": "multi_select",
  // SR runtime mirror (write-only, local-authoritative §8).
  Stability: "number",
  Difficulty: "number",
  Due: "date",
  "Last Review": "date",
  Reps: "number",
  Lapses: "number",
  State: "number",
  Suspended: "checkbox",
  // Provenance (§8).
  Origin: "select",
  "Source Hash": "rich_text",
  "Model Version": "rich_text",
  "Prompt Version": "rich_text",
  "Note Version": "rich_text",
  // Conflict policy keys on this (§8).
  "Updated At": "date",
} as const;

export type NotionCardPropertyName = keyof typeof NOTION_CARD_SCHEMA;

/** Content fields Notion owns (§8) — the only ones a pull writes back locally. */
export const NOTION_CONTENT_PROPERTIES: NotionCardPropertyName[] = [
  "Front",
  "Back",
  "Topic",
  "Type",
  "Concept Tags",
];

// --- tiny property-value builders (the @notionhq/client shapes, untyped) ------

function richText(value: string | null): unknown {
  const content = value ?? "";
  return { rich_text: content ? [{ type: "text", text: { content } }] : [] };
}
function title(value: string): unknown {
  return { title: value ? [{ type: "text", text: { content: value } }] : [] };
}
function number(value: number | null): unknown {
  return { number: value ?? null };
}
function isoDate(ms: number | null): unknown {
  return { date: ms != null ? { start: new Date(ms).toISOString() } : null };
}
function select(value: string | null): unknown {
  return { select: value ? { name: value } : null };
}
function multiSelect(values: string[]): unknown {
  return { multi_select: values.map((name) => ({ name })) };
}
function checkbox(value: boolean): unknown {
  return { checkbox: value };
}

/**
 * Map a card to the full Notion property set (§8): content + SR write-only
 * mirror + provenance + the UUID property. The remote page is created/updated
 * keyed on `notionPageId`, but `UUID` is what a fresh local DB re-keys on.
 */
export function cardToNotionProperties(
  card: CardSyncRecord,
): Record<NotionCardPropertyName, unknown> {
  return {
    Front: title(card.front),
    UUID: richText(card.id),
    Back: richText(card.back),
    Topic: richText(card.topicId),
    Type: select(card.type),
    "Concept Tags": multiSelect(card.conceptTags),
    Stability: number(card.stability),
    Difficulty: number(card.difficulty),
    Due: isoDate(card.due),
    "Last Review": isoDate(card.lastReview),
    Reps: number(card.reps),
    Lapses: number(card.lapses),
    State: number(card.state),
    Suspended: checkbox(card.suspended),
    Origin: select(card.origin),
    "Source Hash": richText(card.sourceHash),
    "Model Version": richText(card.modelVersion),
    "Prompt Version": richText(card.promptVersion),
    "Note Version": richText(card.noteVersion),
    "Updated At": isoDate(card.updatedAt),
  };
}

// --- read-side helpers for a pull (content only, §8) --------------------------

interface NotionPageLike {
  id?: string;
  properties?: Record<string, unknown>;
}

function readPlainText(prop: unknown): string {
  const p = prop as { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }>; title?: Array<{ plain_text?: string; text?: { content?: string } }> };
  const arr = p?.rich_text ?? p?.title ?? [];
  return arr.map((r) => r.plain_text ?? r.text?.content ?? "").join("");
}
function readSelect(prop: unknown): string {
  return (prop as { select?: { name?: string } })?.select?.name ?? "";
}
function readMultiSelect(prop: unknown): string[] {
  const opts = (prop as { multi_select?: Array<{ name?: string }> })?.multi_select ?? [];
  return opts.map((o) => o.name ?? "").filter(Boolean);
}

/** Content extracted from a Notion page on pull (§8 — content fields only). */
export interface PulledCardContent {
  id: string;
  notionPageId: string | null;
  topicId: string | null;
  type: string;
  front: string;
  back: string;
  conceptTags: string[];
}

/**
 * Read **content only** from a Notion page (§8). SR runtime state present on the
 * page is intentionally NOT read — it is a write-only mirror of the
 * local-authoritative value, and reading it back would let stale remote numbers
 * clobber fresh local reviews. `id` comes from the UUID property (never the page
 * id); `notionPageId` is kept solely as the one-way mapping for future updates.
 */
export function notionPageToContent(page: NotionPageLike): PulledCardContent | null {
  const props = page.properties ?? {};
  const id = readPlainText(props.UUID).trim();
  if (!id) return null; // a row without our UUID isn't a card we manage
  const topic = readPlainText(props.Topic).trim();
  return {
    id,
    notionPageId: page.id ?? null,
    topicId: topic ? topic : null,
    type: readSelect(props.Type),
    front: readPlainText(props.Front),
    back: readPlainText(props.Back),
    conceptTags: readMultiSelect(props["Concept Tags"]),
  };
}
