import { GROUP_MEMBER_MAX } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { applyRosterDrop, canNestBot, resolveRosterDrop } from "./roster-drop";

const bot = (
  id: string,
  sectionId: string | null,
  { pinned = false, parentBotId = null as string | null, hasChildren = false } = {},
) => ({ id, sectionId, pinned, parentBotId, hasChildren });
const group = (id: string, memberIds: string[]) => ({ id, memberIds });

describe("resolveRosterDrop", () => {
  it("reorders when the bot is dropped on a sibling in the same section", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "bot", chat: bot("b", "s1") },
        sameParent: true,
      }),
    ).toEqual({ action: "reorder", targetBotId: "b", unnest: false });
  });

  it("refuses a top-level bot dropped among another bot's nested bots", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "bot", chat: bot("b", "s1", { parentBotId: "p" }) },
        sameParent: false,
      }),
    ).toBeNull();
  });

  it("moves a nested bot out beside the top-level bot it is dropped on", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1", { parentBotId: "p" }),
        target: { kind: "bot", chat: bot("b", "s1") },
        sameParent: false,
      }),
    ).toEqual({ action: "reorder", targetBotId: "b", unnest: true });
  });

  it("leaves a row in another list to that list's own drop", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "bot", chat: bot("b", "s2") },
        sameParent: false,
      }),
    ).toBeNull();
    expect(
      resolveRosterDrop({
        dragged: bot("a", null, { pinned: true }),
        target: { kind: "bot", chat: bot("b", null) },
        sameParent: false,
      }),
    ).toBeNull();
  });

  it("moves into another section or the plain list", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", null),
        target: { kind: "section", sectionId: "s2" },
        sameParent: false,
      }),
    ).toEqual({ action: "move", sectionId: "s2", unpin: false, unnest: false });
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "section", sectionId: null },
        sameParent: false,
      }),
    ).toEqual({ action: "move", sectionId: null, unpin: false, unnest: false });
  });

  it("does nothing when a top-level bot is dropped on its own section", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "section", sectionId: "s1" },
        sameParent: false,
      }),
    ).toBeNull();
  });

  it("un-nests a nested bot dropped on a section, its own included", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1", { parentBotId: "p" }),
        target: { kind: "section", sectionId: "s1" },
        sameParent: false,
      }),
    ).toEqual({ action: "move", sectionId: "s1", unpin: false, unnest: true });
  });

  it("unpins a pinned bot dropped on a section", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", null, { pinned: true }),
        target: { kind: "section", sectionId: "s2" },
        sameParent: false,
      }),
    ).toEqual({ action: "move", sectionId: "s2", unpin: true, unnest: false });
  });

  it("pins a bot dropped on the pinned area, un-nesting it", () => {
    expect(
      resolveRosterDrop({ dragged: bot("a", "s1"), target: { kind: "pinned" }, sameParent: false }),
    ).toEqual({ action: "pin", unnest: false });
    expect(
      resolveRosterDrop({
        dragged: bot("a", null, { pinned: true, parentBotId: "p" }),
        target: { kind: "pinned" },
        sameParent: false,
      }),
    ).toEqual({ action: "pin", unnest: true });
    expect(
      resolveRosterDrop({
        dragged: bot("a", null, { pinned: true }),
        target: { kind: "pinned" },
        sameParent: false,
      }),
    ).toBeNull();
  });

  it("nests under a held bot, from any list", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "bot", chat: bot("b", "s2", { pinned: true }), nest: true },
        sameParent: false,
      }),
    ).toEqual({ action: "nest", parentBotId: "b" });
  });

  it("refuses a nest that would go two levels deep", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "bot", chat: bot("b", "s1", { parentBotId: "p" }), nest: true },
        sameParent: false,
      }),
    ).toBeNull();
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1", { hasChildren: true }),
        target: { kind: "bot", chat: bot("b", "s1"), nest: true },
        sameParent: true,
      }),
    ).toBeNull();
  });

  it("joins a group chat when dropped on it", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "group", chat: group("g1", ["b", "c"]) },
        sameParent: false,
      }),
    ).toEqual({ action: "join", groupId: "g1", botIds: ["b", "c", "a"] });
  });

  it("refuses to join a group it already belongs to or one that is full", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", null),
        target: { kind: "group", chat: group("g1", ["a", "b"]) },
        sameParent: false,
      }),
    ).toBeNull();
    expect(
      resolveRosterDrop({
        dragged: bot("z", null),
        target: {
          kind: "group",
          chat: group(
            "g1",
            Array.from({ length: GROUP_MEMBER_MAX }, (_, i) => `m${i}`),
          ),
        },
        sameParent: false,
      }),
    ).toBeNull();
  });

  it("ignores a drop on itself", () => {
    expect(
      resolveRosterDrop({
        dragged: bot("a", "s1"),
        target: { kind: "bot", chat: bot("a", "s1"), nest: true },
        sameParent: true,
      }),
    ).toBeNull();
  });
});

describe("canNestBot", () => {
  it("allows a bot without nested bots under another top-level bot", () => {
    expect(canNestBot(bot("a", null), bot("b", null))).toBe(true);
    expect(canNestBot(bot("a", null, { parentBotId: "c" }), bot("b", null))).toBe(true);
  });

  it("refuses itself, its current parent, a nested parent, or a bot with nested bots", () => {
    expect(canNestBot(bot("a", null), bot("a", null))).toBe(false);
    expect(canNestBot(bot("a", null, { parentBotId: "b" }), bot("b", null))).toBe(false);
    expect(canNestBot(bot("a", null), bot("b", null, { parentBotId: "c" }))).toBe(false);
    expect(canNestBot(bot("a", null, { hasChildren: true }), bot("b", null))).toBe(false);
  });

  it("never nests the Primary, but nests other bots under it", () => {
    expect(canNestBot({ ...bot("a", null), primary: true }, bot("b", null))).toBe(false);
    const primaryParent = { ...bot("b", null), primary: true };
    expect(canNestBot(bot("a", null), primaryParent)).toBe(true);
  });
});

describe("applyRosterDrop", () => {
  const row = (
    id: string,
    sectionId: string | null,
    pinned = false,
    parentBotId: string | null = null,
  ) => ({
    id,
    sectionId,
    pinned,
    parentBotId,
  });
  const roster = [row("chief", "s1", true), row("a", "s2"), row("b", "s2", false, "chief")];
  const find = (bots: readonly ReturnType<typeof row>[], id: string) =>
    bots.find((bot) => bot.id === id);

  it("nests into the parent's section without pinning, even under a pinned parent", () => {
    expect(
      find(applyRosterDrop(roster, "a", { action: "nest", parentBotId: "chief" }), "a"),
    ).toEqual(row("a", "s1", false, "chief"));
  });

  it("moves, unpins and un-nests as the drop says", () => {
    const moved = applyRosterDrop(roster, "b", {
      action: "move",
      sectionId: null,
      unpin: false,
      unnest: true,
    });
    expect(find(moved, "b")).toEqual(row("b", null, false, null));
    const pinned = applyRosterDrop(roster, "b", { action: "pin", unnest: true });
    expect(find(pinned, "b")).toEqual(row("b", "s2", true, null));
  });

  it("leaves the list alone for a plain reorder or a group join", () => {
    expect(
      applyRosterDrop(roster, "a", { action: "reorder", targetBotId: "b", unnest: false }),
    ).toBe(roster);
    expect(applyRosterDrop(roster, "a", { action: "join", groupId: "g", botIds: ["a"] })).toBe(
      roster,
    );
  });
});
