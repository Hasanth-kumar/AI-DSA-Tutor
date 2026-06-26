/**
 * Default dependency providers for {@link CardGenerationService} (design §2/§4).
 *
 * Kept separate from the service so the orchestrator stays binding-free and the
 * filesystem / notes access is swappable in tests. The seed resolver maps a
 * topic id to its closed `concepts.yaml` vocabulary; the note provider reads the
 * user's own notes (the source of truth, §2) — including the `## Mistakes`
 * section the prompt uses for mistake-derived cards (§3).
 */
import { createHash } from "node:crypto";
import { loadAllSeeds } from "../seeds/seed-loader.js";
import type {
  GenDb,
} from "./GenerationStore.js";
import type {
  NoteProvider,
  TopicNotes,
  TopicVocabulary,
  VocabularyResolver,
} from "./CardGenerationService.js";

/**
 * Build a {@link VocabularyResolver} from the version-controlled seed topics
 * under `seedsRoot`. Loads + validates every `concepts.yaml` once and indexes by
 * topic id. The vocabulary is closed (§4): the resolver exposes exactly the
 * authored concept ids — the generation pipeline can never extend them.
 */
export function createSeedVocabularyResolver(seedsRoot: string): VocabularyResolver {
  const byTopic = new Map<string, TopicVocabulary>();
  for (const topic of loadAllSeeds(seedsRoot)) {
    byTopic.set(topic.topicId, {
      topicId: topic.topicId,
      topicName: topic.topicName,
      conceptIds: topic.conceptIds,
      concepts: topic.concepts,
    });
  }
  return (topicId: string) => byTopic.get(topicId);
}

/** Truncate a note body to a prompt-friendly excerpt. */
function excerptOf(content: string, max = 1200): string {
  const trimmed = content.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/**
 * Build a {@link NoteProvider} backed by the local `notes` table. Returns the
 * topic's note excerpts as generation source material (§2) and a deterministic
 * `note_version` hash (over the notes' content hashes) used for provenance (§8)
 * and to let the dirty queue skip a no-op run.
 */
export function createDbNoteProvider(db: GenDb): NoteProvider {
  return (topicId: string): TopicNotes => {
    const rows = db
      .prepare(
        `SELECT title, content, content_hash
           FROM notes
          WHERE topic_id = ?
          ORDER BY updated_at DESC`,
      )
      .all(topicId) as Array<{ title: string; content: string | null; content_hash: string | null }>;

    const excerpts = rows
      .filter((r) => (r.content ?? "").trim().length > 0)
      .map((r) => ({ title: r.title, excerpt: excerptOf(r.content ?? "") }));

    const hashSource = rows
      .map((r) => r.content_hash ?? createHash("sha256").update(r.content ?? "").digest("hex"))
      .sort()
      .join("|");
    const noteVersion =
      rows.length > 0 ? createHash("sha256").update(hashSource).digest("hex") : null;

    return { excerpts, noteVersion };
  };
}
