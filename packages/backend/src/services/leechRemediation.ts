/**
 * Leech remediation helpers (design §4, §7). When a card is flagged a leech,
 * drilling it forever is useless — instead we resurface its authored prerequisite
 * concepts (from `concepts.yaml` `requires` edges) and optional note context.
 * LLM reformulation is triggered separately via the dirty-flag generation queue.
 */
import type { ConceptDefinition } from "@dsa/integrations";

export interface ConceptGraph {
  /** Flat prerequisite concept ids for the given tags within a topic. */
  prerequisitesFor(topicId: string | null, conceptIds: readonly string[]): string[];
}

/** Build a {@link ConceptGraph} from validated seed vocabulary (§4). */
export function createConceptGraph(
  lookup: (topicId: string) => { concepts: ConceptDefinition[] } | undefined,
): ConceptGraph {
  return {
    prerequisitesFor(topicId: string | null, conceptIds: readonly string[]): string[] {
      if (!topicId || conceptIds.length === 0) return [];
      const vocab = lookup(topicId);
      if (!vocab) return [];
      const byId = new Map(vocab.concepts.map((c) => [c.id, c]));
      const prereqs = new Set<string>();
      for (const id of conceptIds) {
        for (const req of byId.get(id)?.requires ?? []) prereqs.add(req);
      }
      return [...prereqs];
    },
  };
}
