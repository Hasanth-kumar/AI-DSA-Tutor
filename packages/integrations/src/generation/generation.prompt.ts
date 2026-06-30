/**
 * Batch card-generation prompt (design §2, §4, §5).
 *
 * The prompt is **coverage-driven, not "generate N cards"**: it is handed the
 * list of *uncovered* concept ids (computed deterministically from the DB vs.
 * the closed `concepts.yaml` vocabulary) and asked to produce cards ONLY for
 * those. Two hard rules are baked in:
 *
 *   - **Closed vocabulary (§4):** the model may tag a card with the supplied
 *     concept ids *only* — it may never invent a tag. (App-side enforcement in
 *     `generation.ts` strips anything that slips through; the prompt is the
 *     first line of defence, not the last.)
 *   - **Stage-A dedup (§5):** the model is shown the existing card fronts for the
 *     topic and told not to repeat them. (Stage B — the semantic check — always
 *     runs afterwards regardless; the LLM's word is never trusted alone.)
 *
 * Notes are the source of truth (§2): the user's own note content is the primary
 * material the cards are derived from, including the `## Mistakes` section which
 * feeds mistake-derived cards (§3).
 */
import { CARD_TYPES } from "@dsa/database/schema";
import type { ConfusionPair } from "../embeddings/confusion.js";

/** Bumped when the prompt text changes — persisted per card as provenance (§8). */
export const GENERATION_PROMPT_VERSION = "gen-v1";

// Re-export so callers only need to import from generation.prompt.
export type { ConfusionPair };

export interface GenerationConcept {
  id: string;
  description?: string;
}

export interface GenerationPromptContext {
  topicName: string;
  /** The uncovered concept ids the run must target (with optional descriptions). */
  uncovered: GenerationConcept[];
  /** The user's note material — source of truth for card content (§2). */
  noteExcerpts: { title: string; excerpt: string }[];
  /**
   * The `## Mistakes` sections pulled verbatim from the user's notes (§3).
   * Surfaced as a dedicated, un-truncated block so the model derives
   * mistake-targeting cards from *the learner's own gaps* rather than hoping the
   * 1.2k-char excerpt happened to keep the heading. Empty/omitted when no note
   * has a Mistakes section.
   */
  mistakeNotes?: { title: string; mistakes: string }[];
  /** Fronts of cards already in the bank for this topic — Stage-A dedup (§5). */
  existingFronts: string[];
  /** Max cards per concept (2–3 angles) — keeps the bank lean (§4). */
  maxPerConcept: number;
  /**
   * Semantically close cross-concept card pairs found via the embedding store
   * (§3 confusion-pair). When non-empty the prompt asks the model to produce
   * "confusion-pair" discrimination cards for these pairings — "when do you use
   * A instead of B?" — targeting the concepts the learner actually confuses.
   * Absent/empty when the embedding store has no vectors yet.
   */
  confusionPairs?: ConfusionPair[];
}

/**
 * Pull the `## Mistakes` section out of a markdown note (design §3). The section
 * runs from a `## Mistakes`-style heading to the next heading of the same/higher
 * level (or EOF). Returns the body text, or `null` when the note has no such
 * section. This is what makes mistake-derived cards target *your* actual gaps.
 */
export function extractMistakeSection(noteContent: string): string | null {
  const lines = noteContent.split(/\r?\n/);
  let capture = false;
  let headingLevel = 0;
  const body: string[] = [];

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const title = heading[2]!.trim().toLowerCase();
      if (!capture && /^mistakes?\b/.test(title)) {
        capture = true;
        headingLevel = level;
        continue;
      }
      if (capture && level <= headingLevel) break; // next same/higher section
    }
    if (capture) body.push(line);
  }

  const text = body.join("\n").trim();
  return text.length > 0 ? text : null;
}

function noteBlock(ctx: GenerationPromptContext): string {
  if (ctx.noteExcerpts.length === 0) {
    return `The learner has no notes on ${ctx.topicName} yet — derive cards from the concept list and standard DSA knowledge.`;
  }
  return (
    `The learner's own notes on ${ctx.topicName} (the SOURCE OF TRUTH — derive cards from this material, ` +
    `including any "## Mistakes" section for mistake-derived cards):\n` +
    ctx.noteExcerpts.map((n) => `--- note: ${n.title} ---\n${n.excerpt}`).join("\n\n")
  );
}

/**
 * Dedicated `## Mistakes` block (§3). When the learner's notes carry a Mistakes
 * section, hand it to the model verbatim and explicitly ask for `mistake-derived`
 * cards that target those specific errors — the highest personal-value card type.
 * Returns `""` (no block) when there is no mistake material, so the prompt stays
 * lean for topics without one.
 */
function mistakeBlock(ctx: GenerationPromptContext): string {
  const notes = (ctx.mistakeNotes ?? []).filter((n) => n.mistakes.trim().length > 0);
  if (notes.length === 0) return "";
  return (
    `\nThe learner's OWN past mistakes on ${ctx.topicName} (from the "## Mistakes" sections of their notes). ` +
    `For any uncovered concept these touch, prefer a "mistake-derived" card that confronts the specific error ` +
    `(e.g. "you first reached for nested loops — why doesn't that scale?"):\n` +
    notes.map((n) => `--- mistakes: ${n.title} ---\n${n.mistakes.trim()}`).join("\n\n") +
    "\n"
  );
}

/**
 * Confusion-pair block (§3). When the embedding store has found semantically
 * close cross-concept pairs, tell the model about them and ask for
 * discrimination cards ("confusion-pair" type). Returns "" when there are no
 * pairs so the prompt stays lean for new topics without embeddings.
 */
function confusionBlock(ctx: GenerationPromptContext): string {
  const pairs = (ctx.confusionPairs ?? []).filter(
    (p) => p.frontA.trim().length > 0 && p.frontB.trim().length > 0,
  );
  if (pairs.length === 0) return "";
  const lines = pairs
    .map(
      (p, i) =>
        `  ${i + 1}. [${[...p.conceptsA].join(", ")}] "${p.frontA}"` +
        `\n     vs [${[...p.conceptsB].join(", ")}] "${p.frontB}"`,
    )
    .join("\n");
  return (
    `\nThe embedding store found these semantically similar cross-concept pairs — ` +
    `concepts the learner likely confuses. For any uncovered concept that appears in ` +
    `a pair below, prefer a "confusion-pair" discrimination card that asks ` +
    `"when / why do you use X instead of Y?":\n` +
    lines +
    "\n"
  );
}

function existingBlock(ctx: GenerationPromptContext): string {
  if (ctx.existingFronts.length === 0) {
    return "There are no existing cards for this topic yet.";
  }
  return (
    "Existing cards already in the bank (DO NOT repeat or paraphrase these — Stage-A dedup):\n" +
    ctx.existingFronts.map((f) => `- ${f}`).join("\n")
  );
}

/**
 * Build the generation prompt. The model is told to emit cards only for the
 * uncovered concepts, tag them from the closed vocabulary only, and avoid the
 * existing fronts. There is intentionally NO fixed "produce N cards" target —
 * the work is bounded by the uncovered-concept list and the per-concept cap.
 */
export function buildGenerationPrompt(ctx: GenerationPromptContext): string {
  const conceptLines = ctx.uncovered
    .map((c) => (c.description ? `- ${c.id}: ${c.description}` : `- ${c.id}`))
    .join("\n");

  return `You expand a spaced-repetition flashcard bank for a DSA topic: "${ctx.topicName}".

${noteBlock(ctx)}
${mistakeBlock(ctx)}
${confusionBlock(ctx)}
${existingBlock(ctx)}

Produce flashcards ONLY for these currently-uncovered concepts (do not generate cards for any concept not in this list):
${conceptLines}

Hard rules:
- Tag each card using ONLY the concept ids listed above. NEVER invent a new tag, rename one, or use a tag outside this list. A card with an unlisted tag is discarded.
- Use ONLY these card types: ${CARD_TYPES.join(", ")}.
- Aim for 1 card per uncovered concept; at most ${ctx.maxPerConcept} cards may share a concept. Do NOT pad to a fixed count — cover the concepts, then stop.
- Each card must be answerable from memory (concept knowledge: pattern, complexity, invariant, canonical line), not a walkthrough of one specific problem.
- "front" = the question/prompt; "back" = the terse model answer (Anki-style: 1–2 short sentences or a few facts).
- Do not repeat or lightly reword any existing front above.

Respond with ONLY a JSON array, e.g.
[{"type":"pattern-trigger","front":"...","back":"...","concepts":["concept-id"]}]
No markdown fences, no commentary.`;
}
