import { describe, expect, it } from "vitest";
import {
  deriveTopicDifficultyFromConfidence,
  deriveTopicStatusAfterSession,
} from "./topic-progression.js";

describe("deriveTopicDifficultyFromConfidence", () => {
  it("maps confidence bands to Easy, Medium, and Hard", () => {
    expect(deriveTopicDifficultyFromConfidence(30)).toBe("Easy");
    expect(deriveTopicDifficultyFromConfidence(49)).toBe("Easy");
    expect(deriveTopicDifficultyFromConfidence(50)).toBe("Medium");
    expect(deriveTopicDifficultyFromConfidence(79)).toBe("Medium");
    expect(deriveTopicDifficultyFromConfidence(80)).toBe("Hard");
    expect(deriveTopicDifficultyFromConfidence(100)).toBe("Hard");
  });
});

describe("deriveTopicStatusAfterSession", () => {
  it("moves Not started to In progress on first session", () => {
    expect(deriveTopicStatusAfterSession("Not started", 40, false)).toBe(
      "In progress",
    );
  });

  it("keeps In progress until confidence is high enough", () => {
    expect(deriveTopicStatusAfterSession("In progress", 70, false)).toBe(
      "In progress",
    );
  });

  it("promotes to Mastered at high confidence when not a weak area", () => {
    expect(deriveTopicStatusAfterSession("In progress", 85, false)).toBe(
      "Mastered",
    );
  });

  it("does not promote weak areas to Mastered", () => {
    expect(deriveTopicStatusAfterSession("In progress", 90, true)).toBe(
      "In progress",
    );
  });

  it("never downgrades Mastered", () => {
    expect(deriveTopicStatusAfterSession("Mastered", 20, true)).toBe(
      "Mastered",
    );
  });
});
