import { describe, expect, it } from "vitest";
import { isNeutralBotColor, resolvePersonaColorDef } from "./bot-avatar-colors.js";

describe("persona avatar colors", () => {
  it("keeps Amber Gold on dark eyes instead of a brightness heuristic", () => {
    expect(resolvePersonaColorDef("preview", "#EAB308").eyeColor).toBe("#141414");
    expect(resolvePersonaColorDef("preview", "#8B5CF6").eyeColor).toBe("#FFFFFF");
  });

  it("treats only white and gray as neutral, by id", () => {
    const neutral = (color: string) => isNeutralBotColor(resolvePersonaColorDef("preview", color));
    expect(neutral("white")).toBe(true);
    expect(neutral("gray")).toBe(true);
    expect(neutral("#FFFFFF")).toBe(true);
    expect(neutral("#64748B")).toBe(true);
    for (const id of [
      "violet",
      "green",
      "orange",
      "cyan",
      "blue",
      "yellow",
      "brown",
      "red",
      "magenta",
    ]) {
      expect(neutral(id)).toBe(false);
    }
    expect(neutral("#FFEE00")).toBe(false);
  });
});
