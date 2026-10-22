import type { ReactElement } from "react";
import type { MobileBotSection } from "../lib/api";
import type { InboxRowAction } from "../lib/inbox-swipe";
import type { BotOrganizationUpdate } from "./bot-organize-modal";
import type { InboxChatPreviewProps } from "./inbox-chat-preview";

export type InboxSwipeRowProps = {
  rowKey: string;
  unread?: boolean;
  pinned?: boolean;
  /** Bots only; groups have no finish notifications. */
  notifyOnFinish?: boolean;
  sectionId?: string | null;
  sections: readonly MobileBotSection[];
  preview: InboxChatPreviewProps;
  onAction: (action: InboxRowAction) => void;
  onOrganize: (update: BotOrganizationUpdate) => void;
  onEditSection: (mode: "create" | "rename") => void;
  children: ReactElement;
};

export type InboxPinnedMenuProps = Omit<InboxSwipeRowProps, "rowKey"> & {
  size: { width: number; height: number };
};

/** Swipe actions and the context menu are iOS list behaviour; other platforms keep the sheet. */
export function InboxSwipeRow({ children }: InboxSwipeRowProps) {
  return children;
}

/** Other platforms organize pinned tiles with the long-press sheet. */
export function InboxPinnedMenu({ children }: InboxPinnedMenuProps) {
  return children;
}
