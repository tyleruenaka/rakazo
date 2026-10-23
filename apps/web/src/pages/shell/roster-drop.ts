import { GROUP_MEMBER_MAX } from "@rakazo/contracts";

type DraggedBot = {
  id: string;
  sectionId: string | null;
  pinned: boolean;
  parentBotId: string | null;
  hasChildren: boolean;
  primary?: boolean;
};
type RosterBot = {
  id: string;
  sectionId: string | null;
  pinned: boolean;
  parentBotId: string | null;
};

export type RosterDropTarget =
  /** `nest` once the pointer has rested on the row long enough. */
  | { kind: "bot"; chat: RosterBot; nest?: boolean }
  | { kind: "group"; chat: { id: string; memberIds: readonly string[] } }
  /** A section or the unsectioned list. */
  | { kind: "section"; sectionId: string | null }
  | { kind: "pinned" };

export type RosterDropAction =
  | { action: "reorder"; targetBotId: string; unnest: boolean }
  | { action: "move"; sectionId: string | null; unpin: boolean; unnest: boolean }
  | { action: "pin"; unnest: boolean }
  | { action: "nest"; parentBotId: string }
  | { action: "join"; groupId: string; botIds: string[] };

/**
 * Nesting is one level deep: under a top-level bot, and only for a bot with no nested bots.
 * The Primary manages every bot, so it never nests under one.
 */
export function canNestBot(
  bot: { id: string; parentBotId: string | null; hasChildren: boolean; primary?: boolean },
  parent: { id: string; parentBotId: string | null },
): boolean {
  return (
    bot.id !== parent.id &&
    !bot.hasChildren &&
    !bot.primary &&
    !parent.parentBotId &&
    bot.parentBotId !== parent.id
  );
}

/**
 * Decide what dropping a dragged bot on a sidebar target does. A row takes a
 * drop only from its own list: a sibling reorders, and a nested bot dropped
 * beside a top-level one moves out to that level. Holding on a bot nests under
 * it. A section or the plain list takes the bot in, unpinning and un-nesting
 * it; the pinned area pins it; a group chat adds it as a member. Returns null
 * when the drop should be refused.
 */
export function resolveRosterDrop(input: {
  dragged: DraggedBot;
  target: RosterDropTarget;
  /** True when the target row renders under the same parent as the dragged row. */
  sameParent: boolean;
}): RosterDropAction | null {
  const { dragged, target } = input;
  const unnest = dragged.parentBotId !== null;
  switch (target.kind) {
    case "bot": {
      const chat = target.chat;
      if (chat.id === dragged.id) return null;
      if (target.nest) {
        return canNestBot(dragged, chat) ? { action: "nest", parentBotId: chat.id } : null;
      }
      const sameList =
        dragged.pinned === chat.pinned && (dragged.pinned || chat.sectionId === dragged.sectionId);
      if (!sameList) return null;
      if (input.sameParent) return { action: "reorder", targetBotId: chat.id, unnest: false };
      if (unnest && chat.parentBotId === null) {
        return { action: "reorder", targetBotId: chat.id, unnest: true };
      }
      return null;
    }
    case "section": {
      if (!dragged.pinned && !unnest && target.sectionId === dragged.sectionId) return null;
      return { action: "move", sectionId: target.sectionId, unpin: dragged.pinned, unnest };
    }
    case "pinned":
      return dragged.pinned && !unnest ? null : { action: "pin", unnest };
    case "group": {
      const members = target.chat.memberIds;
      if (members.includes(dragged.id) || members.length >= GROUP_MEMBER_MAX) return null;
      return { action: "join", groupId: target.chat.id, botIds: [...members, dragged.id] };
    }
  }
}

/**
 * The bots as the server will store them after a drop, so the row lands in the same frame the
 * ghost leaves. Mirrors setBotParent: a nested bot takes its parent's section and is never pinned.
 */
export function applyRosterDrop<
  T extends { id: string; sectionId: string | null; pinned: boolean; parentBotId: string | null },
>(bots: readonly T[], botId: string, action: RosterDropAction): readonly T[] {
  if (action.action === "join" || (action.action === "reorder" && !action.unnest)) return bots;
  const parent =
    action.action === "nest" ? bots.find((bot) => bot.id === action.parentBotId) : undefined;
  return bots.map((bot): T => {
    if (bot.id !== botId) return bot;
    const unnested = { parentBotId: null, pinned: false };
    switch (action.action) {
      case "nest":
        return {
          ...bot,
          parentBotId: action.parentBotId,
          sectionId: parent?.sectionId ?? bot.sectionId,
          pinned: false,
        };
      case "move":
        return {
          ...bot,
          sectionId: action.sectionId,
          ...(action.unpin ? { pinned: false } : {}),
          ...(action.unnest ? unnested : {}),
        };
      case "pin":
        return { ...bot, ...(action.unnest ? unnested : {}), pinned: true };
      default:
        // A reorder that moves a nested bot out; plain reorders and joins returned above.
        return { ...bot, ...unnested };
    }
  });
}
