/**
 * Binding-free persistence for the card sync layer (design §8). Same tiny DB
 * surface the seed/embedding/generation stores use, so it runs against
 * better-sqlite3 (prod) and node:sqlite (tests) with no native-driver import.
 *
 * It owns three things, all keyed on the **delta** (dirty rows only, §8):
 *   - **`dirtyCardDeltas`** — the push payload: dirty cards + their concept tags.
 *   - **`markCardsSynced`** — clear `dirty`, stamp `synced_at`, record the
 *     one-way `notion_page_id` mapping. Guarded on `updated_at` so a review that
 *     lands *after* the snapshot keeps the card dirty (no lost write, §8).
 *   - **`applyPulledContent`** — new-device / data-loss rebuild where Notion
 *     leads (§8): write back **content only**, leave SR runtime state untouched
 *     (field ownership). Vectors are never involved — embeddings live in their
 *     own table and never reach a sync target (§6).
 */
import { randomUUID } from "node:crypto";
import type { SqliteLike } from "../sqlite/sqlite-like.js";
import type { CardSyncRecord } from "./SyncTarget.js";
import type { PulledCardContent } from "./card-properties.js";

/** Unit-separator joins concept ids in SQL — never collides with flat tag ids. */
const SEP = String.fromCharCode(31);

interface CardRowRaw {
  id: string;
  topic_id: string | null;
  type: string;
  front: string;
  back: string;
  stability: number | null;
  difficulty: number | null;
  due: number | null;
  last_review: number | null;
  reps: number;
  lapses: number;
  state: number;
  suspended: number;
  origin: string;
  source_hash: string | null;
  model_version: string | null;
  prompt_version: string | null;
  note_version: string | null;
  notion_page_id: string | null;
  updated_at: number;
  concept_tags: string | null;
}

function rowToRecord(r: CardRowRaw): CardSyncRecord {
  return {
    id: r.id,
    topicId: r.topic_id,
    type: r.type,
    front: r.front,
    back: r.back,
    conceptTags: r.concept_tags ? r.concept_tags.split(SEP).filter(Boolean) : [],
    stability: r.stability,
    difficulty: r.difficulty,
    due: r.due,
    lastReview: r.last_review,
    reps: Number(r.reps),
    lapses: Number(r.lapses),
    state: Number(r.state),
    suspended: Number(r.suspended) === 1,
    origin: r.origin,
    sourceHash: r.source_hash,
    modelVersion: r.model_version,
    promptVersion: r.prompt_version,
    noteVersion: r.note_version,
    notionPageId: r.notion_page_id,
    updatedAt: Number(r.updated_at),
  };
}

const SELECT_COLS = `
  c.id, c.topic_id, c.type, c.front, c.back,
  c.stability, c.difficulty, c.due, c.last_review, c.reps, c.lapses, c.state, c.suspended,
  c.origin, c.source_hash, c.model_version, c.prompt_version, c.note_version,
  c.notion_page_id, c.updated_at,
  (SELECT group_concat(cc.concept_id, char(31)) FROM card_concepts cc WHERE cc.card_id = c.id) AS concept_tags
`;

/**
 * The delta push payload (§8): only `dirty = 1` cards, oldest-edit first, with
 * their concept tags aggregated. A clean bank yields an empty array, so a flush
 * with nothing to do is a no-op — never a full re-push.
 */
export function dirtyCardDeltas(db: SqliteLike, limit = 500): CardSyncRecord[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM cards c WHERE c.dirty = 1 ORDER BY c.updated_at, c.id LIMIT ?`,
    )
    .all(limit) as CardRowRaw[];
  return rows.map(rowToRecord);
}

/** Every card as a sync record — the one-time first upload / full export (§8/§10). */
export function allCardRecords(db: SqliteLike): CardSyncRecord[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM cards c ORDER BY c.created_at, c.id`)
    .all() as CardRowRaw[];
  return rows.map(rowToRecord);
}

export function countDirtyCards(db: SqliteLike): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE dirty = 1`).get() as {
    n: number;
  };
  return Number(row?.n ?? 0);
}

const MARK_SYNCED = `
UPDATE cards
   SET dirty = 0,
       synced_at = ?,
       notion_page_id = COALESCE(?, notion_page_id)
 WHERE id = ? AND updated_at <= ?
`;

/**
 * Clear the dirty flag for cards confirmed on the remote (§8). `updated_at <= ?`
 * is the conflict guard: if a review bumped the row after we snapshotted it, the
 * predicate fails and the card stays dirty to re-sync — last field-owner write
 * wins, keyed on `updated_at`, no lost reviews. Returns how many rows cleared.
 */
export function markCardsSynced(
  db: SqliteLike,
  pushed: Array<Pick<CardSyncRecord, "id" | "updatedAt">>,
  pageIds: Record<string, string>,
  now: number = Date.now(),
): number {
  if (pushed.length === 0) return 0;
  const stmt = db.prepare(MARK_SYNCED);
  let cleared = 0;
  db.exec("BEGIN");
  try {
    for (const card of pushed) {
      const res = stmt.run(now, pageIds[card.id] ?? null, card.id, card.updatedAt) as {
        changes?: number | bigint;
      };
      cleared += Number(res?.changes ?? 0);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return cleared;
}

export interface PullApplyResult {
  inserted: number;
  updated: number;
  conceptLinks: number;
}

const UPDATE_CONTENT = `
UPDATE cards
   SET type = ?, front = ?, back = ?, topic_id = ?,
       notion_page_id = COALESCE(?, notion_page_id),
       updated_at = ?
 WHERE id = ?
`;

/** Code-heavy cards are local-authoritative (§8): on pull we refresh only the
 *  one-way page mapping and never overwrite local content from the pointer. */
const MAP_PAGE_ID = `
UPDATE cards
   SET notion_page_id = COALESCE(?, notion_page_id)
 WHERE id = ?
`;

const INSERT_PULLED = `
INSERT INTO cards (
  id, topic_id, type, front, back, note_ref,
  suspended, leech,
  stability, difficulty, due, last_review, reps, lapses, state,
  elapsed_days, scheduled_days, learning_steps,
  origin, source_hash, model_version, prompt_version, note_version, seed_version,
  notion_page_id, dirty, synced_at, created_at, updated_at
) VALUES (
  ?, ?, ?, ?, ?, NULL,
  0, 0,
  NULL, NULL, ?, NULL, 0, 0, 0,
  0, 0, 0,
  'manual', NULL, NULL, NULL, NULL, NULL,
  ?, 0, ?, ?, ?
)`;

/**
 * Rebuild local content from a pull where Notion leads (§8). Content fields are
 * overwritten (Notion-authoritative); **SR runtime state is never touched** for
 * existing cards — that is the single-writer field-ownership guarantee. New
 * cards are inserted as fresh/`New` (`due = now`) so they enter the SR queue
 * locally. Concept links are fully replaced to match the remote tag set.
 */
export function applyPulledContent(
  db: SqliteLike,
  contents: PulledCardContent[],
  now: number = Date.now(),
): PullApplyResult {
  const updateStmt = db.prepare(UPDATE_CONTENT);
  const mapStmt = db.prepare(MAP_PAGE_ID);
  const insertStmt = db.prepare(INSERT_PULLED);
  const findStmt = db.prepare(`SELECT id FROM cards WHERE id = ?`);
  const delConcepts = db.prepare(`DELETE FROM card_concepts WHERE card_id = ?`);
  const insConcept = db.prepare(
    `INSERT OR IGNORE INTO card_concepts (card_id, concept_id) VALUES (?, ?)`,
  );

  let inserted = 0;
  let updated = 0;
  let conceptLinks = 0;

  db.exec("BEGIN");
  try {
    for (const c of contents) {
      const exists = findStmt.get(c.id) as { id: string } | undefined;
      if (exists) {
        if (c.codeHeavy) {
          // Local-authoritative (§8): keep local front/back/type/topic, just
          // (re)bind the page mapping. The pulled `back` is only a pointer.
          mapStmt.run(c.notionPageId, c.id);
        } else {
          updateStmt.run(c.type, c.front, c.back, c.topicId, c.notionPageId, now, c.id);
        }
        updated += 1;
      } else {
        // Param order matches INSERT_PULLED: id, topic_id, type, front, back,
        // due, notion_page_id, synced_at, created_at, updated_at. New cards are
        // `New`/due-now so they enter the local SR queue immediately (§8).
        insertStmt.run(
          c.id,
          c.topicId,
          c.type,
          c.front,
          c.back,
          now, // due
          c.notionPageId,
          now, // synced_at
          now, // created_at
          now, // updated_at
        );
        inserted += 1;
      }
      delConcepts.run(c.id);
      for (const conceptId of new Set(c.conceptTags)) {
        insConcept.run(c.id, conceptId);
        conceptLinks += 1;
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { inserted, updated, conceptLinks };
}

/** Stable id factory hook (kept for symmetry with the generation store). */
export const newSyncId = randomUUID;
