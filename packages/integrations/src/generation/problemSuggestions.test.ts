import { describe, expect, it } from "vitest";
import { parseProblemSuggestions } from "./problemSuggestions.js";

describe("parseProblemSuggestions (E3)", () => {
  it("extracts valid rows from fenced, chatty LLM output", () => {
    const text = [
      "Sure! Here are some classics:",
      "```json",
      JSON.stringify([
        { name: "Two Sum", difficulty: "Easy", slug: "two-sum" },
        { name: "3Sum", difficulty: "Medium", slug: "3sum" },
      ]),
      "```",
      "Happy studying!",
    ].join("\n");

    const rows = parseProblemSuggestions(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      name: "Two Sum",
      difficulty: "Easy",
      slug: "two-sum",
      link: "https://leetcode.com/problems/two-sum/",
    });
  });

  it("drops malformed rows: bad difficulty, bad slug, missing name, duplicates", () => {
    const rows = parseProblemSuggestions(
      JSON.stringify([
        { name: "Ok", difficulty: "Hard", slug: "ok-problem" },
        { name: "Bad diff", difficulty: "Insane", slug: "bad-diff" },
        { name: "Bad slug", difficulty: "Easy", slug: "Not A Slug!" },
        { difficulty: "Easy", slug: "no-name" },
        { name: "Dup", difficulty: "Easy", slug: "ok-problem" },
        "not-an-object",
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slug).toBe("ok-problem");
  });

  it("returns [] on garbage", () => {
    expect(parseProblemSuggestions(null)).toEqual([]);
    expect(parseProblemSuggestions("no json here")).toEqual([]);
    expect(parseProblemSuggestions("[{ broken")).toEqual([]);
    expect(parseProblemSuggestions('{"an":"object"}')).toEqual([]);
  });
});
