import {
  createIntelligenceOrchestrator,
  type IntelligenceOrchestrator,
} from "@dsa/intelligence";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import type { LLMService } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import { createAppLLMService } from "./llm.factory.js";
import { TopicRepository } from "./repositories/TopicRepository.js";
import { AttemptRepository } from "./repositories/AttemptRepository.js";
import { ConflictRepository } from "./repositories/ConflictRepository.js";
import { NoteRepository } from "./repositories/NoteRepository.js";
import { ProblemRepository } from "./repositories/ProblemRepository.js";
import { SessionRepository } from "./repositories/SessionRepository.js";
import { SyncMetaRepository } from "./repositories/SyncMetaRepository.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { BackupService } from "./services/BackupService.js";
import { CacheService } from "./services/CacheService.js";
import { DebriefService } from "./services/DebriefService.js";
import { EventBus } from "./services/EventBus.js";
import { GitHubSyncService } from "./services/GitHubSyncService.js";
import { ChatService } from "./services/ChatService.js";
import { HintService } from "./services/HintService.js";
import { ChatRepository } from "./repositories/ChatRepository.js";
import { LeetCodeService } from "./services/LeetCodeService.js";
import { MirrorCache } from "./services/MirrorCache.js";
import { NotionSyncService } from "./services/NotionSyncService.js";
import { ObsidianNoteService } from "./services/ObsidianNoteService.js";
import { CurriculumService } from "./services/CurriculumService.js";
import { PlanService } from "./services/PlanService.js";
import { SessionService } from "./services/SessionService.js";
import { WarmupService } from "./services/WarmupService.js";

export interface AppContext {
  config: AppConfig;
  intelligence: IntelligenceOrchestrator;
  mirrorCache: MirrorCache;
  topicRepo: TopicRepository;
  problemRepo: ProblemRepository;
  sessionRepo: SessionRepository;
  syncMetaRepo: SyncMetaRepository;
  attemptRepo: AttemptRepository;
  noteRepo: NoteRepository;
  conflictRepo: ConflictRepository;
  cache: CacheService;
  llm: LLMService;
  events: EventBus;
  curriculumService: CurriculumService;
  planService: PlanService;
  sessionService: SessionService;
  analyticsService: AnalyticsService;
  debriefService: DebriefService;
  hintService: HintService;
  chatService: ChatService;
  warmupService: WarmupService;
  leetcodeService: LeetCodeService;
  githubSync: GitHubSyncService;
  notionSync: NotionSyncService;
  obsidianNotes: ObsidianNoteService;
  backupService: BackupService;
  close: () => Promise<void>;
}

export function createAppContext(config: AppConfig): AppContext {
  runMigrations(config.sqlite.path);
  const { db, sqlite } = createSqliteDb(config.sqlite.path);

  const mirrorCache = new MirrorCache(db);
  const topicRepo = new TopicRepository(db, mirrorCache);
  const problemRepo = new ProblemRepository(db, mirrorCache);
  const sessionRepo = new SessionRepository(db, mirrorCache);
  const syncMetaRepo = new SyncMetaRepository(db);
  const attemptRepo = new AttemptRepository(db, mirrorCache);
  const noteRepo = new NoteRepository(db, mirrorCache);
  const conflictRepo = new ConflictRepository(db);
  const cache = new CacheService(config.redis.url);
  const llm = createAppLLMService(config);
  const events = new EventBus();
  const intelligence = createIntelligenceOrchestrator(config.intelligenceWeights);
  const notionSync = new NotionSyncService(
    config,
    topicRepo,
    problemRepo,
    syncMetaRepo,
    mirrorCache,
    conflictRepo,
  );
  const obsidianNotes = new ObsidianNoteService(config, noteRepo, problemRepo, () =>
    events.publish("note"),
  );
  const curriculumService = new CurriculumService(syncMetaRepo, problemRepo);
  const planService = new PlanService(
    intelligence,
    topicRepo,
    problemRepo,
    cache,
    curriculumService,
  );
  const sessionService = new SessionService(
    config,
    intelligence,
    sessionRepo,
    topicRepo,
    problemRepo,
    planService,
    notionSync,
    attemptRepo,
  );
  const analyticsService = new AnalyticsService(
    intelligence,
    topicRepo,
    sessionRepo,
    problemRepo,
  );
  // Coaching paths (debrief/hint/chat) build their own LLM from coachLlm config (3.3).
  const debriefService = new DebriefService(
    config,
    intelligence,
    sessionRepo,
    topicRepo,
    analyticsService,
  );
  const hintService = new HintService(config, intelligence, undefined, cache);
  const chatRepo = new ChatRepository(db);
  const chatService = new ChatService(
    config,
    chatRepo,
    planService,
    analyticsService,
    intelligence,
    topicRepo,
    problemRepo,
    undefined,
    attemptRepo,
    noteRepo,
  );
  const warmupService = new WarmupService(
    config,
    topicRepo,
    sessionService,
    noteRepo,
  );
  const leetcodeService = new LeetCodeService(config, syncMetaRepo);
  const githubSync = new GitHubSyncService(config, problemRepo, mirrorCache);
  const backupService = new BackupService(config, sqlite);

  return {
    config,
    intelligence,
    mirrorCache,
    topicRepo,
    problemRepo,
    sessionRepo,
    syncMetaRepo,
    attemptRepo,
    noteRepo,
    conflictRepo,
    cache,
    llm,
    events,
    curriculumService,
    planService,
    sessionService,
    analyticsService,
    debriefService,
    hintService,
    chatService,
    warmupService,
    leetcodeService,
    githubSync,
    notionSync,
    obsidianNotes,
    backupService,
    async close() {
      backupService.stop();
      await obsidianNotes.stopWatching();
      sqlite.close();
      await cache.disconnect();
    },
  };
}
