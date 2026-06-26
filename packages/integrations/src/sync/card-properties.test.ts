import { describe, it, expect } from "vitest";
import {
  cardToNotionProperties,
  notionPageToContent,
  NOTION_CARD_SCHEMA,
} from "./card-properties.js";
import type { CardSyncRecord } from "./SyncTarget.js";

const card: CardSyncRecord = {
  id: "uuid-123",
  topicId: "two-pointers",
  type: "pattern-trigger",
  front: "sorted array, find pair summing to target",
  back: "two pointers",
  conceptTags: ["complement-trick", "two-pointers"],
  stability: 4.2,
  difficulty: 6.1,
  due: 1_900_000_000_000,
  lastReview: 1_800_000_000_000,
  reps: 3,
  lapses: 1,
  state: 2,
  suspended: false,
  origin: "generated",
  sourceHash: "abc",
  modelVersion: "qwen2.5",
  promptVersion: "gen-v1",
  noteVersion: "note-v1",
  notionPageId: null,
  updatedAt: 1_850_000_000_000,
};

describe("cardToNotionProperties (§8 — Notion shape, one row per card)", () => {
  const props = cardToNotionProperties(card);

  it("stores the app UUID as a property — never keys on Notion's page id", () => {
    const uuid = props.UUID as { rich_text: Array<{ text: { content: string } }> };
    expect(uuid.rich_text[0].text.content).toBe("uuid-123");
  });

  it("puts content fields up (Notion-authoritative)", () => {
    const front = props.Front as { title: Array<{ text: { content: string } }> };
    expect(front.title[0].text.content).toBe(card.front);
    const tags = props["Concept Tags"] as { multi_select: Array<{ name: string }> };
    expect(tags.multi_select.map((t) => t.name)).toEqual(card.conceptTags);
  });

  it("mirrors SR runtime state as write-only numbers/dates (§8)", () => {
    expect((props.Stability as { number: number }).number).toBe(4.2);
    expect((props.Reps as { number: number }).number).toBe(3);
    const due = props.Due as { date: { start: string } };
    expect(new Date(due.date.start).getTime()).toBe(card.due);
  });

  it("carries provenance + the conflict key (updated_at)", () => {
    const model = props["Model Version"] as { rich_text: Array<{ text: { content: string } }> };
    expect(model.rich_text[0].text.content).toBe("qwen2.5");
    const updated = props["Updated At"] as { date: { start: string } };
    expect(new Date(updated.date.start).getTime()).toBe(card.updatedAt);
  });

  it("emits exactly the declared schema property set", () => {
    expect(Object.keys(props).sort()).toEqual(Object.keys(NOTION_CARD_SCHEMA).sort());
  });

  it("never emits a vector/embedding property (§6 — local only)", () => {
    const serialized = JSON.stringify(props).toLowerCase();
    expect(serialized).not.toContain("vector");
    expect(serialized).not.toContain("embedding");
  });
});

describe("notionPageToContent (§8 — pull reads content only)", () => {
  it("reads content + UUID, ignores SR state coming back from Notion", () => {
    const page = {
      id: "notion-page-abc",
      properties: {
        UUID: { rich_text: [{ plain_text: "uuid-123" }] },
        Front: { title: [{ plain_text: "front text" }] },
        Back: { rich_text: [{ plain_text: "back text" }] },
        Topic: { rich_text: [{ plain_text: "two-pointers" }] },
        Type: { select: { name: "plain-recall" } },
        "Concept Tags": { multi_select: [{ name: "overflow" }, { name: "complement-trick" }] },
        // SR state present on the page — must NOT appear in the pulled content.
        Stability: { number: 99 },
        Reps: { number: 42 },
      },
    };
    const content = notionPageToContent(page);
    expect(content).toEqual({
      id: "uuid-123",
      notionPageId: "notion-page-abc",
      topicId: "two-pointers",
      type: "plain-recall",
      front: "front text",
      back: "back text",
      conceptTags: ["overflow", "complement-trick"],
    });
    // No SR keys leaked into the pulled content.
    expect(Object.keys(content!)).not.toContain("stability");
    expect(Object.keys(content!)).not.toContain("reps");
  });

  it("skips rows without our UUID (foreign rows in the DB)", () => {
    expect(notionPageToContent({ id: "x", properties: { Front: { title: [] } } })).toBeNull();
  });
});
