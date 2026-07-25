/**
 * Orchestrates write-through sync of the card bank to a {@link SyncTarget}
 * (design §8, §10). Binding-free (talks to {@link SqliteLike}, not Drizzle), so it
 * runs in prod against better-sqlite3 and in tests against node:sqlite, and it
 * knows nothing about Notion — only the interface. The app wires a concrete
 * target (Notion when configured, the JSON file otherwise) and calls `flush`.
 *
 * `flush` is the **batched, delta-only** push (§8): it reads dirty cards, pushes
 * them in one call, and clears exactly the ones the target confirmed. `pull`
 * is the new-device rebuild where Notion leads and content is written back
 * without disturbing local SR state (§8 field ownership).
 */
import {
  allCardRecords,
  applyPulledContent,
  countDirtyCards,
  dirtyCardDeltas,
  markCardsSynced,
  type PullApplyResult,
} from "./CardSyncStore.js";
import type { SqliteLike } from "../sqlite/sqlite-like.js";
import {
  isCodeHeavy,
  CODE_IN_BODY_NOTICE,
  type PulledCardContent,
} from "./card-properties.js";
import type { CardSyncRecord, SyncTarget } from "./SyncTarget.js";

export interface CardSyncReport {
  /** Dirty cards found this run (the delta size). */
  dirty: number;
  /** Cards the target accepted. */
  pushed: number;
  /** Cards the target rejected (still dirty for next flush). */
  failed: number;
  /** Local rows whose dirty flag cleared (== pushed, minus any concurrent edit). */
  cleared: number;
}

const EMPTY: CardSyncReport = { dirty: 0, pushed: 0, failed: 0, cleared: 0 };

export class CardSyncService {
  constructor(
    private readonly db: SqliteLike,
    private readonly target: SyncTarget,
  ) {}

  get targetName(): string {
    return this.target.name;
  }

  isConfigured(): boolean {
    return this.target.isConfigured();
  }

  pendingCount(): number {
    return countDirtyCards(this.db);
  }

  /** Batched, delta-only flush (§8). No-op when nothing is dirty. */
  async flush(now: number = Date.now()): Promise<CardSyncReport> {
    if (!this.target.isConfigured()) return { ...EMPTY };
    const deltas = dirtyCardDeltas(this.db);
    return this.push(deltas, now);
  }

  /** One-time full upload (§8 — the first sync of an existing bank). */
  async firstUpload(now: number = Date.now()): Promise<CardSyncReport> {
    if (!this.target.isConfigured()) return { ...EMPTY };
    return this.push(allCardRecords(this.db), now);
  }

  private async push(deltas: CardSyncRecord[], now: number): Promise<CardSyncReport> {
    if (deltas.length === 0) return { ...EMPTY };
    const result = await this.target.pushCards(deltas);
    const failed = new Set(result.failedIds ?? []);
    const succeeded = deltas
      .filter((d) => !failed.has(d.id))
      .map((d) => ({ id: d.id, updatedAt: d.updatedAt }));
    const cleared = markCardsSynced(this.db, succeeded, result.pageIds, now);
    return { dirty: deltas.length, pushed: result.pushed, failed: result.failed, cleared };
  }

  /** Rebuild local content from the target where it leads (§8). */
  async pull(now: number = Date.now()): Promise<PullApplyResult | null> {
    if (!this.target.isConfigured() || !this.target.pullCards) return null;
    const records = await this.target.pullCards();
    return applyPulledContent(this.db, records.map(recordToContent), now);
  }
}

/** A sync record reduced to the content fields a pull writes back (§8). */
function recordToContent(r: CardSyncRecord): PulledCardContent {
  return {
    id: r.id,
    notionPageId: r.notionPageId,
    topicId: r.topicId,
    type: r.type,
    front: r.front,
    back: r.back,
    conceptTags: r.conceptTags,
    // Code-heavy cards are local-authoritative (§8): a pulled `back` that is the
    // page-body pointer (or a cloze/fenced body) must not overwrite local content.
    codeHeavy: isCodeHeavy(r) || r.back.trim() === CODE_IN_BODY_NOTICE,
  };
}
