import { describe, expect, it } from "vitest";
import {
  formatLocalDate,
  normalizeDifficulty,
  normalizeProblemStatus,
  toNotionProblemStatus,
} from "./problem-fields.js";

describe("normalizeProblemStatus", () => {
  it("maps Notion select values", () => {
    expect(normalizeProblemStatus("Not started")).toBe("Not started");
    expect(normalizeProblemStatus("Solved")).toBe("Solved");
    expect(normalizeProblemStatus("Revision needed")).toBe("Revision needed");
  });

  it("maps legacy internal values", () => {
    expect(normalizeProblemStatus("Unsolved")).toBe("Not started");
    expect(normalizeProblemStatus("Attempted")).toBe("Revision needed");
  });
});

describe("toNotionProblemStatus", () => {
  it("returns canonical Notion labels", () => {
    expect(toNotionProblemStatus("Unsolved")).toBe("Not started");
    expect(toNotionProblemStatus("Solved")).toBe("Solved");
  });
});

describe("normalizeDifficulty", () => {
  it("normalizes case", () => {
    expect(normalizeDifficulty("easy")).toBe("Easy");
    expect(normalizeDifficulty("Medium")).toBe("Medium");
    expect(normalizeDifficulty("HARD")).toBe("Hard");
  });
});

describe("formatLocalDate", () => {
  it("uses local calendar day", () => {
    const date = new Date(2025, 5, 13, 23, 30);
    expect(formatLocalDate(date)).toBe("2025-06-13");
  });
});
