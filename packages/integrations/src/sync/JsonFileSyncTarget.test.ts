import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileSyncTarget } from "./JsonFileSyncTarget.js";
import type { CardSyncRecord } from "./SyncTarget.js";

function card(id: string, over: Partial<CardSyncRecord> = {}): CardSyncRecord {
  return {
    id,
    topicId: "two-pointers",
    type: "plain-recall",
    front: `front ${id}`,
    back: `back ${id}`,
    conceptTags: ["overflow"],
    stability: 1,
    difficulty: 5,
    due: 1000,
    lastReview: null,
    reps: 0,
    lapses: 0,
    state: 0,
    suspended: false,
    origin: "seed",
    sourceHash: null,
    modelVersion: null,
    promptVersion: null,
    noteVersion: null,
    notionPageId: null,
    updatedAt: 1000,
    ...over,
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dsa-jsonsync-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("JsonFileSyncTarget (§10 — canonical local export, $0, offline)", () => {
  it("writes canonical JSON + portable Markdown", async () => {
    const target = new JsonFileSyncTarget({ dir });
    const res = await target.pushCards([card("a"), card("b")]);
    expect(res).toEqual({ pushed: 2, failed: 0, failedIds: [], pageIds: {} });

    const json = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    expect(json.cards.map((c: CardSyncRecord) => c.id)).toEqual(["a", "b"]);
    expect(existsSync(join(dir, "cards.md"))).toBe(true);
    expect(readFileSync(join(dir, "cards.md"), "utf-8")).toContain("front a");
  });

  it("delta-merges idempotently (re-push overwrites, never duplicates)", async () => {
    const target = new JsonFileSyncTarget({ dir });
    await target.pushCards([card("a", { front: "v1" })]);
    await target.pushCards([card("a", { front: "v2" }), card("c")]);

    const json = JSON.parse(readFileSync(join(dir, "cards.json"), "utf-8"));
    expect(json.cards).toHaveLength(2);
    const a = json.cards.find((c: CardSyncRecord) => c.id === "a");
    expect(a.front).toBe("v2");
  });

  it("round-trips via pullCards", async () => {
    const target = new JsonFileSyncTarget({ dir });
    await target.pushCards([card("a"), card("b")]);
    const pulled = await target.pullCards();
    expect(pulled.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("never writes a vector/embedding (§6 — local only)", async () => {
    const target = new JsonFileSyncTarget({ dir });
    await target.pushCards([card("a")]);
    const raw = readFileSync(join(dir, "cards.json"), "utf-8").toLowerCase();
    expect(raw).not.toContain("vector");
    expect(raw).not.toContain("embedding");
  });

  it("is always configured (local) and a no-op on empty push", async () => {
    const target = new JsonFileSyncTarget({ dir });
    expect(target.isConfigured()).toBe(true);
    expect(await target.pushCards([])).toEqual({ pushed: 0, failed: 0, failedIds: [], pageIds: {} });
    expect(existsSync(join(dir, "cards.json"))).toBe(false);
  });
});
