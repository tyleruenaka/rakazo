import type { NestedRosterRow, RosterParentable } from "@rakazo/core";
import { nestRosterByParent } from "@rakazo/core";

/**
 * Split the pinned list into tiles (top-level chats) and the sub-bot rows that
 * render under them. A tile has no collapse chevron, so its children always show;
 * deeper parents keep their own collapsed state.
 */
export function pinnedRosterLayout<T extends RosterParentable>(
  items: readonly T[],
  collapsedIds: ReadonlySet<string>,
): { tiles: NestedRosterRow<T>[]; rows: NestedRosterRow<T>[] } {
  const tileIds = new Set(
    nestRosterByParent(items)
      .filter((row) => row.depth === 0)
      .map((row) => row.item.id),
  );
  const nested = nestRosterByParent(
    items,
    new Set([...collapsedIds].filter((id) => !tileIds.has(id))),
  );
  return {
    tiles: nested.filter((row) => row.depth === 0),
    rows: nested.filter((row) => row.depth > 0),
  };
}

/**
 * Alt+Arrow reorder step: rows move with Up/Down; tiles, laid out in a grid, also
 * take Left/Right, mirrored in right-to-left layouts.
 */
export function rosterReorderStep(key: string, tile: boolean, rtl = false): -1 | 1 | null {
  if (key === "ArrowUp") return -1;
  if (key === "ArrowDown") return 1;
  if (!tile || (key !== "ArrowLeft" && key !== "ArrowRight")) return null;
  return (key === "ArrowLeft") !== rtl ? -1 : 1;
}
