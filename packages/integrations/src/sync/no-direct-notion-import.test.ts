import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * §10 guard: the card-sync seam must keep `@notionhq/client` behind a single
 * adapter. Only `NotionSyncTarget.ts` may import it; the interface, the store,
 * the service, and the local-file adapter must stay client-free, so swapping
 * Notion out is a one-file change.
 */
const syncDir = resolve(fileURLToPath(new URL(".", import.meta.url)));

describe("SyncTarget seam (§10 — no direct Notion-client coupling)", () => {
  // Match real `import … from "@notionhq/client"` lines, not doc-comment mentions.
  const NOTION_IMPORT = /from\s+["']@notionhq\/client["']/;
  const NOTION_ADAPTER_IMPORT = /from\s+["']\.\/NotionSyncTarget(\.js)?["']/;

  it("only NotionSyncTarget imports @notionhq/client", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(syncDir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      if (file === "NotionSyncTarget.ts") continue;
      const src = readFileSync(resolve(syncDir, file), "utf-8");
      if (NOTION_IMPORT.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the service + interface depend only on the SyncTarget abstraction", () => {
    for (const file of ["CardSyncService.ts", "SyncTarget.ts", "CardSyncStore.ts"]) {
      const src = readFileSync(resolve(syncDir, file), "utf-8");
      expect(NOTION_IMPORT.test(src)).toBe(false);
      expect(NOTION_ADAPTER_IMPORT.test(src)).toBe(false);
    }
  });
});
