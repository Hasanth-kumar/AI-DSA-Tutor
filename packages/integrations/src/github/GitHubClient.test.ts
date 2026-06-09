import { describe, expect, it } from "vitest";
import { matchProblemToFile, slugifyProblemName } from "./GitHubClient.js";

describe("GitHubClient helpers", () => {
  it("slugifies problem names", () => {
    expect(slugifyProblemName("Two Sum")).toBe("two-sum");
    expect(slugifyProblemName("Coin Change II")).toBe("coin-change-ii");
  });

  it("matches problem to solution file by slug", () => {
    const files = [
      {
        name: "two-sum.ts",
        path: "leetcode/two-sum.ts",
        sha: "abc",
        htmlUrl: "https://github.com/u/r/blob/main/leetcode/two-sum.ts",
        downloadUrl: null,
      },
      {
        name: "coin-change.py",
        path: "leetcode/coin-change.py",
        sha: "def",
        htmlUrl: "https://github.com/u/r/blob/main/leetcode/coin-change.py",
        downloadUrl: null,
      },
    ];

    const match = matchProblemToFile("Two Sum", files);
    expect(match?.name).toBe("two-sum.ts");
  });
});
