/**
 * The `SyncTarget` abstraction (design §10) — the longevity/cost hedge.
 *
 * The running app NEVER imports the Notion client directly; it depends only on
 * this interface. If Notion ever costs money, swap one adapter (Notion →
 * Git+Markdown, Google Sheet, SQLite-in-Dropbox) and nothing else changes. Two
 * adapters ship today and prove the seam is real: {@link NotionSyncTarget}
 * (`@notionhq/client`, free tier) and a fully-local `JsonFileSyncTarget`
 * (canonical JSON/Markdown export — also the portable backup of §10).
 *
 * Field ownership (§8) is encoded in the record shape, not in the adapter:
 *   - **Content** (`type`, `front`, `back`, `conceptTags`) is Notion-authoritative.
 *     A pull overwrites these locally.
 *   - **SR runtime state** (`stability`…`state`) is local-authoritative and pushed
 *     as a *write-only mirror*; a pull never reads it back.
 * Embeddings (§6) are deliberately absent from `CardSyncRecord` so no adapter can
 * ever leak a vector to a remote — vectors stay local-only by construction.
 */

/** Append-only event-log row mirrored to the sync target alongside cards (§9). */
export interface CardSyncRecord {
  /** App-generated UUID — the primary key, stored as a Notion *property*. The
   *  app never keys on Notion's internal `page_id` (a fresh local DB couldn't
   *  map back); `notionPageId` below is a one-way mapping only (§8). */
  id: string;
  topicId: string | null;

  // --- Content: Notion-authoritative (§8). A pull overwrites these locally. ---
  type: string;
  front: string;
  back: string;
  conceptTags: string[];

  // --- SR runtime state: local-authoritative, write-only mirror (§8). ---
  stability: number | null;
  difficulty: number | null;
  due: number | null;
  lastReview: number | null;
  reps: number;
  lapses: number;
  /** FSRS state enum: 0=New, 1=Learning, 2=Review, 3=Relearning. */
  state: number;
  suspended: boolean;

  // --- Provenance (§8): cheap columns, write-only mirror. ---
  origin: string;
  sourceHash: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  noteVersion: string | null;

  // --- Sync bookkeeping. Conflict policy keys on `updatedAt` (§8). ---
  notionPageId: string | null;
  updatedAt: number;
}

/** Outcome of a delta push. `pageIds` maps freshly-created cards → remote id so
 *  the local store can record `notion_page_id` (the one-way mapping, §8). */
export interface SyncPushResult {
  /** Cards successfully created or updated on the remote. */
  pushed: number;
  /** Cards that failed (kept dirty locally to retry next flush). */
  failed: number;
  /** Ids of the cards that failed — the caller clears everything *except* these,
   *  so a single bad card never blocks the rest of the batch (§8). */
  failedIds?: string[];
  /** `cardId → remotePageId` for cards created this push. */
  pageIds: Record<string, string>;
}

/**
 * A swappable backup/sync destination for the card bank (§10). Adapters own all
 * remote-format concerns; callers speak only `CardSyncRecord`. Push is a delta
 * (only dirty cards, §8); `pull` returns content for a new-device rebuild where
 * Notion leads (§8) — optional because not every target supports reads.
 */
export interface SyncTarget {
  /** Stable adapter id for logs/health (e.g. `"notion"`, `"json-file"`). */
  readonly name: string;
  /** Whether the target has the config it needs (token, db id, path…). */
  isConfigured(): boolean;
  /** Best-effort one-time remote schema setup (e.g. ensure Notion columns). */
  ensureSchema?(): Promise<void>;
  /** Push a batch of dirty card deltas; never per-card (§8 batched flush). */
  pushCards(records: CardSyncRecord[]): Promise<SyncPushResult>;
  /** Pull all cards (content-authoritative) for a rebuild; optional (§8). */
  pullCards?(): Promise<CardSyncRecord[]>;
}
