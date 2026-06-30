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

/**
 * Notion rejects a single rich_text / title text item whose `content` exceeds
 * 2000 characters. Splitting long values into multiple ≤2000-char items keeps a
 * push from being rejected on long cards — the property length limit the design
 * calls out (§8).
 */
export const NOTION_TEXT_LIMIT = 2000;

/**
 * Marker left in the length-limited `Back` *property* of a code-heavy card. The
 * real, formatted content lives in the page-body blocks instead (§8: "keep code
 * in the card body, not Notion properties"). The pull side recognizes this
 * marker and treats the card as local-authoritative so the pointer never
 * clobbers the local content.
 */
export const CODE_IN_BODY_NOTICE =
  "⤵ code / long content in page body — card kept local-authoritative (§8)";

// --- tiny property-value builders (the @notionhq/client shapes, untyped) ------

/** Split a value into Notion text items no longer than {@link NOTION_TEXT_LIMIT}.
 *  Empty / null → `[]` (Notion's "no rich text" shape). */
function textItems(value: string | null): Array<{ type: "text"; text: { content: string } }> {
  const content = value ?? "";
  if (!content) return [];
  const items: Array<{ type: "text"; text: { content: string } }> = [];
  for (let i = 0; i < content.length; i += NOTION_TEXT_LIMIT) {
    items.push({ type: "text", text: { content: content.slice(i, i + NOTION_TEXT_LIMIT) } });
  }
  return items;
}

function richText(value: string | null): unknown {
  return { rich_text: textItems(value) };
}
function title(value: string): unknown {
  return { title: textItems(value) };
}

/**
 * Whether a card's content is code-heavy / oversized for Notion's property
 * fields (§8). True for `cloze` cards (canonical-code blanks), any card whose
 * front or back carries a fenced code block, or content that would overflow a
 * single Notion text item. These cards keep their body in page blocks rather
 * than round-tripping through length/format-limited properties.
 */
export function isCodeHeavy(card: Pick<CardSyncRecord, "type" | "front" | "back">): boolean {
  if (card.type === "cloze") return true;
  if (card.front.includes("```") || card.back.includes("```")) return true;
  return card.front.length > NOTION_TEXT_LIMIT || card.back.length > NOTION_TEXT_LIMIT;
}

/**
 * Page-body blocks for a code-heavy card (§8): the full, formatted Front + Back
 * live here as `code` blocks instead of in the length-limited properties.
 * Returns `[]` for ordinary cards — their content rides in the properties as
 * before, so {@link NotionSyncTarget} only attaches a body when this is non-empty.
 */
export function cardToNotionPageBlocks(card: CardSyncRecord): unknown[] {
  if (!isCodeHeavy(card)) return [];
  const label = (text: string) => ({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: textItems(text) },
  });
  const codeBlock = (content: string) => ({
    object: "block",
    type: "code",
    code: { language: "plain text", rich_text: textItems(content) },
  });
  const blocks: unknown[] = [];
  if (card.front) {
    blocks.push(label("Front"), codeBlock(card.front));
  }
  if (card.back) {
    blocks.push(label("Back"), codeBlock(card.back));
  }
  return blocks;
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
  // Code-heavy cards keep their (long, formatted) answer in the page-body blocks,
  // not this length/format-limited property (§8). A short pointer goes here; the
  // pull recognizes it and keeps the card local-authoritative.
  const back = isCodeHeavy(card) ? CODE_IN_BODY_NOTICE : card.back;
  return {
    Front: title(card.front),
    UUID: richText(card.id),
    Back: richText(back),
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
  /**
   * True when this card's real content lives in page-body blocks (code-heavy,
   * §8) and the pulled `back` property is only {@link CODE_IN_BODY_NOTICE}. Such
   * cards are local-authoritative: the pull must NOT overwrite local content
   * from the pointer (see `applyPulledContent`).
   */
  codeHeavy: boolean;
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
  const type = readSelect(props.Type);
  const front = readPlainText(props.Front);
  const back = readPlainText(props.Back);
  // A pulled card is code-heavy (local-authoritative, §8) when its Back is the
  // page-body pointer, when it is a cloze card, or when fenced code survived in a
  // property — in all cases the property content must not clobber local content.
  const codeHeavy =
    back.trim() === CODE_IN_BODY_NOTICE ||
    type === "cloze" ||
    front.includes("```") ||
    back.includes("```");
  return {
    id,
    notionPageId: page.id ?? null,
    topicId: topic ? topic : null,
    type,
    front,
    back,
    conceptTags: readMultiSelect(props["Concept Tags"]),
    codeHeavy,
  };
}
