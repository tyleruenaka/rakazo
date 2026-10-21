import { describe, expect, it } from "vitest";
import { pinnedRosterLayout, rosterReorderStep } from "./pinned-roster";

const chat = (id: string, parentBotId: string | null = null) => ({ id, parentBotId });
const ids = (rows: { item: { id: string }; depth: number }[]) =>
  rows.map((row) => `${row.item.id}@${row.depth}`);

describe("pinnedRosterLayout", () => {
  it("makes every top-level pinned chat a tile, in pin order", () => {
    const { tiles, rows } = pinnedRosterLayout(
      [chat("chief"), chat("ezra"), chat("benny")],
      new Set(),
    );
    expect(ids(tiles)).toEqual(["chief@0", "ezra@0", "benny@0"]);
    expect(rows).toEqual([]);
  });

  it("lists pinned sub-bots as indented rows under the tiles, grouped by parent", () => {
    const { tiles, rows } = pinnedRosterLayout(
      [
        chat("ezra"),
        chat("otto", "ezra"),
        chat("chief"),
        chat("felix", "ezra"),
        chat("ann", "otto"),
      ],
      new Set(),
    );
    expect(ids(tiles)).toEqual(["ezra@0", "chief@0"]);
    expect(ids(rows)).toEqual(["otto@1", "ann@2", "felix@1"]);
    expect(rows.map((row) => row.parentId)).toEqual(["ezra", "otto", "ezra"]);
  });

  it("ignores a collapsed state on tiles (they have no chevron) but keeps it for deeper parents", () => {
    const items = [chat("ezra"), chat("otto", "ezra"), chat("ann", "otto")];
    expect(ids(pinnedRosterLayout(items, new Set(["ezra"])).rows)).toEqual(["otto@1", "ann@2"]);
    expect(ids(pinnedRosterLayout(items, new Set(["otto"])).rows)).toEqual(["otto@1"]);
  });

  it("keeps a sub-bot whose parent is not pinned as a tile", () => {
    const { tiles, rows } = pinnedRosterLayout([chat("otto", "ezra")], new Set());
    expect(ids(tiles)).toEqual(["otto@0"]);
    expect(rows).toEqual([]);
  });
});

describe("rosterReorderStep", () => {
  it("moves rows with Alt+Up/Down only", () => {
    expect(rosterReorderStep("ArrowUp", false)).toBe(-1);
    expect(rosterReorderStep("ArrowDown", false)).toBe(1);
    expect(rosterReorderStep("ArrowLeft", false)).toBeNull();
    expect(rosterReorderStep("ArrowRight", false)).toBeNull();
  });

  it("moves tiles with Left/Right too, mirrored right-to-left", () => {
    expect(rosterReorderStep("ArrowLeft", true)).toBe(-1);
    expect(rosterReorderStep("ArrowRight", true)).toBe(1);
    expect(rosterReorderStep("ArrowUp", true)).toBe(-1);
    expect(rosterReorderStep("ArrowDown", true)).toBe(1);
    expect(rosterReorderStep("ArrowLeft", true, true)).toBe(1);
    expect(rosterReorderStep("ArrowRight", true, true)).toBe(-1);
    expect(rosterReorderStep("Enter", true)).toBeNull();
  });
});
