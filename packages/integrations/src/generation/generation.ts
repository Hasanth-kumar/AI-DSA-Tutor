/**
 * Pure generation core (design §4, §5, §8). No I/O, no LLM, no DB — every step
 * here is deterministic and unit-testable. The pipeline orchestrator
 * (`CardGenerationService`) calls these between the LLM round-trip and the store.
 *
 * Responsibilities:
 *   - parse the LLM's JSON output into card drafts (tolerant of fences/chatter);
 *   - enforce the **closed concept vocabulary** (§4) — strip any tag not in the
 *     supplied set, and discard a card that ends up with no legal tag;
 *   - keep cards on-target — only those tagging at least one *uncovered* concept;
 *   - enforce the per-concept cap (§4) and drop exact in-batch content dupes
 *     (Stage B's semantic check still runs later — this is just cheap hygiene);
 *   - build provenance-bearing `cards` rows (§8): origin='generated',
 *     source_hash, model_version, prompt_version, note_version.
 */
import { randomUUID } from "node:crypto";
import { CARD_TYPES, type CardType } from "@dsa/database/schema";
import { filterToVocabulary } from "../seeds/concept-vocabulary.js";
import { cardSourceHash } from "../seeds/seed-store.js";

const CARD_TYPE_SET = new Set<string>(CARD_TYPES);

/** A card as emitted by the LLM, before any validation. */
export interface RawGeneratedCard {
  type?: unknown;
  front?: unknown;
  back?: unknown;
  concepts?: unknown;
}

/** A validated, closed-vocabulary card draft ready for embedding + dedup. */
export interface GeneratedCardDraft {
  type: CardType;
  front: string;
  back: string;
  concepts: string[];
}

export interface DroppedDraft {
  reason:
    | "bad-shape"
    | "unknown-type"
    | "empty-content"
    | "no-legal-concept"
    | "off-target"
    | "over-cap"
    | "in-batch-duplicate";
  front: string;
  /** Tags removed because they were outside the closed vocabulary (§4). */
  strippedTags?: string[];
}

export interface SanitizeResult {
  kept: GeneratedCardDraft[];
  dropped: DroppedDraft[];
}

export interface SanitizeOptions {
  /** The closed vocabulary for the topic — tags outside this are stripped (§4). */
  knownConcepts: Set<string>;
  /** Concepts the run is meant to cover — a card must hit at least one. */
  uncovered: Set<string>;
  /** Current per-concept card counts in the bank (to enforce the cap). */
  existingCounts?: Map<string, number>;
  /** Max cards per concept (§4). */
  maxPerConcept: number;
}

/** Trim + collapse internal whitespace so two cards that differ only in spacing
 *  hash identically for the cheap in-batch dup check. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Extract card drafts from possibly fenced / chatty LLM output. Returns the
 * first JSON array found, mapped to {@link RawGeneratedCard}s. Pure and total —
 * never throws on malformed input, returns `[]`.
 */
export function parseGeneratedCards(text: string | null | undefined): RawGeneratedCard[] {
  if (!text) return [];
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is RawGeneratedCard => !!e && typeof e === "object");
  } catch {
    return [];
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Validate + closed-vocabulary-filter a batch of raw cards (§4, §5). Every drop
 * is reported with a reason so a generation run is auditable. The per-concept
 * cap is enforced against the *combined* existing + in-batch counts.
 */
export function sanitizeGeneratedCards(
  raw: RawGeneratedCard[],
  opts: SanitizeOptions,
): SanitizeResult {
  const kept: GeneratedCardDraft[] = [];
  const dropped: DroppedDraft[] = [];
  const seen = new Set<string>();
  const counts = new Map<string, number>(opts.existingCounts ?? []);

  for (const card of raw) {
    const front = asString(card.front).trim();
    const back = asString(card.back).trim();
    const type = asString(card.type).trim();
    const rawTags = Array.isArray(card.concepts) ? card.concepts.map(asString) : [];

    if (!front && !back) {
      dropped.push({ reason: "bad-shape", front });
      continue;
    }
    if (!CARD_TYPE_SET.has(type)) {
      dropped.push({ reason: "unknown-type", front });
      continue;
    }
    if (!front || !back) {
      dropped.push({ reason: "empty-content", front });
      continue;
    }

    // §4 closed vocabulary: strip any tag the LLM invented.
    const { kept: legalTags, dropped: strippedTags } = filterToVocabulary(
      opts.knownConcepts,
      rawTags,
    );
    if (legalTags.length === 0) {
      dropped.push({ reason: "no-legal-concept", front, strippedTags });
      continue;
    }

    // Stay on-target: the card must cover at least one *uncovered* concept.
    const onTarget = legalTags.filter((t) => opts.uncovered.has(t));
    if (onTarget.length === 0) {
      dropped.push({ reason: "off-target", front, strippedTags });
      continue;
    }

    // Cheap exact-dup guard (Stage B semantic dedup still runs afterwards).
    const fingerprint = `${type} ${normalize(front)} ${normalize(back)}`;
    if (seen.has(fingerprint)) {
      dropped.push({ reason: "in-batch-duplicate", front });
      continue;
    }

    // Per-concept cap (§4) — drop a card whose every tag is already at the cap.
    const tags = [...new Set(legalTags)];
    const hasRoom = tags.some((t) => (counts.get(t) ?? 0) < opts.maxPerConcept);
    if (!hasRoom) {
      dropped.push({ reason: "over-cap", front, strippedTags });
      continue;
    }

    seen.add(fingerprint);
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    kept.push({ type: type as CardType, front, back, concepts: tags });
  }

  return { kept, dropped };
}

/** Provenance metadata stamped on every generated card (§8). */
export interface GenerationProvenance {
  /** Embedding/LLM model id that produced the card. */
  modelVersion: string;
  /** Generation prompt version (e.g. {@link GENERATION_PROMPT_VERSION}). */
  promptVersion: string;
  /** Optional note content hash the card was derived from. */
  noteVersion?: string | null;
}

/** A fully-built `cards` row plus its concept links, ready to persist. */
export interface GeneratedCardRow {
  id: string;
  topic_id: string;
  type: CardType;
  front: string;
  back: string;
  note_ref: string | null;
  origin: "generated";
  source_hash: string;
  model_version: string;
  prompt_version: string;
  note_version: string | null;
  due: number;
  created_at: number;
  updated_at: number;
  concepts: string[];
}

/**
 * Turn validated drafts into persistable rows with full provenance (§8). Pure:
 * `now`/`idFactory` injected for deterministic tests. New cards enter FSRS New
 * state due immediately so review/warm-up can pick them up.
 */
export function buildGeneratedCardRows(
  topicId: string,
  drafts: GeneratedCardDraft[],
  provenance: GenerationProvenance,
  now: number = Date.now(),
  idFactory: () => string = randomUUID,
  noteRef: string | null = null,
): GeneratedCardRow[] {
  return drafts.map((d) => ({
    id: idFactory(),
    topic_id: topicId,
    type: d.type,
    front: d.front,
    back: d.back,
    note_ref: noteRef,
    origin: "generated" as const,
    source_hash: cardSourceHash(d.type, d.front, d.back),
    model_version: provenance.modelVersion,
    prompt_version: provenance.promptVersion,
    note_version: provenance.noteVersion ?? null,
    due: now,
    created_at: now,
    updated_at: now,
    concepts: d.concepts,
  }));
}
