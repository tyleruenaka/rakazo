import type Ionicons from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";
import { useSyncExternalStore } from "react";
import { MessageMenuSheet } from "./message-menu-sheet";

export type MessageMenuItem = {
  name: string;
  text: string;
  /** A symbol, or a bot's avatar for rows that pick a bot. */
  icon:
    | { ios: string; android: ComponentProps<typeof Ionicons>["name"] }
    | { botColor: string; botId: string };
  onPress: () => void;
};

export type MessageMenuSpec = {
  /** `selected` marks a reaction you already left on the message. */
  reactions: { emoji: string; selected?: boolean; onPress: () => void }[];
  /** Groups of actions, drawn as separate rounded blocks. */
  groups: MessageMenuItem[][];
  /** Where the finger was, so the Android menu opens next to the message. */
  anchor: { x: number; y: number };
};

let current: MessageMenuSpec | null = null;
// Each open mounts a fresh sheet, even if the last one is still closing.
let opened = 0;
const listeners = new Set<() => void>();

function setMenu(next: MessageMenuSpec | null) {
  current = next;
  for (const listener of listeners) listener();
}

/** Opens the reaction and action sheet for a long-pressed message. */
export function presentMessageMenu(spec: MessageMenuSpec) {
  opened += 1;
  setMenu(spec);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getMenu = () => current;

/** Mounted once at the root; shows the sheet while a menu is open. */
export function MessageMenuHost() {
  const menu = useSyncExternalStore(subscribe, getMenu, getMenu);
  if (!menu) return null;
  return <MessageMenuSheet key={opened} menu={menu} onClosed={() => setMenu(null)} />;
}
