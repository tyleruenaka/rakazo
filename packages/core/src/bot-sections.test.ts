import { describe, expect, it } from "vitest";
import {
  groupBotsForSidebar,
  listedSectionId,
  movesWithParent,
  nestRosterByParent,
  reorderBotTo,
} from "./bot-sections.js";

const sections = [
  { id: "work", name: "Work" },
  { id: "home", name: "Home" },
];

describe("groupBotsForSidebar", () => {
  it("labels only built-in groups and preserves keys and the heading-free list", () => {
    const labels = { pinned: "Angeheftet", unassigned: "Nicht zugewiesen" };
    const bots = [
      { id: "pin", pinned: true, sectionId: null },
      { id: "loose", pinned: false, sectionId: null },
    ];
    expect(
      groupBotsForSidebar(bots, [{ id: "custom", name: "Pinned" }], {
        labels,
        includeEmptySections: true,
      }).map(({ key, title }) => [key, title]),
    ).toEqual([
      ["pinned", labels.pinned],
      ["section:custom", "Pinned"],
      ["unassigned", labels.unassigned],
    ]);
    expect(groupBotsForSidebar([bots[1]!], [], { labels })[0]?.title).toBeNull();
  });
  it("keeps pinned bots in one top-level group without duplicating them", () => {
    const groups = groupBotsForSidebar(
      [
        { id: "pinned", pinned: true, sectionId: "home" },
        { id: "work", pinned: false, sectionId: "work" },
        { id: "home", pinned: false, sectionId: "home" },
        { id: "loose", pinned: false, sectionId: null },
      ],
      sections,
    );

    expect(groups.map((group) => [group.title, group.bots.map((bot) => bot.id)])).toEqual([
      ["Pinned", ["pinned"]],
      ["Work", ["work"]],
      ["Home", ["home"]],
      ["Unassigned", ["loose"]],
    ]);
  });

  it("treats bots pointing at an unavailable section as unassigned", () => {
    const groups = groupBotsForSidebar(
      [{ id: "orphan", pinned: false, sectionId: "missing" }],
      sections,
    );
    expect(groups).toEqual([
      {
        key: "unassigned",
        title: "Unassigned",
        bots: [{ id: "orphan", pinned: false, sectionId: "missing" }],
      },
    ]);
  });

  it("does not add a heading before sections or pins exist", () => {
    const groups = groupBotsForSidebar([{ id: "first", pinned: false, sectionId: null }], []);
    expect(groups[0]?.title).toBeNull();
  });
});

describe("nested bots and the pinned area", () => {
  it("shows a nested bot marked pinned as a row in its section, not a tile", () => {
    const grouped = groupBotsForSidebar(
      [
        { id: "chief", pinned: true, sectionId: "work", parentBotId: null },
        { id: "scout", pinned: true, sectionId: "work", parentBotId: "chief" },
      ],
      sections,
    );
    expect(grouped.map((group) => [group.key, group.bots.map((bot) => bot.id)])).toEqual([
      ["pinned", ["chief"]],
      ["section:work", ["scout"]],
    ]);
  });
});

describe("where a nested bot lists", () => {
  const listed = (bots: Parameters<typeof groupBotsForSidebar>[0]) =>
    groupBotsForSidebar(bots, sections).map((group) => [
      group.key,
      group.bots.map((bot) => bot.id),
    ]);

  it("lists under an unpinned parent even when the nested bot has no section", () => {
    // A bot spawned without a section, nested under a parent that sits in a section.
    expect(
      listed([
        { id: "remy", pinned: false, sectionId: "work", parentBotId: null },
        { id: "wren", pinned: false, sectionId: null, parentBotId: "remy" },
      ]),
    ).toEqual([["section:work", ["remy", "wren"]]]);
  });

  it("lists under an unpinned parent whatever section the nested bot has", () => {
    expect(
      listed([
        { id: "chief", pinned: false, sectionId: "work", parentBotId: null },
        { id: "scout", pinned: false, sectionId: "home", parentBotId: "chief" },
        { id: "gone", pinned: false, sectionId: "missing", parentBotId: "chief" },
      ]),
    ).toEqual([["section:work", ["chief", "scout", "gone"]]]);
  });

  it("follows an unpinned parent into the unassigned list", () => {
    expect(
      listed([
        { id: "chief", pinned: false, sectionId: null, parentBotId: null },
        { id: "scout", pinned: false, sectionId: "home", parentBotId: "chief" },
      ]),
    ).toEqual([["unassigned", ["chief", "scout"]]]);
  });

  it("lists in its own section while the parent is pinned, and returns on unpin", () => {
    const parent = { id: "chief", pinned: true, sectionId: "work", parentBotId: null };
    const nested = [
      { id: "scout", pinned: false, sectionId: "home", parentBotId: "chief" },
      { id: "loose", pinned: false, sectionId: null, parentBotId: "chief" },
    ];
    expect(listed([parent, ...nested])).toEqual([
      ["pinned", ["chief"]],
      ["section:home", ["scout"]],
      ["unassigned", ["loose"]],
    ]);
    expect(listed([{ ...parent, pinned: false }, ...nested])).toEqual([
      ["section:work", ["chief", "scout", "loose"]],
    ]);
  });

  it("lists in its own section when the parent is not in the list", () => {
    expect(
      listed([{ id: "scout", pinned: false, sectionId: "home", parentBotId: "filtered" }]),
    ).toEqual([["section:home", ["scout"]]]);
  });

  it("reports the section a bot lists in", () => {
    const bots = [
      { id: "chief", pinned: false, sectionId: "work", parentBotId: null },
      { id: "star", pinned: true, sectionId: "work", parentBotId: null },
      { id: "scout", pinned: false, sectionId: null, parentBotId: "chief" },
      { id: "aide", pinned: false, sectionId: "home", parentBotId: "star" },
    ];
    expect(bots.map((bot) => listedSectionId(bot, bots))).toEqual(["work", "work", "work", "home"]);
    expect(bots.map((bot) => movesWithParent(bot, bots))).toEqual([false, false, true, false]);
  });
});

describe("reorderBotTo", () => {
  const bots = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves a bot to the target bot's position in either direction", () => {
    expect(reorderBotTo(bots, "a", "c").map((bot) => bot.id)).toEqual(["b", "c", "a"]);
    expect(reorderBotTo(bots, "c", "a").map((bot) => bot.id)).toEqual(["c", "a", "b"]);
  });

  it("leaves the list alone when either bot is missing or unchanged", () => {
    expect(reorderBotTo(bots, "a", "missing")).toBe(bots);
    expect(reorderBotTo(bots, "a", "a")).toBe(bots);
  });
});

describe("nestRosterByParent", () => {
  it("nests children under parents that appear in the same list", () => {
    const rows = nestRosterByParent([
      { id: "chief", parentBotId: null },
      { id: "lead", parentBotId: "chief" },
      { id: "helper", parentBotId: "lead" },
      { id: "peer", parentBotId: null },
    ]);
    expect(rows.map((row) => [row.item.id, row.depth, row.hasChildren])).toEqual([
      ["chief", 0, true],
      ["lead", 1, true],
      ["helper", 2, false],
      ["peer", 0, false],
    ]);
    expect(rows.map((row) => row.parentId)).toEqual([null, "chief", "lead", null]);
  });

  it("keeps orphans as roots when the parent is not in the list", () => {
    const rows = nestRosterByParent([{ id: "helper", parentBotId: "missing" }]);
    expect(rows).toEqual([
      {
        item: { id: "helper", parentBotId: "missing" },
        depth: 0,
        hasChildren: false,
        parentId: null,
      },
    ]);
  });

  it("hides all descendants when a parent is collapsed", () => {
    const rows = nestRosterByParent(
      [
        { id: "chief", parentBotId: null },
        { id: "lead", parentBotId: "chief" },
        { id: "helper", parentBotId: "lead" },
      ],
      new Set(["chief"]),
    );
    expect(rows.map((row) => row.item.id)).toEqual(["chief"]);
    expect(rows[0]?.hasChildren).toBe(true);
  });

  it("preserves sibling order from the source list", () => {
    const rows = nestRosterByParent([
      { id: "chief", parentBotId: null },
      { id: "beta", parentBotId: "chief" },
      { id: "alpha", parentBotId: "chief" },
    ]);
    expect(rows.map((row) => row.item.id)).toEqual(["chief", "beta", "alpha"]);
  });

  it("breaks parent cycles without dropping the items", () => {
    const rows = nestRosterByParent([
      { id: "a", parentBotId: "b" },
      { id: "b", parentBotId: "a" },
    ]);
    expect(rows.map((row) => row.item.id).sort()).toEqual(["a", "b"]);
  });
});
