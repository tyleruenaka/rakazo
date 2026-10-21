export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const;

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

export type ResolvedAppearance = "light" | "dark";

export const UI_APPEARANCE_STORAGE_KEY = "rakazo.uiAppearance";

/**
 * Semantic palette shared by web, Electron, and Expo. Names follow the shadcn
 * convention so the same slot means the same thing on every surface: a `border`
 * is always a border and never a fill.
 */
export type ColorTokens = {
  background: string;
  /** Modals: a step lighter than the page so they read as raised above it. */
  dialog: string;
  /** Border of the Settings dialog. */
  settingsBorder: string;
  /** Hairline between the Settings nav and its content. */
  settingsDivider: string;
  /** Selected or hovered Settings nav item. */
  settingsNav: string;
  foreground: string;
  card: string;
  cardForeground: string;
  /** Hairline around a settings card. */
  cardBorder: string;
  /** Description under a settings label. */
  description: string;
  popover: string;
  popoverForeground: string;
  /** Hairline around menus and popovers. */
  popoverBorder: string;
  /** Hovered or highlighted menu row. */
  popoverAccent: string;
  /** Keyboard-highlighted result in the command palette. */
  paletteHighlight: string;
  /** Neutral fill for small controls: open select, picker hover, switch track, secondary button. */
  control: string;
  /** Border of a control while its menu is open. */
  controlOpenBorder: string;
  /** Icon in a round outlined header button, a step softer than text. */
  controlIcon: string;
  primary: string;
  primaryForeground: string;
  /** Disabled filled button. */
  primaryDisabled: string;
  primaryDisabledForeground: string;
  secondary: string;
  secondaryForeground: string;
  chatUser: string;
  chatUserForeground: string;
  /** Composer placeholder. */
  chatPlaceholder: string;
  /** Icon in the composer's round buttons (attach, mic). */
  composerIcon: string;
  /** Hairline around the composer's round buttons. */
  composerControlBorder: string;
  /** Hairline around the floating chat name pill. */
  pillBorder: string;
  /** Ring just outside a card in the transcript. */
  cardRing: string;
  /** Inline code chip and code block fill in a chat message. */
  code: string;
  codeForeground: string;
  /** List bullets and numbers in a chat message. */
  markdownMarker: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  /** Hairline of an outlined control (round header button, footer pill) on hover. */
  inputHover: string;
  /** Field border while focused. */
  inputFocus: string;
  /** Placeholder and secondary values in fields and menus. */
  placeholder: string;
  ring: string;
  /** Track of a switch that is on. */
  switch: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarBorder: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  /** Hovered row or section header in the bot list. */
  sidebarHover: string;
  /** Secondary sidebar text; translucent so it lifts on hovered and selected rows. */
  sidebarMutedForeground: string;
  /** Translucent tag fill (role chip) that follows the row bg. */
  chip: string;
  chipBorder: string;
  link: string;
  /** Backing behind a link's site icon. White in both themes so dark logos stay visible. */
  faviconPlate: string;
  success: string;
  warning: string;
  statusWorking: string;
  /** Unread dot in the bot list. */
  unread: string;
  overlay: string;
  scrollbar: string;
  /** Thumb of the overlay scrollbar in popups, shown while scrolling. */
  popupScrollbar: string;
  scrollbarHover: string;
};

export const darkTokens = {
  background: "#121212",
  dialog: "#1F1F1F",
  settingsBorder: "#292929",
  settingsDivider: "#1F1F1F",
  settingsNav: "#242424",
  foreground: "#F5F5F5",
  card: "#1F1F1F",
  cardForeground: "#F5F5F5",
  cardBorder: "#2C2C2C",
  description: "#ACACAC",
  popover: "#1F1F1F",
  popoverForeground: "#F5F5F5",
  popoverBorder: "#353535",
  popoverAccent: "#2B2B2B",
  paletteHighlight: "#303030",
  control: "#282828",
  controlOpenBorder: "#303030",
  controlIcon: "#E0E0E0",
  primary: "#F5F5F5",
  primaryForeground: "#121212",
  primaryDisabled: "#3B3B3B",
  primaryDisabledForeground: "#737373",
  secondary: "#282828",
  secondaryForeground: "#F5F5F5",
  chatUser: "#3B3B3B",
  chatUserForeground: "#F5F5F5",
  chatPlaceholder: "#707070",
  composerIcon: "#979797",
  composerControlBorder: "#333333",
  pillBorder: "#262626",
  cardRing: "#1B1B1B",
  code: "#202020",
  codeForeground: "#ADADAD",
  markdownMarker: "#919191",
  muted: "#1B1B1B",
  mutedForeground: "#A8A8A8",
  accent: "#242424",
  accentForeground: "#F5F5F5",
  destructive: "#FF6464",
  destructiveForeground: "#FFFFFF",
  border: "#2A2A2A",
  input: "#2C2C2C",
  inputHover: "#373737",
  inputFocus: "#4E4E4E",
  placeholder: "#939393",
  ring: "#1784FC",
  switch: "#106ED2",
  sidebar: "#0E0E0E",
  sidebarForeground: "#F5F5F5",
  sidebarBorder: "#1C1C1C",
  sidebarAccent: "#202020",
  sidebarAccentForeground: "#F5F5F5",
  sidebarHover: "#1B1B1B",
  sidebarMutedForeground: "rgba(245, 245, 245, 0.662)",
  chip: "rgba(255, 255, 255, 0.02)",
  chipBorder: "rgba(255, 255, 255, 0.054)",
  link: "#3B82F6",
  faviconPlate: "#FFFFFF",
  success: "#4ECB71",
  warning: "#E9C46A",
  statusWorking: "#3B82F6",
  unread: "#4D9BFF",
  overlay: "rgba(0, 0, 0, 0.7)",
  scrollbar: "#1F1F1F",
  popupScrollbar: "#8F8F8F",
  scrollbarHover: "#2A2A2A",
} as const satisfies ColorTokens;

export const lightTokens = {
  background: "#FCFCFC",
  dialog: "#FFFFFF",
  settingsBorder: "#E1E1E1",
  settingsDivider: "#EAEAEA",
  settingsNav: "#EAEAEA",
  foreground: "#1C1C1C",
  card: "#FFFFFF",
  cardForeground: "#1C1C1C",
  cardBorder: "#EDEDED",
  description: "#767676",
  popover: "#FFFFFF",
  popoverForeground: "#1C1C1C",
  popoverBorder: "#E3E3E3",
  popoverAccent: "#F2F2F2",
  paletteHighlight: "#EDEDED",
  control: "#F2F2F2",
  controlOpenBorder: "#E6E6E6",
  controlIcon: "#2E2E2E",
  primary: "#1C1C1C",
  primaryForeground: "#FCFCFC",
  primaryDisabled: "#DDDDDD",
  primaryDisabledForeground: "#A3A3A3",
  secondary: "#EFEFEF",
  secondaryForeground: "#1C1C1C",
  chatUser: "#1C1C1C",
  chatUserForeground: "#FFFFFF",
  chatPlaceholder: "#A4A4A4",
  composerIcon: "#7A7A7A",
  composerControlBorder: "#E1E1E1",
  pillBorder: "#E9E9E9",
  cardRing: "#EDEDED",
  code: "#E7E7E7",
  codeForeground: "#5D5D5D",
  markdownMarker: "#797979",
  muted: "#EFEFEF",
  mutedForeground: "#646464",
  accent: "#E9E9E9",
  accentForeground: "#1C1C1C",
  destructive: "#DC2626",
  destructiveForeground: "#FFFFFF",
  border: "#E3E3E3",
  input: "#EDEDED",
  inputHover: "#E1E1E1",
  inputFocus: "#C9C9C9",
  placeholder: "#808080",
  ring: "#1E86FC",
  switch: "#1780F3",
  sidebar: "#F5F5F5",
  sidebarForeground: "#1C1C1C",
  sidebarBorder: "#E4E4E4",
  sidebarAccent: "#E4E4E4",
  sidebarAccentForeground: "#1C1C1C",
  sidebarHover: "#E9E9E9",
  sidebarMutedForeground: "rgba(28, 28, 28, 0.677)",
  chip: "rgba(0, 0, 0, 0.037)",
  chipBorder: "rgba(0, 0, 0, 0.08)",
  link: "#2563EB",
  faviconPlate: "#FFFFFF",
  success: "#228B3B",
  warning: "#B7791F",
  statusWorking: "#2563EB",
  unread: "#086ED3",
  overlay: "rgba(0, 0, 0, 0.5)",
  scrollbar: "#D4D4D4",
  popupScrollbar: "#7F7F7F",
  scrollbarHover: "#BDBDBD",
} as const satisfies ColorTokens;

/** Dark palette. Prefer `tokensForAppearance` when theme-aware. */
export const tokens = darkTokens;

export const RADIUS = "0.75rem";

export const botColors = [
  "#3EC5A8",
  "#F5A03C",
  "#6A6BF5",
  "#9B5CF6",
  "#3B82F6",
  "#F2622A",
  "#D9508A",
] as const;

export function isAppearancePreference(
  value: string | null | undefined,
): value is AppearancePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeAppearancePreference(
  raw: string | null | undefined,
): AppearancePreference {
  return isAppearancePreference(raw) ? raw : "system";
}

export type ResolveAppearancePreferenceOptions = {
  stored?: string | null;
  storage?: Pick<Storage, "getItem"> | null;
};

function getLocalStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function resolveAppearancePreference(
  options: ResolveAppearancePreferenceOptions = {},
): AppearancePreference {
  const stored =
    options.stored !== undefined
      ? options.stored
      : readStoredAppearance(options.storage ?? getLocalStorage());
  return normalizeAppearancePreference(stored);
}

export function persistAppearancePreference(
  preference: AppearancePreference,
  storage: Pick<Storage, "setItem"> | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(UI_APPEARANCE_STORAGE_KEY, preference);
  } catch {
    // Ignore quota / private-mode failures; in-memory preference still applies.
  }
}

export function resolveAppearance(
  preference: AppearancePreference,
  system: ResolvedAppearance = "dark",
): ResolvedAppearance {
  if (preference === "system") return system;
  return preference;
}

export function tokensForAppearance(appearance: ResolvedAppearance): ColorTokens {
  return appearance === "light" ? lightTokens : darkTokens;
}

function readStoredAppearance(storage: Pick<Storage, "getItem"> | null | undefined): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(UI_APPEARANCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** `cardForeground` -> `--card-foreground` */
export function cssVariableName(token: keyof ColorTokens): string {
  return `--${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function renderBlock(selector: string, colorScheme: ResolvedAppearance, palette: ColorTokens) {
  const lines = (Object.keys(palette) as (keyof ColorTokens)[]).map(
    (token) => `  ${cssVariableName(token)}: ${palette[token].toLowerCase()};`,
  );
  return `${selector} {\n  color-scheme: ${colorScheme};\n${lines.join("\n")}\n  --radius: ${RADIUS};\n}`;
}

/** The CSS in `tokens.css`. Generated from the TS palette so both stay in sync. */
export function renderTokensCss(): string {
  return `${[
    "/* Generated by `pnpm --filter @rakazo/ui-tokens generate`. Edit src/index.ts instead. */",
    renderBlock(':root,\n[data-theme="dark"]', "dark", darkTokens),
    renderBlock('[data-theme="light"]', "light", lightTokens),
  ].join("\n\n")}\n`;
}
