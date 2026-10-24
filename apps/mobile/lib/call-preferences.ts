import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/** How fast the bot talks on a call; the player's playback rate. */
export const CALL_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type CallSpeed = (typeof CALL_SPEEDS)[number];

/** What the call listens for. "auto" follows the app language, as calls always have. */
export const CALL_LANGUAGES = [
  "auto",
  "en-US",
  "en-GB",
  "de-DE",
  "nl-NL",
  "ru-RU",
  "zh-CN",
  "es-ES",
  "fr-FR",
  "ja-JP",
] as const;
export type CallLanguage = (typeof CALL_LANGUAGES)[number];

/** Each language in its own words, so it reads right whatever the app language is. */
export const CALL_LANGUAGE_LABELS: Record<Exclude<CallLanguage, "auto">, string> = {
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "de-DE": "Deutsch",
  "nl-NL": "Nederlands",
  "ru-RU": "Русский",
  "zh-CN": "简体中文",
  "es-ES": "Español",
  "fr-FR": "Français",
  "ja-JP": "日本語",
};

export type CallPreferences = { speed: CallSpeed; language: CallLanguage };

const KEY = "rakazo.call-preferences";
const DEFAULTS: CallPreferences = { speed: 1, language: "auto" };

let current = DEFAULTS;
let loading: Promise<void> | null = null;
let changed = false;
const listeners = new Set<() => void>();

export function callPreferences(): CallPreferences {
  return current;
}

/** Reads the saved choices once; until then, and if the read fails, the defaults apply. */
export function loadCallPreferences(): Promise<void> {
  loading ??= SecureStore.getItemAsync(KEY)
    .then((raw) => {
      // A choice made while this was loading is newer than what was saved.
      if (raw && !changed) publish(parse(raw));
    })
    .catch(() => undefined);
  return loading;
}

export function setCallPreferences(change: Partial<CallPreferences>): void {
  changed = true;
  publish({ ...current, ...change });
  void SecureStore.setItemAsync(KEY, JSON.stringify(current)).catch(() => undefined);
}

export function useCallPreferences(): CallPreferences {
  return useSyncExternalStore(subscribe, callPreferences);
}

export function resetCallPreferencesForTests(): void {
  current = DEFAULTS;
  loading = null;
  changed = false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: CallPreferences): void {
  current = next;
  for (const listener of listeners) listener();
}

function parse(raw: string): CallPreferences {
  try {
    const saved = JSON.parse(raw) as { speed?: unknown; language?: unknown };
    return {
      speed: CALL_SPEEDS.find((speed) => speed === saved.speed) ?? DEFAULTS.speed,
      language: CALL_LANGUAGES.find((language) => language === saved.language) ?? DEFAULTS.language,
    };
  } catch {
    return DEFAULTS;
  }
}
