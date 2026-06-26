/**
 * Card-bank sync layer (design §8, §10, §13, build-order stage 6). Public seam:
 * the app imports `SyncTarget` + `CardSyncService` and a concrete adapter
 * factory — never `@notionhq/client` directly.
 */
export type { CardSyncRecord, SyncPushResult, SyncTarget } from "./SyncTarget.js";
export {
  NOTION_CARD_SCHEMA,
  NOTION_CONTENT_PROPERTIES,
  cardToNotionProperties,
  notionPageToContent,
  type NotionCardPropertyName,
  type PulledCardContent,
} from "./card-properties.js";
export {
  dirtyCardDeltas,
  allCardRecords,
  countDirtyCards,
  markCardsSynced,
  applyPulledContent,
  newSyncId,
  type SyncDb,
  type SyncStatement,
  type PullApplyResult,
} from "./CardSyncStore.js";
export {
  JsonFileSyncTarget,
  createJsonFileSyncTarget,
  type JsonFileSyncConfig,
} from "./JsonFileSyncTarget.js";
export {
  NotionSyncTarget,
  createNotionSyncTarget,
  NOTION_RATE_LIMIT,
  type NotionSyncConfig,
  type NotionClientLike,
} from "./NotionSyncTarget.js";
export {
  CardSyncService,
  type CardSyncReport,
} from "./CardSyncService.js";
