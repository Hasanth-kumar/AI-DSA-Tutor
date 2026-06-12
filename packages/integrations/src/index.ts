export {
  WhatsAppClient,
  createWhatsAppClient,
  type WhatsAppClientConfig,
  type SendTextResult,
} from "./whatsapp/WhatsAppClient.js";
export type {
  WhatsAppWebhookPayload,
  WhatsAppWebhookMessage,
} from "./whatsapp/types.js";
export {
  parseWhatsAppCommand,
  WHATSAPP_HELP_TEXT,
  type WhatsAppCommand,
} from "./whatsapp/commands/parse-command.js";
export { formatStudyPlanForWhatsApp } from "./whatsapp/formatters/plan.formatter.js";
export { formatProgressForWhatsApp } from "./whatsapp/formatters/progress.formatter.js";
export { formatRevisionReminder } from "./whatsapp/formatters/revision.formatter.js";
export { NotionClient, createNotionClient, type NotionConfig } from "./notion/NotionClient.js";
export type {
  ProblemNotionUpdate,
  SessionNotionCreate,
  TopicNotionUpdate,
} from "./notion/NotionWriter.js";
export { syncNotionToSqlite, getMirrorCounts, type SyncResult } from "./sqlite/sync.js";
export { createSqliteDb, runMigrations } from "./sqlite/client.js";
export type { SqliteDb } from "./sqlite/client.js";
export type { LLMChatMessage, LLMClient } from "./llm/LLMClient.js";
export { OllamaClient, createOllamaClient, type OllamaConfig } from "./llm/OllamaClient.js";
export {
  OpenRouterClient,
  createOpenRouterClient,
  type OpenRouterConfig,
} from "./llm/OpenRouterClient.js";
export {
  LLMService,
  createLLMService,
  type LLMServiceConfig,
  type LLMProvider,
} from "./llm/LLMService.js";
export type {
  ChatCoachOptions,
  ChatLearningContext,
  DebriefContext,
  HintContext,
  WarmupQuestionContext,
} from "./prompts/types.js";
export { buildHintPrompt } from "./prompts/hint.prompt.js";
export { buildDebriefPrompt } from "./prompts/debrief.prompt.js";
export { buildChatSystemPrompt } from "./prompts/chat.prompt.js";
export {
  buildWarmupPrompt,
  fallbackWarmupQuestions,
} from "./prompts/warmup.prompt.js";
export {
  ObsidianVault,
  createObsidianVault,
  isConflictFile,
  parseFrontmatter,
  resolveTopicFolderName,
  sanitizeFolderName,
  stripWikiLinks,
  type ObsidianNoteFile,
  type VaultWatchHandlers,
} from "./obsidian/ObsidianVault.js";
export type { ChatHistoryMessage } from "./llm/LLMService.js";
export {
  LeetCodeClient,
  createLeetCodeClient,
  parseSubmissionCalendar,
  type LeetCodeActivity,
  type LeetCodeConfig,
  type LeetCodeUserStats,
} from "./leetcode/LeetCodeClient.js";
export {
  GitHubClient,
  createGitHubClient,
  matchProblemToFile,
  slugifyProblemName,
  type GitHubConfig,
  type GitHubFileEntry,
  type GitHubListResult,
} from "./github/GitHubClient.js";
