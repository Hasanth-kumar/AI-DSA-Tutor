import { describe, expect, it } from "vitest";
import { formatWarmupAnswer, isWalkthroughWarmupAnswer } from "./formatAnswer.js";

describe("isWalkthroughWarmupAnswer", () => {
  it("flags problem-solution narration", () => {
    const raw =
      "this is also a bit similar to the permutation problem but the difference is that we add different permutations";

    expect(isWalkthroughWarmupAnswer(raw)).toBe(true);
  });
});

describe("formatWarmupAnswer", () => {
  it("prefers factual solution lines from notes", () => {
    const raw =
      "Description: Given an array `nums` of distinct integers, return all permutations. " +
      "You can return the answer in **any order**. " +
      "Solution: Use backtracking. Swap each element to the front and recurse. Stop when the index reaches the array length.";

    expect(formatWarmupAnswer(raw)).toBe(
      "Use backtracking. Swap each element to the front and recurse. Stop when the index reaches the array length.",
    );
  });

  it("drops walkthrough-only answers", () => {
    const raw =
      "this is also a bit similar to the permutation problem but the difference is that we add different permutations instead of a single number";

    expect(formatWarmupAnswer(raw)).toBe("");
  });

  it("drops system placeholder text", () => {
    expect(formatWarmupAnswer("No model answer available — grade your recall from memory.")).toBe(
      "",
    );
  });

  it("caps long answers at three sentences", () => {
    const raw =
      "First idea. Second idea. Third idea. Fourth idea. Fifth idea.";

    expect(formatWarmupAnswer(raw)).toBe("First idea. Second idea. Third idea.");
  });

  it("strips markdown and collapses whitespace", () => {
    expect(formatWarmupAnswer("The answer is **O(n log n)** with `merge sort`.")).toBe(
      "The answer is O(n log n) with merge sort.",
    );
  });
});
