/**
 * Batch generation pipeline orchestrator (design §5, §2, §4, §8, §9, §15.5).
 *
 * Implements the §5 pipeline EXACTLY, in order:
 *
 *   notes + seeds + existing cards (DB)
 *     → identify uncovered concept tags (closed vocabulary, §4)
 *     → generate cards ONLY for those, existing tags only
 *     → Stage A dedup (LLM told not to repeat existing — in the prompt)
 *     → Stage B dedup (app-side semantic check, ALWAYS runs — §6)
 *     → store only unique cards, with provenance (§8) + a CardGenerated event (§9)
 *
 * The whole thing runs OFF the hot path, triggered by the dirty flag (§5): warm-up
 * and review never call this. The LLM and embedder are injected (binding-free).
 */
import { MAX_CARDS_PER_CONCEPT } from "../seeds/seed-loader.js";
import type { ConceptDefinition } from "../seeds/concept-vocabulary.js";
import {
  cardEmbeddingText,
  loadDedupCandidates,
  upsertEmbedding,
  dedupeBatch,
  DEFAULT_DEDUP_CONFIG,
  type DedupConfig,
  type DedupCandidate,
  type Embedder,
  type EmbeddingDb,
} from "../embeddings/index.js";
import {
  findCrossConceptPairs,
  DEFAULT_CONFUSION_CONFIG,
  type ConfusionPairConfig,
  type ConfusionDb,
} from "../embeddings/confusion.js";
import {
  parseGeneratedCards,
  sanitizeGeneratedCards,
  buildGeneratedCardRows,
  type GeneratedCardDraft,
} from "./generation.js";
import {
  buildGenerationPrompt,
  GENERATION_PROMPT_VERSION,
  type GenerationConcept,
} from "./generation.prompt.js";
import {
  computeCoverage,
  existingFronts,
  storeGeneratedCards,
  clearTopicDirty,
  listDirtyTopics,
  type GenDb,
} from "./GenerationStore.js";
import type { GenerationClient } from "./GenerationProvider.js";

/** The DB handle must satisfy the generation store, embedding store, and confusion detector. */
export type GenerationDb = GenDb & EmbeddingDb & ConfusionDb;

/** A topic's closed vocabulary + display name (from concepts.yaml). */
export interface TopicVocabulary {
  topicId: string;
  topicName: string;
  conceptIds: Set<string>;
  concepts: ConceptDefinition[];
}

/** Note material for a topic — the source of truth for card content (§2). */
export interface TopicNotes {
  excerpts: { title: string; excerpt: string }[];
  /**
   * The `## Mistakes` sections extracted verbatim from the topic's notes (§3),
   * fed to the prompt as a dedicated block for mistake-derived cards. Optional
   * for back-compat; absent/empty when no note has a Mistakes section.
   */
  mistakes?: { title: string; mistakes: string }[];
  /** Stable hash of the note content — stored as `note_version` provenance (§8). */
  noteVersion: string | null;
}

export type VocabularyResolver = (topicId: string) => TopicVocabulary | undefined;
export type NoteProvider = (topicId: string) => TopicNotes;

export interface CardGenerationConfig {
  db: GenerationDb;
  llm: GenerationClient;
  embedder: Embedder;
  resolveVocabulary: VocabularyResolver;
  loadNotes?: NoteProvider;
  /** Generation LLM model id, stored as `model_version` provenance (§8). */
  modelVersion: string;
  dedup?: DedupConfig;
  maxPerConcept?: number;
  /**
   * Config for confusion-pair detection (§3). Defaults to
   * {@link DEFAULT_CONFUSION_CONFIG}. Pass `{ limit: 0 }` to disable.
   */
  confusionPairs?: ConfusionPairConfig;
}

export type SkipReason =
  | "no-vocabulary"
  | "fully-covered"
  | "llm-unavailable"
  | "empty-generation"
  | "all-duplicates";

export interface GenerationRunReport {
  topicId: string;
  uncovered: string[];
  /** Drafts that survived parse + closed-vocab sanitize (Stage A app-side). */
  sanitized: number;
  /** Drafts dropped by sanitize, by reason. */
  droppedBySanitize: number;
  /** Drafts dropped by the Stage-B semantic dedup. */
  droppedByDedup: number;
  /** Cards actually inserted with provenance + a CardGenerated event. */
  stored: number;
  skipped?: SkipReason;
}

export class CardGenerationService {
  private readonly cfg: CardGenerationConfig;
  private readonly dedup: DedupConfig;
  private readonly maxPerConcept: number;

  private readonly confusion: ConfusionPairConfig;

  constructor(config: CardGenerationConfig) {
    this.cfg = config;
    this.dedup = config.dedup ?? DEFAULT_DEDUP_CONFIG;
    this.maxPerConcept = config.maxPerConcept ?? MAX_CARDS_PER_CONCEPT;
    this.confusion = config.confusionPairs ?? DEFAULT_CONFUSION_CONFIG;
  }

  /** Run the full pipeline for one topic. Returns a report; never throws on a
   *  benign skip (no coverage gap, LLM down, all dupes). */
  async generateForTopic(
    topicId: string,
    opts: { clearDirty?: boolean } = {},
  ): Promise<GenerationRunReport> {
    const base: GenerationRunReport = {
      topicId,
      uncovered: [],
      sanitized: 0,
      droppedBySanitize: 0,
      droppedByDedup: 0,
      stored: 0,
    };

    const vocab = this.cfg.resolveVocabulary(topicId);
    if (!vocab) return { ...base, skipped: "no-vocabulary" };

    // 1. Coverage gap (§4) — the deterministic generation target.
    const coverage = computeCoverage(this.cfg.db, topicId, vocab.conceptIds);
    base.uncovered = coverage.uncovered;
    if (coverage.uncovered.length === 0) {
      if (opts.clearDirty) clearTopicDirty(this.cfg.db, topicId);
      return { ...base, skipped: "fully-covered" };
    }

    if (!this.cfg.llm.isConfigured()) {
      // Leave the topic dirty so the next batch run retries.
      return { ...base, skipped: "llm-unavailable" };
    }

    // 2. Build the closed-vocabulary, coverage-targeted prompt (§4/§5).
    const notes: TopicNotes = (
      this.cfg.loadNotes ?? (() => ({ excerpts: [], mistakes: [], noteVersion: null }))
    )(topicId);
    const uncoveredConcepts: GenerationConcept[] = coverage.uncovered.map((id) => ({
      id,
      description: vocab.concepts.find((c) => c.id === id)?.description,
    }));

    // 2b. Confusion-pair context from the embedding store (§3). Only available
    //     once the topic has embeddings; gracefully absent for new topics.
    const confusionPairs =
      this.confusion.limit > 0
        ? findCrossConceptPairs(this.cfg.db, this.cfg.embedder.model, {
            topicId,
            config: this.confusion,
          })
        : [];

    const prompt = buildGenerationPrompt({
      topicName: vocab.topicName,
      uncovered: uncoveredConcepts,
      noteExcerpts: notes.excerpts,
      mistakeNotes: notes.mistakes ?? [],
      existingFronts: existingFronts(this.cfg.db, topicId),
      maxPerConcept: this.maxPerConcept,
      confusionPairs,
    });

    // 3. Generate (off the hot path) and parse tolerantly.
    const text = await this.cfg.llm.generate(prompt);
    const raw = parseGeneratedCards(text);

    // 4. Stage A (app-side enforcement): closed vocabulary + on-target + cap (§4).
    const uncoveredSet = new Set(coverage.uncovered);
    const sanitize = sanitizeGeneratedCards(raw, {
      knownConcepts: vocab.conceptIds,
      uncovered: uncoveredSet,
      existingCounts: coverage.counts,
      maxPerConcept: this.maxPerConcept,
    });
    base.sanitized = sanitize.kept.length;
    base.droppedBySanitize = sanitize.dropped.length;
    if (sanitize.kept.length === 0) {
      return { ...base, skipped: "empty-generation" };
    }

    // 5. Stage B (always runs — §6): embed + semantic dedup vs the bank + in-batch.
    const unique = await this.stageBDedup(topicId, sanitize.kept);
    base.droppedByDedup = sanitize.kept.length - unique.length;
    if (unique.length === 0) {
      return { ...base, skipped: "all-duplicates" };
    }

    // 6. Store unique cards with provenance (§8) + CardGenerated event (§9),
    //    then persist their vectors (FK requires the card rows to exist first).
    const rows = buildGeneratedCardRows(
      topicId,
      unique.map((u) => u.draft),
      {
        modelVersion: this.cfg.modelVersion,
        promptVersion: GENERATION_PROMPT_VERSION,
        noteVersion: notes.noteVersion,
      },
    );
    const stored = storeGeneratedCards(this.cfg.db, rows);
    base.stored = stored.inserted;

    for (let i = 0; i < rows.length; i++) {
      upsertEmbedding(this.cfg.db, {
        cardId: rows[i]!.id,
        model: this.cfg.embedder.model,
        vector: unique[i]!.vector,
        sourceHash: rows[i]!.source_hash,
      });
    }

    if (opts.clearDirty) clearTopicDirty(this.cfg.db, topicId, notes.noteVersion);
    return base;
  }

  /** Drain the dirty queue (§5): run the pipeline once per dirty topic, merging
   *  whatever edits accumulated. This is the debounced batch job's body. */
  async generateForDirtyTopics(): Promise<GenerationRunReport[]> {
    const dirty = listDirtyTopics(this.cfg.db);
    const reports: GenerationRunReport[] = [];
    for (const topic of dirty) {
      reports.push(await this.generateForTopic(topic.topicId, { clearDirty: true }));
    }
    return reports;
  }

  /** Embed the kept drafts and filter them against the existing bank + each
   *  other (Stage B, §6). Returns surviving drafts paired with their vectors. */
  private async stageBDedup(
    topicId: string,
    drafts: GeneratedCardDraft[],
  ): Promise<Array<{ draft: GeneratedCardDraft; vector: Float32Array }>> {
    const vectors = await this.cfg.embedder.embed(drafts.map((d) => cardEmbeddingText(d)));
    const byId = new Map<string, { draft: GeneratedCardDraft; vector: Float32Array }>();
    const candidates: DedupCandidate[] = drafts.map((draft, i) => {
      const id = `cand-${i}`;
      const vector = vectors[i]!;
      byId.set(id, { draft, vector });
      return { id, vector, concepts: draft.concepts };
    });

    const existing = loadDedupCandidates(this.cfg.db, this.cfg.embedder.model, { topicId });
    const { unique } = dedupeBatch(candidates, existing, this.dedup);
    return unique.map((c) => byId.get(c.id)!);
  }
}
