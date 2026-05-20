import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "./config.js";

describe("loadConfig", () => {
  afterEach(() => {
    resetConfigCache();
  });

  it("applies defaults when env vars are missing", () => {
    const cfg = loadConfig("/nonexistent/.env");
    expect(cfg.port).toBe(3000);
    expect(cfg.sqlite.path).toContain("dsa.db");
    expect(cfg.intelligenceWeights.urgency).toBe(0.3);
  });
});
