import { describe, expect, it } from "vitest";
import { parseWhatsAppCommand } from "./parse-command.js";

describe("parseWhatsAppCommand", () => {
  it("parses plan", () => {
    expect(parseWhatsAppCommand("plan")).toEqual({ type: "plan" });
    expect(parseWhatsAppCommand("/plan")).toEqual({ type: "plan" });
  });

  it("parses hint", () => {
    expect(parseWhatsAppCommand("hint Coin Change")).toEqual({
      type: "hint",
      problemName: "Coin Change",
    });
  });

  it("parses debrief", () => {
    expect(parseWhatsAppCommand("debrief")).toEqual({ type: "debrief" });
    expect(parseWhatsAppCommand("review")).toEqual({ type: "debrief" });
  });

  it("parses done", () => {
    expect(parseWhatsAppCommand("done Coin Change 45 80")).toEqual({
      type: "done",
      problemName: "Coin Change",
      studyDuration: 45,
      productivityScore: 80,
    });
    expect(parseWhatsAppCommand("done Coin Change, 45min, 80score")).toEqual({
      type: "done",
      problemName: "Coin Change",
      studyDuration: 45,
      productivityScore: 80,
    });
  });
});
