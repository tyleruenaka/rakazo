import { describe, expect, it } from "vitest";
import { messageMenuPlacement } from "./message-menu-placement";

const viewport = {
  width: 750,
  height: 400,
  insets: { top: 24, bottom: 20, left: 0, right: 0 },
  maxWidth: 340,
};

describe("message menu placement", () => {
  it("clamps oversized menus to the safe viewport without inverted bounds", () => {
    const result = messageMenuPlacement({
      ...viewport,
      measuredHeight: 900,
      anchor: { x: 740, y: 390 },
    });
    expect(result).toEqual({ left: 398, top: 36, menuWidth: 340, maxHeight: 332 });
  });

  it("keeps normal menus next to the anchor and inside every edge", () => {
    const result = messageMenuPlacement({
      ...viewport,
      measuredHeight: 120,
      anchor: { x: 0, y: 0 },
    });
    expect(result.left).toBe(12);
    expect(result.top).toBe(36);
    const bottom = messageMenuPlacement({
      ...viewport,
      measuredHeight: 120,
      anchor: { x: 400, y: 400 },
    });
    expect(bottom.top + 120).toBe(368);
  });

  it("handles a viewport smaller than the margins and respects horizontal safe areas", () => {
    const tiny = messageMenuPlacement({
      ...viewport,
      width: 10,
      height: 10,
      measuredHeight: 100,
      anchor: { x: 0, y: 0 },
    });
    expect(tiny).toEqual({ left: 10, top: 10, menuWidth: 0, maxHeight: 0 });
    const result = messageMenuPlacement({
      ...viewport,
      width: 300,
      insets: { top: 0, bottom: 0, left: 30, right: 40 },
      measuredHeight: 100,
      anchor: { x: 0, y: 0 },
    });
    expect(result.left).toBe(42);
    expect(result.menuWidth).toBe(206);
  });

  it("opens a menu from a button below that button, so a quick second tap can't land on a row", () => {
    // A phone with the + button in the top corner: 44dp tall, its bottom edge at y=98.
    const phone = { width: 411, height: 914, insets: { top: 54, bottom: 24, left: 0, right: 0 } };
    const result = messageMenuPlacement({
      ...phone,
      maxWidth: 340,
      measuredHeight: 225,
      anchor: { x: 374, y: 98, below: true },
    });
    expect(result.top).toBeGreaterThanOrEqual(98);
    expect(result.top + 225).toBeLessThanOrEqual(914 - 24);
  });
});
