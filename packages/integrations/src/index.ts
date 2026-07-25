/**
 * Public API of @dsa/integrations — only what the backend/frontend actually
 * consume. In-package scripts (src/scripts/*) and tests use deep relative
 * imports, so sub-module exports don't need re-exporting here.
 */
export {
  WhatsAppClient,
  createWhatsAppClient,
} from "./whatsapp/WhatsAppClient.js";
export type { WhatsAppWebhookPayload } from "./whatsapp/types.js";
export {
  parseWhatsAppCommand,
  WHATSAPP_HELP_TEXT,
} from "./whatsapp/commands/parse-command.js";
export { formatStudyPlanForWhatsApp } from "./whatsapp/formatters/plan.formatter.js";
export { formatProgressForWhatsApp } from "./whatsapp/formatters/progress.formatter.js";
export { NotionClient, createNotionClient } from "./notion/NotionClient.js";
export { normalizeProblemStatus } from "./notion/problem-fields.js";
export { syncNotionToSqlite, type SyncResult } from "./sqlite/sync.js";
export {
  CardSyncService,
  createJsonFileSyncTarget,
  createNotionSyncTarget,
  type CardSyncReport,
  type PullApplyResult,
} from "./sync/index.js";
export { createSqliteDb, runMigrations, type SqliteDb } from "./sqlite/client.js";
export type { SqliteLike, SqliteStatement } from "./sqlite/sqlite-like.js";
export type { ConceptDefinition } from "./seeds/index.js";
export {
  markTopicDirty,
  createOllamaGenerationClient,
  createGenerationClient,
  DEFAULT_OLLAMA_GEN_MODEL,
  createSeedVocabularyResolver,
  type GenerationClient,
} from "./generation/index.js";
export type { LLMClient } from "./llm/LLMClient.js";
export { createOpenRouterClient } from "./llm/OpenRouterClient.js";
export {
  LLMService,
  createLLMService,
  type LLMServiceConfig,
  type ChatHistoryMessage,
} from "./llm/LLMService.js";
export type {
  ChatLearningContext,
  DebriefContext,
  HintContext,
} from "./prompts/types.js";
export {
  ObsidianVault,
  createObsidianVault,
  stripWikiLinks,
  type ObsidianNoteFile,
} from "./obsidian/ObsidianVault.js";
export {
  LeetCodeClient,
  createLeetCodeClient,
  type LeetCodeActivity,
  type LeetCodeUserStats,
} from "./leetcode/LeetCodeClient.js";
export { slugifyProblemName } from "./util/slugify.js";
