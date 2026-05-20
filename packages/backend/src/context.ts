import {
  createIntelligenceOrchestrator,
  type IntelligenceOrchestrator,
} from "@dsa/intelligence";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import type { AppConfig } from "@dsa/shared";
import { TopicRepository } from "./repositories/TopicRepository.js";
import { ProblemRepository } from "./repositories/ProblemRepository.js";
import { SessionRepository } from "./repositories/SessionRepository.js";
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
  const cache = new CacheService(config.redis.url);
  const intelligence = createIntelligenceOrchestrator();
  const notionSync = new NotionSyncService(config, topicRepo);
  const planService = new PlanService(intelligence, topicRepo, cache);
  const sessionService = new SessionService(
    config,
    intelligence,
    sessionRepo,
    topicRepo,
    planService,
    notionSync,
  );
  const analyticsService = new AnalyticsService(
    intelligence,
    topicRepo,
    sessionRepo,
  );

  return {
    config,
    intelligence,
    topicRepo,
    problemRepo,
    sessionRepo,
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
