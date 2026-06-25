/**
 * Closed concept-vocabulary enforcement (design §4).
 *
 * The per-topic vocabulary lives in version-controlled `concepts.yaml`. The one
 * rule that is expensive to undo: the vocabulary is **closed** — the LLM (and
 * the seed loader) may assign cards to *existing* concept ids only, and may
 * never invent a new tag. New concepts are added solely by a deliberate human
 * edit to `concepts.yaml`. This module is the single enforcement point reused
 * by the seed loader now and by the batch generation pipeline later (§5/§15.5),
 * so the taxonomy can never drift into `hashmap` / `HashMap` / `hash-map`.
 *
 * Tags are also required to be **flat ids** (no dotted hierarchy like
 * `arrays.hashmap.lookup`); roll-up lives in the optional `parent` field.
 */

/** A concept as authored in `concepts.yaml`. */
export interface ConceptDefinition {
  id: string;
  /** Optional roll-up grouping (e.g. "fundamentals") — NOT encoded in the id. */
  parent?: string;
  /** Static, authored prerequisite edges (§4). No learned/dynamic graph. */
  requires?: string[];
  description?: string;
}

/** Thrown when a card references a tag outside the closed vocabulary, or the
 *  vocabulary itself is malformed (dotted id, duplicate, dangling edge). */
export class ConceptVocabularyError extends Error {
  constructor(
    message: string,
    /** Distinct, ordered list of offending tags/ids for easy assertion. */
    readonly offenders: string[] = [],
  ) {
    super(message);
    this.name = "ConceptVocabularyError";
  }
}

/** A flat concept id contains no `.` — hierarchy is expressed via `parent`. */
export function isFlatConceptId(id: string): boolean {
  return id.length > 0 && !id.includes(".");
}

/**
 * Validate a topic's concept vocabulary in isolation and return the set of
 * legal concept ids. Throws {@link ConceptVocabularyError} on a dotted id, a
 * duplicate id, or a `requires` edge pointing at an unknown concept.
 */
export function buildVocabulary(concepts: ConceptDefinition[]): Set<string> {
  const ids = new Set<string>();
  const dotted: string[] = [];
  const duplicates: string[] = [];

  for (const c of concepts) {
    if (!isFlatConceptId(c.id)) {
      dotted.push(c.id);
      continue;
    }
    if (ids.has(c.id)) duplicates.push(c.id);
    ids.add(c.id);
  }

  if (dotted.length) {
    throw new ConceptVocabularyError(
      `Concept ids must be flat (no dotted hierarchy): ${dotted.join(", ")}`,
      dotted,
    );
  }
  if (duplicates.length) {
    throw new ConceptVocabularyError(
      `Duplicate concept ids: ${duplicates.join(", ")}`,
      duplicates,
    );
  }

  // Prerequisite edges must resolve within the same closed vocabulary.
  const dangling: string[] = [];
  for (const c of concepts) {
    for (const req of c.requires ?? []) {
      if (!ids.has(req)) dangling.push(`${c.id} -> ${req}`);
    }
  }
  if (dangling.length) {
    throw new ConceptVocabularyError(
      `Prerequisite (requires) edges reference unknown concepts: ${dangling.join(", ")}`,
      dangling,
    );
  }

  return ids;
}

/**
 * Enforce the closed vocabulary: every tag in {@link tags} must already exist
 * in {@link known}. Unknown tags throw — they are never silently created.
 * This is the function the generation pipeline calls before persisting any
 * LLM-assigned tags.
 */
export function assertClosedVocabulary(known: Set<string>, tags: Iterable<string>): void {
  const unknown: string[] = [];
  for (const tag of tags) {
    if (!known.has(tag) && !unknown.includes(tag)) unknown.push(tag);
  }
  if (unknown.length) {
    throw new ConceptVocabularyError(
      `Tags outside the closed concept vocabulary (add them to concepts.yaml first): ${unknown.join(", ")}`,
      unknown,
    );
  }
}

/**
 * Non-throwing variant for generation paths that prefer to *strip* unknown tags
 * rather than reject the whole batch. Returns only the tags that are in the
 * closed vocabulary, plus the list that was dropped.
 */
export function filterToVocabulary(
  known: Set<string>,
  tags: Iterable<string>,
): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const tag of tags) {
    if (known.has(tag)) kept.push(tag);
    else if (!dropped.includes(tag)) dropped.push(tag);
  }
  return { kept, dropped };
}
