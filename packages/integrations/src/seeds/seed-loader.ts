/**
 * Seed loader (design §2 / §15.2).
 *
 * Reads the version-controlled curated baseline under `database/seeds/<topic>/`
 * — `concepts.yaml` (the closed concept vocabulary + prerequisite edges) and
 * `cards.yaml` (10–15 hand-authored cards) — parses, and validates them against
 * the design invariants before anything touches the database:
 *
 *   - cards reference the closed vocabulary only (§4) — unknown tags throw;
 *   - concept ids are flat (no dotted hierarchy) (§4);
 *   - `requires` edges resolve within the topic vocabulary (§4);
 *   - per-concept card cap of {@link MAX_CARDS_PER_CONCEPT} (2–3 angles) (§4);
 *   - card `type` is in the closed card-type vocabulary (§3);
 *   - card ids are unique within a topic and across all topics.
 *
 * Parsing is pure (js-yaml only); persistence lives in `seed-store.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { CARD_TYPES, type CardType } from "@dsa/database/schema";
import {
  buildVocabulary,
  ConceptVocabularyError,
  type ConceptDefinition,
} from "./concept-vocabulary.js";

/** Cap on how many cards may tag a single concept — keeps the bank lean (§4). */
export const MAX_CARDS_PER_CONCEPT = 3;

const CARD_TYPE_SET = new Set<string>(CARD_TYPES);

/** A card exactly as authored in `cards.yaml`. */
export interface SeedCard {
  id: string;
  type: CardType;
  concepts: string[];
  note_ref?: string;
  front: string;
  back: string;
}

/** A fully parsed + validated seed topic. */
export interface SeedTopic {
  /** Directory name under `database/seeds` (e.g. "two-pointers"). */
  dir: string;
  topicId: string;
  topicName: string;
  seedVersion: number;
  concepts: ConceptDefinition[];
  /** Legal concept ids for this topic (the closed vocabulary). */
  conceptIds: Set<string>;
  cards: SeedCard[];
}

/** Aggregates every problem found while validating a single topic. */
export class SeedValidationError extends Error {
  constructor(
    readonly dir: string,
    readonly problems: string[],
  ) {
    super(`Invalid seed topic "${dir}":\n  - ${problems.join("\n  - ")}`);
    this.name = "SeedValidationError";
  }
}

interface RawConceptFile {
  topic_id?: unknown;
  topic_name?: unknown;
  concepts?: unknown;
}
interface RawCardFile {
  topic_id?: unknown;
  topic_name?: unknown;
  seed_version?: unknown;
  cards?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Parse + validate a single topic directory. Throws {@link SeedValidationError}
 * with every problem found (not just the first) so a bad seed file is fixed in
 * one pass.
 */
export function loadSeedTopic(seedsRoot: string, dir: string): SeedTopic {
  const base = resolve(seedsRoot, dir);
  const conceptsRaw = load(
    readFileSync(resolve(base, "concepts.yaml"), "utf-8"),
  ) as RawConceptFile;
  const cardsRaw = load(
    readFileSync(resolve(base, "cards.yaml"), "utf-8"),
  ) as RawCardFile;

  const problems: string[] = [];

  const conceptTopicId = asString(conceptsRaw.topic_id);
  const cardTopicId = asString(cardsRaw.topic_id);
  if (!conceptTopicId) problems.push("concepts.yaml is missing topic_id");
  if (!cardTopicId) problems.push("cards.yaml is missing topic_id");
  if (conceptTopicId && cardTopicId && conceptTopicId !== cardTopicId) {
    problems.push(
      `topic_id mismatch: concepts.yaml=${conceptTopicId} cards.yaml=${cardTopicId}`,
    );
  }

  const concepts = (Array.isArray(conceptsRaw.concepts)
    ? conceptsRaw.concepts
    : []) as ConceptDefinition[];
  if (concepts.length === 0) problems.push("concepts.yaml lists no concepts");

  // Validate the vocabulary itself (flat ids, no dupes, edges resolve).
  let conceptIds = new Set<string>();
  try {
    conceptIds = buildVocabulary(concepts);
  } catch (err) {
    if (err instanceof ConceptVocabularyError) problems.push(err.message);
    else throw err;
  }

  const cards = (Array.isArray(cardsRaw.cards) ? cardsRaw.cards : []) as SeedCard[];
  if (cards.length === 0) problems.push("cards.yaml lists no cards");

  const seenCardIds = new Set<string>();
  const perConcept = new Map<string, number>();

  for (const card of cards) {
    const where = card.id ? `card ${card.id}` : "a card";
    if (!card.id) {
      problems.push("a card is missing an id");
    } else if (seenCardIds.has(card.id)) {
      problems.push(`duplicate card id ${card.id}`);
    } else {
      seenCardIds.add(card.id);
    }

    if (!card.type || !CARD_TYPE_SET.has(card.type)) {
      problems.push(`${where} has unknown type "${String(card.type)}"`);
    }
    if (!asString(card.front)?.trim()) problems.push(`${where} has empty front`);
    if (!asString(card.back)?.trim()) problems.push(`${where} has empty back`);

    const tags = Array.isArray(card.concepts) ? card.concepts : [];
    if (tags.length === 0) problems.push(`${where} has no concept tags`);
    for (const tag of tags) {
      // Closed-vocabulary enforcement (§4): a card may only reference an
      // existing concept; seeds never extend the vocabulary.
      if (!conceptIds.has(tag)) {
        problems.push(`${where} references unknown concept "${tag}"`);
        continue;
      }
      perConcept.set(tag, (perConcept.get(tag) ?? 0) + 1);
    }
  }

  for (const [concept, count] of perConcept) {
    if (count > MAX_CARDS_PER_CONCEPT) {
      problems.push(
        `concept "${concept}" is tagged on ${count} cards (cap ${MAX_CARDS_PER_CONCEPT})`,
      );
    }
  }

  if (problems.length) throw new SeedValidationError(dir, problems);

  return {
    dir,
    topicId: conceptTopicId!,
    topicName: asString(conceptsRaw.topic_name) ?? asString(cardsRaw.topic_name) ?? dir,
    seedVersion: typeof cardsRaw.seed_version === "number" ? cardsRaw.seed_version : 1,
    concepts,
    conceptIds,
    cards,
  };
}

/**
 * Load and validate every topic under `seedsRoot`. Also enforces that card ids
 * are globally unique across topics (UUID primary keys, §8). Throws on the
 * first invalid topic.
 */
export function loadAllSeeds(seedsRoot: string): SeedTopic[] {
  const dirs = readdirSync(seedsRoot)
    .filter((d) => !d.startsWith(".") && statSync(resolve(seedsRoot, d)).isDirectory())
    .sort();

  const topics: SeedTopic[] = [];
  const globalCardIds = new Set<string>();
  const globalDupes: string[] = [];

  for (const dir of dirs) {
    const topic = loadSeedTopic(seedsRoot, dir);
    for (const card of topic.cards) {
      if (globalCardIds.has(card.id)) globalDupes.push(card.id);
      globalCardIds.add(card.id);
    }
    topics.push(topic);
  }

  if (globalDupes.length) {
    throw new SeedValidationError("<all>", [
      `card ids must be globally unique; duplicated across topics: ${globalDupes.join(", ")}`,
    ]);
  }

  return topics;
}

/**
 * Coverage for a loaded topic (§4): how many concepts have at least one card.
 * Deterministic and auditable — doubles as the progress meter.
 */
export function topicCoverage(topic: SeedTopic): {
  covered: number;
  total: number;
  uncovered: string[];
} {
  const tagged = new Set<string>();
  for (const card of topic.cards) for (const t of card.concepts) tagged.add(t);
  const uncovered = [...topic.conceptIds].filter((id) => !tagged.has(id));
  return { covered: tagged.size, total: topic.conceptIds.size, uncovered };
}
