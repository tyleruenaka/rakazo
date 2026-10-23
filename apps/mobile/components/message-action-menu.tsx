import type Ionicons from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";
import { useSyncExternalStore } from "react";
import { Keyboard, Platform } from "react-native";
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
  /**
   * Where the finger was, so the Android menu opens next to the message. With `below`, `y` is a
   * button's bottom edge and the menu opens under it, so a quick second tap can't land on a row.
   */
  anchor: { x: number; y: number; below?: boolean };
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
  // The Android menu is its own window. If the message box keeps focus behind it, Android
  // shows the keyboard again when the menu closes, and the next press only hides it.
  if (Platform.OS === "android") Keyboard.dismiss();
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
