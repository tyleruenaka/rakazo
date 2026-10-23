import { describe, expect, it } from "vitest";
import { userBubbleColor } from "./user-bubble-color";

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
});
