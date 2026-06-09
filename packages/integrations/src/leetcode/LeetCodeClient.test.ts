import { describe, expect, it } from "vitest";
import { parseSubmissionCalendar } from "./LeetCodeClient.js";

describe("parseSubmissionCalendar", () => {
  it("maps unix day timestamps to ISO date keys", () => {
    const counts = parseSubmissionCalendar('{"1673913600": 3, "1674000000": 5}');
    expect(counts["2023-01-17"]).toBe(3);
    expect(counts["2023-01-18"]).toBe(5);
  });

  it("returns empty object for empty calendar", () => {
    expect(parseSubmissionCalendar("{}")).toEqual({});
  });
});
