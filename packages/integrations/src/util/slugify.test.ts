import { describe, expect, it } from "vitest";
import { slugifyProblemName } from "./slugify.js";

describe("slugifyProblemName", () => {
  it("slugifies common problem titles", () => {
    expect(slugifyProblemName("Two Sum")).toBe("two-sum");
    expect(slugifyProblemName("Coin Change II")).toBe("coin-change-ii");
  });
});
