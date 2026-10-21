export type ChatAccent = "bot" | "none";

const CHAT_ACCENT_STORAGE_KEY = "rakazo.chatAccent";

export function getChatAccent(): ChatAccent {
  try {
    return localStorage.getItem(CHAT_ACCENT_STORAGE_KEY) === "none" ? "none" : "bot";
  } catch {
    return "bot";
  }
}

/** `data-chat-accent` on the root lets CSS tint your bubbles with the bot's color. */
export function applyChatAccent(accent: ChatAccent = getChatAccent()): void {
  if (typeof document !== "undefined") document.documentElement.dataset.chatAccent = accent;
}

export function setChatAccent(accent: ChatAccent): void {
  try {
    localStorage.setItem(CHAT_ACCENT_STORAGE_KEY, accent);
  } catch {
    // Private mode: the choice still applies for this session.
  }
  applyChatAccent(accent);
}
