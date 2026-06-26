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
  /** Serve the built frontend (packages/frontend/dist) from the API process.
   *  Unset → defaults on when NODE_ENV=production, off otherwise. */
  SERVE_FRONTEND: z.enum(["true", "false"]).optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_TOPICS_DB_ID: z.string().optional(),
  NOTION_PROBLEMS_DB_ID: z.string().optional(),
  NOTION_SESSIONS_DB_ID: z.string().optional(),
  /** Optional Notion card bank database (one row per card — §8). Falls back to local JSON export. */
  NOTION_CARDS_DB_ID: z.string().optional(),
  /** Directory for the canonical local card export when Notion cards DB is unset (§10). */
  CARDS_EXPORT_DIR: z.string().default("./data/cards-export"),
  /** Batched card-sync flush interval in ms (§8). 0 disables the timer. */
  CARDS_SYNC_FLUSH_INTERVAL_MS: z.coerce.number().default(300_000),
  /** Model override for the coach (defaults to OPENROUTER_MODEL). */
  COACH_LLM_MODEL: z.string().optional(),
  /** Model for warm-up quizzes (defaults to OPENROUTER_MODEL). */
  WARMUP_LLM_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  /** Separate OpenRouter key for coach paths (falls back to OPENROUTER_API_KEY). */
  OPENROUTER_COACH_API_KEY: z.string().optional(),
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

/** A coach LLM the user can pick from in the UI. */
export type CoachModelOption = {
  /** Stable id used by the picker and chat requests (e.g. "openrouter:deepseek/deepseek-r1:free"). */
  id: string;
  /** Human-friendly name shown in the picker. */
  label: string;
  /** Provider-specific model identifier sent to the API. */
  model: string;
  /** OpenRouter key for this model (never sent to the frontend). */
  apiKey?: string;
};

export type AppConfig = {
  nodeEnv: string;
  port: number;
  logLevel: string;
  web: {
    /** Whether this process serves the built frontend at "/". */
    serveFrontend: boolean;
    /** Absolute path to packages/frontend/dist. */
    frontendDist: string;
  };
  notion: {
    token?: string;
    topicsDbId?: string;
    problemsDbId?: string;
    sessionsDbId?: string;
    cardsDbId?: string;
  };
  cards: {
    exportDir: string;
    flushIntervalMs: number;
  };
  llm: {
    model: string;
    openrouter: {
      apiKey?: string;
      baseUrl: string;
      siteUrl: string;
      siteName: string;
    };
  };
  /** Warm-up quiz LLM — may use a lighter/faster model than the coach. */
  warmupLlm: {
    model: string;
    openrouter: {
      apiKey?: string;
      baseUrl: string;
      siteUrl: string;
      siteName: string;
    };
  };
  /** Coaching/hint/debrief LLM — may use a different model than the general LLM. */
  coachLlm: {
    model: string;
    openrouter: {
      apiKey?: string;
    };
    /** Id (within `models`) selected when the user hasn't chosen one. */
    defaultModelId: string;
    /** Models the user can switch between in the coach UI. */
    models: CoachModelOption[];
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

  const frontendDist = resolve(repoRoot, "packages/frontend/dist");
  const serveFrontend =
    env.SERVE_FRONTEND !== undefined
      ? env.SERVE_FRONTEND === "true"
      : env.NODE_ENV === "production";

  cached = {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    web: { serveFrontend, frontendDist },
    notion: {
      token: env.NOTION_TOKEN,
      topicsDbId: env.NOTION_TOPICS_DB_ID,
      problemsDbId: env.NOTION_PROBLEMS_DB_ID,
      sessionsDbId: env.NOTION_SESSIONS_DB_ID,
      cardsDbId: env.NOTION_CARDS_DB_ID,
    },
    cards: {
      exportDir: isAbsolute(env.CARDS_EXPORT_DIR)
        ? env.CARDS_EXPORT_DIR
        : resolve(repoRoot, env.CARDS_EXPORT_DIR),
      flushIntervalMs: env.CARDS_SYNC_FLUSH_INTERVAL_MS,
    },
    llm: {
      model: env.OPENROUTER_MODEL,
      openrouter: {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        siteUrl: env.OPENROUTER_SITE_URL,
        siteName: env.OPENROUTER_SITE_NAME,
      },
    },
    warmupLlm: {
      model: env.WARMUP_LLM_MODEL ?? env.OPENROUTER_MODEL,
      openrouter: {
        apiKey: coachOpenRouterKey(env),
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

function coachOpenRouterKey(env: ParsedEnv): string | undefined {
  return env.OPENROUTER_COACH_API_KEY ?? env.OPENROUTER_API_KEY;
}

/**
 * The coach can use a stronger model than the general LLM via COACH_LLM_MODEL.
 */
function resolveCoachLlm(env: ParsedEnv): AppConfig["coachLlm"] {
  const model = env.COACH_LLM_MODEL ?? env.OPENROUTER_MODEL;
  const apiKey = coachOpenRouterKey(env);
  const models = buildCoachModels(env, { model, apiKey });

  return {
    model,
    openrouter: { apiKey },
    defaultModelId: coachModelId(model),
    models,
  };
}

function coachModelId(model: string): string {
  return `openrouter:${model}`;
}

/** "deepseek/deepseek-r1:free" → "Deepseek R1". */
function prettyModelLabel(model: string): string {
  const base = (model.split("/").pop() ?? model).split(":")[0] ?? model;
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Models offered in the coach picker: the configured coach model (default,
 * listed first) and the general model (e.g. Gemma 4). Entries without an
 * OpenRouter key are dropped; duplicates are de-duplicated.
 */
function buildCoachModels(
  env: ParsedEnv,
  coach: { model: string; apiKey?: string },
): CoachModelOption[] {
  const models: CoachModelOption[] = [];

  const add = (opt: { model: string; apiKey?: string }) => {
    if (!opt.apiKey) return;
    const id = coachModelId(opt.model);
    if (models.some((m) => m.id === id)) return;
    models.push({ id, label: prettyModelLabel(opt.model), ...opt });
  };

  add(coach);
  if (env.WARMUP_LLM_MODEL && env.WARMUP_LLM_MODEL !== coach.model) {
    add({ model: env.WARMUP_LLM_MODEL, apiKey: coachOpenRouterKey(env) });
  }
  if (
    env.OPENROUTER_MODEL !== coach.model &&
    env.OPENROUTER_MODEL !== env.WARMUP_LLM_MODEL
  ) {
    add({ model: env.OPENROUTER_MODEL, apiKey: env.OPENROUTER_API_KEY });
  }

  return models;
}

export function resetConfigCache(): void {
  cached = null;
}
