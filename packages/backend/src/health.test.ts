import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "@dsa/shared";
import { buildApp } from "./app.js";
import { createAppContext } from "./context.js";

describe("GET /health", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("returns health payload", async () => {
    const config = loadConfig("/nonexistent/.env");
    const ctx = createAppContext(config);
    const app = buildApp(config, ctx);
    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(body).toMatchObject({
      timestamp: expect.any(String),
      version: "0.1.0",
      services: {
        api: { status: "ok" },
        sqlite: expect.objectContaining({ status: expect.any(String) }),
      },
    });
    await app.close();
    await ctx.close();
  });
});
