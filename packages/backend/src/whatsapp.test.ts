import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { topics } from "@dsa/database/schema";
import { createSqliteDb, runMigrations } from "@dsa/integrations";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import type { AppConfig } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext, type AppContext } from "./context.js";

let testDbPath: string;
let config: AppConfig;
let ctx: AppContext;

function seedTestDb(dbPath: string): void {
  runMigrations(dbPath);
  const { db, sqlite } = createSqliteDb(dbPath);
  const now = Date.now();
  db.insert(topics)
    .values({
      id: "topic-a",
      name: "Arrays",
      difficulty: "Easy",
      status: "In progress",
      confidence: 40,
      revisionCount: 1,
      lastRevised: now - 7 * 86_400_000,
      nextRevisionAt: now - 2 * 86_400_000,
      isWeakArea: 1,
      prerequisites: null,
      updatedAt: now,
    })
    .run();
  sqlite.close();
}

describe("WhatsApp webhook", () => {
  beforeEach(() => {
    resetConfigCache();
    testDbPath = join(tmpdir(), `dsa-wa-test-${Date.now()}.db`);
    process.env.SQLITE_PATH = testDbPath;
    process.env.ENABLE_SCHEDULERS = "false";
    process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
    seedTestDb(testDbPath);
    config = loadConfig("/nonexistent/.env");
    config = {
      ...config,
      sqlite: { path: testDbPath },
      schedulers: { ...config.schedulers, enabled: false },
      whatsapp: {
        ...config.whatsapp,
        verifyToken: "test-verify-token",
      },
    };
    ctx = createAppContext(config);
  });

  afterEach(async () => {
    await ctx.close();
    resetConfigCache();
    try {
      rmSync(testDbPath);
    } catch {
      // ignore
    }
  });

  it("GET /webhooks/whatsapp verifies Meta challenge", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("12345");
    await app.close();
  });

  it("GET /webhooks/whatsapp rejects bad token", async () => {
    const app = buildApp(config, ctx);
    const response = await app.inject({
      method: "GET",
      url: "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("POST /api/notifications/weekly-digest requires secret when configured", async () => {
    config = {
      ...config,
      whatsapp: {
        ...config.whatsapp,
        notifySecret: "notify-secret",
        phoneNumberId: "123",
        accessToken: "token",
        defaultRecipient: "15550001111",
      },
    };
    const securedCtx = createAppContext(config);
    const app = buildApp(config, securedCtx);

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/notifications/weekly-digest",
    });
    expect(unauthorized.statusCode).toBe(401);

    await securedCtx.close();
    await app.close();
  });
});
