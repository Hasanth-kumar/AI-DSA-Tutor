import {
  createIntelligenceOrchestrator,
  type IntelligenceOrchestrator,
} from "@dsa/intelligence";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import { TopicRepository } from "./repositories/TopicRepository.js";
import { ProblemRepository } from "./repositories/ProblemRepository.js";
import { SessionRepository } from "./repositories/SessionRepository.js";
import { SyncMetaRepository } from "./repositories/SyncMetaRepository.js";
import { AnalyticsService } from "./services/AnalyticsService.js";
import { CacheService } from "./services/CacheService.js";
import { NotionSyncService } from "./services/NotionSyncService.js";
import { PlanService } from "./services/PlanService.js";
import { SessionService } from "./services/SessionService.js";

export interface AppContext {
  config: AppConfig;
  intelligence: IntelligenceOrchestrator;
  topicRepo: TopicRepository;
  problemRepo: ProblemRepository;
  sessionRepo: SessionRepository;
  syncMetaRepo: SyncMetaRepository;
  cache: CacheService;
  planService: PlanService;
  sessionService: SessionService;
  analyticsService: AnalyticsService;
  notionSync: NotionSyncService;
  close: () => Promise<void>;
}

export function createAppContext(config: AppConfig): AppContext {
  runMigrations(config.sqlite.path);
  const { db, sqlite } = createSqliteDb(config.sqlite.path);

  const topicRepo = new TopicRepository(db);
  const problemRepo = new ProblemRepository(db);
  const sessionRepo = new SessionRepository(db);
  const syncMetaRepo = new SyncMetaRepository(db);
  const cache = new CacheService(config.redis.url);
  const intelligence = createIntelligenceOrchestrator(config.intelligenceWeights);
  const notionSync = new NotionSyncService(
    config,
    topicRepo,
    problemRepo,
    syncMetaRepo,
  );
  const planService = new PlanService(
    intelligence,
    topicRepo,
    problemRepo,
    cache,
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

  return {
    config,
    intelligence,
    topicRepo,
    problemRepo,
    sessionRepo,
    syncMetaRepo,
    cache,
    planService,
    sessionService,
    analyticsService,
    notionSync,
    async close() {
      sqlite.close();
      await cache.disconnect();
    },
  };
}
