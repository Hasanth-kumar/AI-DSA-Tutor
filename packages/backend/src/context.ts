import {
  createIntelligenceOrchestrator,
  type IntelligenceOrchestrator,
} from "@dsa/intelligence";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import type { LLMService } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import { createAppLLMService } from "./llm.factory.js";
import { TopicRepository } from "./repositories/TopicRepository.js";
import { ProblemRepository } from "./repositories/ProblemRepository.js";
import { SessionRepository } from "./repositories/SessionRepository.js";
import { SyncMetaRepository } from "./repositories/SyncMetaRepository.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { CacheService } from "./services/CacheService.js";
import { DebriefService } from "./services/DebriefService.js";
import { GitHubSyncService } from "./services/GitHubSyncService.js";
import { ChatService } from "./services/ChatService.js";
import { HintService } from "./services/HintService.js";
import { ChatRepository } from "./repositories/ChatRepository.js";
import { LeetCodeService } from "./services/LeetCodeService.js";
import { MirrorCache } from "./services/MirrorCache.js";
import { NotionSyncService } from "./services/NotionSyncService.js";
import { CurriculumService } from "./services/CurriculumService.js";
import { PlanService } from "./services/PlanService.js";
import { SessionService } from "./services/SessionService.js";

export interface AppContext {
  config: AppConfig;
  intelligence: IntelligenceOrchestrator;
  mirrorCache: MirrorCache;
  topicRepo: TopicRepository;
  problemRepo: ProblemRepository;
  sessionRepo: SessionRepository;
  syncMetaRepo: SyncMetaRepository;
  cache: CacheService;
  llm: LLMService;
  curriculumService: CurriculumService;
  planService: PlanService;
  sessionService: SessionService;
  analyticsService: AnalyticsService;
  debriefService: DebriefService;
  hintService: HintService;
  chatService: ChatService;
  leetcodeService: LeetCodeService;
  githubSync: GitHubSyncService;
  notionSync: NotionSyncService;
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
  const cache = new CacheService(config.redis.url);
  const llm = createAppLLMService(config);
  const intelligence = createIntelligenceOrchestrator(config.intelligenceWeights);
  const notionSync = new NotionSyncService(
    config,
    topicRepo,
    problemRepo,
    syncMetaRepo,
    mirrorCache,
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
  );
  const analyticsService = new AnalyticsService(
    intelligence,
    topicRepo,
    sessionRepo,
    problemRepo,
  );
  const debriefService = new DebriefService(
    config,
    intelligence,
    sessionRepo,
    topicRepo,
    analyticsService,
    llm,
  );
  const hintService = new HintService(config, intelligence, llm);
  const chatRepo = new ChatRepository(db);
  const chatService = new ChatService(
    config,
    chatRepo,
    planService,
    analyticsService,
    intelligence,
    topicRepo,
    problemRepo,
    llm,
  );
  const leetcodeService = new LeetCodeService(config, syncMetaRepo);
  const githubSync = new GitHubSyncService(config, problemRepo, mirrorCache);

  return {
    config,
    intelligence,
    mirrorCache,
    topicRepo,
    problemRepo,
    sessionRepo,
    syncMetaRepo,
    cache,
    llm,
    curriculumService,
    planService,
    sessionService,
    analyticsService,
    debriefService,
    hintService,
    chatService,
    leetcodeService,
    githubSync,
    notionSync,
    async close() {
      sqlite.close();
      await cache.disconnect();
    },
  };
}
