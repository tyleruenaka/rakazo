import { describe, expect, it } from "vitest";
import { chatAccentColor, userBubbleColor } from "./user-bubble-color";

const bubble = (color: string) => userBubbleColor({ id: "b_1", color });

describe("userBubbleColor", () => {
  it("keeps white and gray bots on the neutral bubble", () => {
    expect(bubble("#FFFFFF")).toBeUndefined();
    expect(bubble("#64748B")).toBeUndefined();
  });

  it("keeps yellow and bright custom colors neutral on mobile", () => {
    expect(bubble("#EAB308")).toBeUndefined();
    expect(bubble("#FFEE00")).toBeUndefined();
  });

  it("tints the other colors", () => {
    expect(bubble("#8B5CF6")).toBe("#734ccc");
    expect(bubble("#EF4444")).toBe("#c63838");
  });

  it("keeps the bot's full color as the chat accent, and none where the bubble is neutral", () => {
    expect(chatAccentColor({ id: "b_1", color: "#8B5CF6" })).toBe("#8B5CF6");
    for (const color of ["#FFFFFF", "#64748B", "#EAB308"]) {
      expect(chatAccentColor({ id: "b_1", color })).toBeUndefined();
    }
  });
});
