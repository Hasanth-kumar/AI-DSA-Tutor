import { describe, expect, it } from "vitest";
import { deriveProductivityFromDuration } from "./session-productivity.js";

describe("deriveProductivityFromDuration", () => {
  it("scores short focused sessions at 90 or above", () => {
    expect(deriveProductivityFromDuration(1)).toBeGreaterThanOrEqual(90);
    expect(deriveProductivityFromDuration(15)).toBeGreaterThanOrEqual(90);
    expect(deriveProductivityFromDuration(30)).toBe(90);
  });

  it("scores a one-hour session at 75", () => {
    expect(deriveProductivityFromDuration(60)).toBe(75);
  });

  it("interpolates between 30 and 60 minutes", () => {
    expect(deriveProductivityFromDuration(45)).toBe(83);
  });

  it("slowly decreases productivity beyond one hour", () => {
    expect(deriveProductivityFromDuration(75)).toBe(74);
    expect(deriveProductivityFromDuration(90)).toBe(73);
    expect(deriveProductivityFromDuration(120)).toBe(71);
  });

  it("clamps very long sessions at a minimum score", () => {
    expect(deriveProductivityFromDuration(600)).toBe(40);
  });
});
