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
  LLM_PROVIDER: z.enum(["ollama", "openrouter"]).optional(),
  /** Provider override for coaching/hint/debrief paths (defaults to LLM_PROVIDER). */
  COACH_LLM_PROVIDER: z.enum(["ollama", "openrouter"]).optional(),
  /** Model override for the coach provider (defaults to that provider's model). */
  COACH_LLM_MODEL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5-coder:3b"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("google/gemma-4-31b-it:free"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  OPENROUTER_SITE_URL: z.string().default("http://localhost:5173"),
  OPENROUTER_SITE_NAME: z.string().default("DSA Mastery OS"),
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
  /** Meta app secret — enables X-Hub-Signature-256 verification on webhook POSTs */
  WHATSAPP_APP_SECRET: z.string().optional(),
  SQLITE_PATH: z.string().default("./data/sqlite/dsa.db"),
  /** Absolute or repo-relative path to the DSA folder of an Obsidian vault */
  OBSIDIAN_VAULT_PATH: z.string().optional(),
  BACKUP_DIR: z.string().default("./data/backups"),
  BACKUP_KEEP: z.coerce.number().default(14),
  WEIGHT_URGENCY: z.coerce.number().default(0.3),
  WEIGHT_WEAKNESS: z.coerce.number().default(0.25),
  WEIGHT_CONFIDENCE: z.coerce.number().default(0.2),
  WEIGHT_PREREQUISITE: z.coerce.number().default(0.15),
  WEIGHT_RECENCY: z.coerce.number().default(0.1),
  ENABLE_SCHEDULERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  WEEKLY_DIGEST_CRON: z.string().default("0 20 * * 0"),
  SCHEDULER_TIMEZONE: z.string().default("UTC"),
  LEETCODE_USERNAME: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  GITHUB_SOLUTIONS_PATH: z.string().default(""),
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
  llm: {
    provider: "ollama" | "openrouter";
    model: string;
    ollama: { baseUrl: string };
    openrouter: {
      apiKey?: string;
      baseUrl: string;
      siteUrl: string;
      siteName: string;
    };
  };
  /** Coaching/hint/debrief LLM — may differ from the general provider (3.3). */
  coachLlm: {
    provider: "ollama" | "openrouter";
    model: string;
  };
  whatsapp: {
    phoneNumberId?: string;
    accessToken?: string;
    verifyToken?: string;
    apiVersion: string;
    defaultRecipient?: string;
    allowedRecipients: string[];
    notifySecret?: string;
    appSecret?: string;
  };
  sqlite: { path: string };
  obsidian: { vaultPath?: string };
  backup: { dir: string; keep: number };
  intelligenceWeights: {
    urgency: number;
    weakness: number;
    confidence: number;
    prerequisite: number;
    recency: number;
  };
  schedulers: {
    enabled: boolean;
    weeklyDigestCron: string;
    timezone: string;
  };
  leetcode: { username?: string };
  github: {
    token?: string;
    repo?: string;
    solutionsPath: string;
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
    llm: {
      provider:
        env.LLM_PROVIDER ??
        (env.OPENROUTER_API_KEY ? "openrouter" : "ollama"),
      model:
        env.LLM_PROVIDER === "openrouter" || env.OPENROUTER_API_KEY
          ? env.OPENROUTER_MODEL
          : env.OLLAMA_MODEL,
      ollama: { baseUrl: env.OLLAMA_BASE_URL },
      openrouter: {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        siteUrl: env.OPENROUTER_SITE_URL,
        siteName: env.OPENROUTER_SITE_NAME,
      },
    },
    coachLlm: resolveCoachLlm(env),
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
      appSecret: env.WHATSAPP_APP_SECRET,
    },
    sqlite: { path: sqlitePath },
    obsidian: {
      vaultPath: env.OBSIDIAN_VAULT_PATH
        ? isAbsolute(env.OBSIDIAN_VAULT_PATH)
          ? env.OBSIDIAN_VAULT_PATH
          : resolve(repoRoot, env.OBSIDIAN_VAULT_PATH)
        : undefined,
    },
    backup: {
      dir: isAbsolute(env.BACKUP_DIR)
        ? env.BACKUP_DIR
        : resolve(repoRoot, env.BACKUP_DIR),
      keep: env.BACKUP_KEEP,
    },
    intelligenceWeights: {
      urgency: env.WEIGHT_URGENCY,
      weakness: env.WEIGHT_WEAKNESS,
      confidence: env.WEIGHT_CONFIDENCE,
      prerequisite: env.WEIGHT_PREREQUISITE,
      recency: env.WEIGHT_RECENCY,
    },
    schedulers: {
      enabled: env.ENABLE_SCHEDULERS,
      weeklyDigestCron: env.WEEKLY_DIGEST_CRON,
      timezone: env.SCHEDULER_TIMEZONE,
    },
    leetcode: { username: env.LEETCODE_USERNAME },
    github: {
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      solutionsPath: env.GITHUB_SOLUTIONS_PATH,
    },
  };

  return cached;
}

type ParsedEnv = z.infer<typeof envSchema>;

/**
 * The coach can use a stronger (cloud) model than the general LLM:
 * COACH_LLM_PROVIDER / COACH_LLM_MODEL override, falling back to the
 * general provider selection.
 */
function resolveCoachLlm(env: ParsedEnv): AppConfig["coachLlm"] {
  const generalProvider =
    env.LLM_PROVIDER ?? (env.OPENROUTER_API_KEY ? "openrouter" : "ollama");
  const provider = env.COACH_LLM_PROVIDER ?? generalProvider;
  const model =
    env.COACH_LLM_MODEL ??
    (provider === "openrouter" ? env.OPENROUTER_MODEL : env.OLLAMA_MODEL);
  return { provider, model };
}

export function resetConfigCache(): void {
  cached = null;
}
