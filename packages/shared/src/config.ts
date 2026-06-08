import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

/** Walk up from cwd to find the pnpm workspace root (repo root). */
export function findRepoRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir);
  const filesystemRoot = resolve("/");
  while (dir !== filesystemRoot) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return resolve(startDir);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  NOTION_TOKEN: z.string().optional(),
  NOTION_TOPICS_DB_ID: z.string().optional(),
  NOTION_PROBLEMS_DB_ID: z.string().optional(),
  NOTION_SESSIONS_DB_ID: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3.1:8b"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  /** Default recipient for cron/n8n notifications (E.164 without +, e.g. 15551234567) */
  WHATSAPP_DEFAULT_RECIPIENT: z.string().optional(),
  /** Comma-separated wa_ids allowed to use bot commands (empty = allow all) */
  WHATSAPP_ALLOWED_RECIPIENTS: z.string().optional(),
  /** Optional shared secret for POST /api/notifications/* (n8n cron) */
  WHATSAPP_NOTIFY_SECRET: z.string().optional(),
  SQLITE_PATH: z.string().default("./data/sqlite/dsa.db"),
  WEIGHT_URGENCY: z.coerce.number().default(0.3),
  WEIGHT_WEAKNESS: z.coerce.number().default(0.25),
  WEIGHT_CONFIDENCE: z.coerce.number().default(0.2),
  WEIGHT_PREREQUISITE: z.coerce.number().default(0.15),
  WEIGHT_RECENCY: z.coerce.number().default(0.1),
  ENABLE_SCHEDULERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DAILY_PLAN_CRON: z.string().default("0 7 * * *"),
  REVISION_CHECK_CRON: z.string().default("0 21 * * *"),
  NOTION_SYNC_CRON: z.string().default("*/30 * * * *"),
  WEEKLY_DIGEST_CRON: z.string().default("0 20 * * 0"),
  SCHEDULER_TIMEZONE: z.string().default("UTC"),
});

export type AppConfig = {
  nodeEnv: string;
  port: number;
  logLevel: string;
  notion: {
    token?: string;
    topicsDbId?: string;
    problemsDbId?: string;
    sessionsDbId?: string;
  };
  redis: { url: string };
  ollama: { baseUrl: string; model: string };
  whatsapp: {
    phoneNumberId?: string;
    accessToken?: string;
    verifyToken?: string;
    apiVersion: string;
    defaultRecipient?: string;
    allowedRecipients: string[];
    notifySecret?: string;
  };
  sqlite: { path: string };
  intelligenceWeights: {
    urgency: number;
    weakness: number;
    confidence: number;
    prerequisite: number;
    recency: number;
  };
  schedulers: {
    enabled: boolean;
    dailyPlanCron: string;
    revisionCheckCron: string;
    notionSyncCron: string;
    weeklyDigestCron: string;
    timezone: string;
  };
};

let cached: AppConfig | null = null;

export function loadConfig(envPath?: string): AppConfig {
  if (cached) return cached;

  const repoRoot = findRepoRoot();
  const dotenvPath = envPath ?? resolve(repoRoot, ".env");
  loadDotenv({ path: dotenvPath });
  const env = envSchema.parse(process.env);

  const sqlitePath = isAbsolute(env.SQLITE_PATH)
    ? env.SQLITE_PATH
    : resolve(repoRoot, env.SQLITE_PATH);

  cached = {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    notion: {
      token: env.NOTION_TOKEN,
      topicsDbId: env.NOTION_TOPICS_DB_ID,
      problemsDbId: env.NOTION_PROBLEMS_DB_ID,
      sessionsDbId: env.NOTION_SESSIONS_DB_ID,
    },
    redis: { url: env.REDIS_URL },
    ollama: { baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL },
    whatsapp: {
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      apiVersion: env.WHATSAPP_API_VERSION,
      defaultRecipient: env.WHATSAPP_DEFAULT_RECIPIENT,
      allowedRecipients: env.WHATSAPP_ALLOWED_RECIPIENTS
        ? env.WHATSAPP_ALLOWED_RECIPIENTS.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      notifySecret: env.WHATSAPP_NOTIFY_SECRET,
    },
    sqlite: { path: sqlitePath },
    intelligenceWeights: {
      urgency: env.WEIGHT_URGENCY,
      weakness: env.WEIGHT_WEAKNESS,
      confidence: env.WEIGHT_CONFIDENCE,
      prerequisite: env.WEIGHT_PREREQUISITE,
      recency: env.WEIGHT_RECENCY,
    },
    schedulers: {
      enabled: env.ENABLE_SCHEDULERS,
      dailyPlanCron: env.DAILY_PLAN_CRON,
      revisionCheckCron: env.REVISION_CHECK_CRON,
      notionSyncCron: env.NOTION_SYNC_CRON,
      weeklyDigestCron: env.WEEKLY_DIGEST_CRON,
      timezone: env.SCHEDULER_TIMEZONE,
    },
  };

  return cached;
}

export function resetConfigCache(): void {
  cached = null;
}
