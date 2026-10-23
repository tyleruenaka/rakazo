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
  /** Mobile settings sheet: page, grouped cell, the cell's border and dividers, section label, disclosure chevron and switch track. */
  sheetPage: string;
  sheetCell: string;
  sheetBorder: string;
  sheetLabel: string;
  sheetChevron: string;
  sheetSwitch: string;
  /** Mobile Connect apps sheet: page and search field. */
  catalogPage: string;
  catalogField: string;
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
  /** Round control fill on hover, or while its toggle is on (call bar settings, transcript, mute). */
  controlActive: string;
  /** Icon in a round outlined header button, a step softer than text. */
  controlIcon: string;
  /** Fill and hairline where native Liquid Glass is unavailable (Android, iOS before 26). */
  glassFill: string;
  glassStroke: string;
  primary: string;
  primaryForeground: string;
  /** Disabled filled button. */
  primaryDisabled: string;
  primaryDisabledForeground: string;
  secondary: string;
  secondaryForeground: string;
  chatUser: string;
  /** White in both themes: the user bubble is a solid fill (light grey in dark, near-black in light). */
  chatUserForeground: string;
  /** Bot message bubble on mobile. */
  chatBot: string;
  /** Your reaction chip under a message on mobile. */
  chatReaction: string;
  /** Centered time between messages on mobile. */
  chatTimestamp: string;
  /** Mobile bottom sheet behind grouped rows (message actions). */
  sheet: string;
  /** Composer placeholder. */
  chatPlaceholder: string;
  /** Icon in the composer's round buttons (attach, mic). */
  composerIcon: string;
  /** Hairline around the composer's round buttons. */
  composerControlBorder: string;
  /** Hairline around the floating chat name pill. */
  pillBorder: string;
  /** Hairline between the chat and the bot panel. */
  panelBorder: string;
  /** Hovered row inside a card (routines in the bot panel). */
  cardHover: string;
  /** Chip behind an inline-editable bot name or label on hover. */
  inlineEditHover: string;
  /** Computer preview card while it shows no screen. */
  preview: string;
  previewBorder: string;
  /** Bot glyph in the computer preview while waking, and its asleep shade. */
  previewGlyph: string;
  previewGlyphAsleep: string;
  /** Resting color of the waking label before the shimmer sweeps it. */
  previewWaking: string;
  /** Captions and empty-state text in the bot panel. */
  caption: string;
  /** Behind the full-window computer screen. Dark in both themes. */
  computerBackdrop: string;
  /** Behind the live screen on the phone's computer page. Black in both themes. */
  computerPage: string;
  /** Mobile list pages built from inset cards (Library, Routines): page, card and row divider. */
  groupedBackground: string;
  groupedCard: string;
  groupedDivider: string;
  /** Close button on the computer backdrop, and its hover. */
  computerIcon: string;
  computerIconHover: string;
  /** Ring just outside a card in the transcript. */
  cardRing: string;
  /** Attached file card in the composer and the transcript, and its translucent ring. */
  attachment: string;
  attachmentRing: string;
  /** Hairline inside an attached image tile. */
  attachmentBorder: string;
  /** Page-shaped file type icon on an attachment card: fill, hairline and glyph. */
  fileIcon: string;
  fileIconBorder: string;
  fileIconGlyph: string;
  /** Band along the bottom of the PDF and spreadsheet file icons. */
  filePdf: string;
  fileSheet: string;
  /** Play disc over an attached video's first frame. Dark in both themes. */
  mediaPlay: string;
  mediaPlayForeground: string;
  /** Inline code chip and code block fill in a chat message. */
  code: string;
  codeForeground: string;
  /** List bullets and numbers in a chat message. */
  markdownMarker: string;
  muted: string;
  mutedForeground: string;
  /** Tertiary text: placeholders, list markers, quote bars, timestamps. */
  faintForeground: string;
  accent: string;
  accentForeground: string;
  /** Destructive text and outlines. */
  destructive: string;
  /** Solid destructive fill (Hang up, a filled Delete); its text is `destructiveForeground`. */
  destructiveFill: string;
  destructiveForeground: string;
  /** End-call button in the call bar, and its hover (lighter in dark, darker in light, as in Grok). */
  callHangUp: string;
  callHangUpHover: string;
  /** Turns in the call transcript, which sits on the call bar's card. */
  callTurnUser: string;
  callTurnUserForeground: string;
  callTurnBot: string;
  /** A finished call in the chat: the card behind it when open, its rule, and the bot's turns. */
  callRecord: string;
  callRecordRule: string;
  callRecordBotTurn: string;
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
  /** Bot list drag: fill of the section or pin area a bot would land in, and of a nest target. */
  sidebarDrop: string;
  /** Bot list drag: the line where a bot lands, and the dashed edge of a nest target. */
  sidebarDropLine: string;
  /** Short line between groups in the collapsed bot rail. */
  railDivider: string;
  /** Line icons at the bottom of the collapsed bot rail. */
  railIcon: string;
  /** Hovered rail icon, and the circle or square behind it. */
  railIconHover: string;
  railHover: string;
  /** Translucent tag fill (role chip) that follows the row bg. */
  chip: string;
  chipBorder: string;
  /** Reply pills and quotes: translucent text, ring and hover fill that follow the fill behind them. */
  replyForeground: string;
  replyRing: string;
  replyHover: string;
  link: string;
  /** Backing behind a link's site icon. White in both themes so dark logos stay visible on any bubble. */
  faviconPlate: string;
  success: string;
  warning: string;
  statusWorking: string;
  /** Unread dot in the bot list. */
  unread: string;
  /** The Primary bot's star badge: fill, star, and its inset hairline. */
  primaryStar: string;
  primaryStarForeground: string;
  primaryStarRing: string;
  /** Mobile inbox (home) page behind the chat list. */
  inboxBackground: string;
  /** Bot avatar in the white swatch: white in dark, black in light, as in Grok. */
  avatarWhite: string;
  /** Bot avatar in the grey swatch, a step lighter in light mode. */
  avatarGrey: string;
  /** Pencil over a dimmed bot avatar on hover; the same in both themes. */
  avatarPencil: string;
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
  sheetPage: "#1E1E1E",
  sheetCell: "#2C2C2E",
  sheetBorder: "#363638",
  sheetLabel: "#5C5C5F",
  sheetChevron: "#828288",
  sheetSwitch: "#B5B5BD",
  catalogPage: "#141414",
  catalogField: "#181818",
  foreground: "#F5F5F5",
  card: "#1F1F1F",
  cardForeground: "#F5F5F5",
  cardBorder: "#2C2C2C",
  description: "#ACACAC",
  popover: "#1F1F1F",
  popoverForeground: "#F5F5F5",
  glassFill: "#2C2C2E",
  glassStroke: "#FCFCFC26",
  popoverBorder: "#353535",
  popoverAccent: "#2B2B2B",
  paletteHighlight: "#303030",
  control: "#282828",
  controlOpenBorder: "#303030",
  controlActive: "#303030",
  controlIcon: "#E0E0E0",
  primary: "#F5F5F5",
  primaryForeground: "#121212",
  primaryDisabled: "#3B3B3B",
  primaryDisabledForeground: "#737373",
  secondary: "#282828",
  secondaryForeground: "#F5F5F5",
  chatUser: "#3B3B3B",
  chatUserForeground: "#F5F5F5",
  chatBot: "#202020",
  chatReaction: "#124070",
  chatTimestamp: "#555558",
  sheet: "#141414",
  chatPlaceholder: "#707070",
  composerIcon: "#979797",
  composerControlBorder: "#333333",
  pillBorder: "#262626",
  panelBorder: "#1F1F1F",
  cardHover: "#272727",
  inlineEditHover: "#242424",
  preview: "#1F1F1F",
  previewBorder: "#2B2B2B",
  previewGlyph: "#939393",
  previewGlyphAsleep: "#828282",
  previewWaking: "#747474",
  caption: "#8D8D8D",
  computerBackdrop: "#141414",
  computerPage: "#000000",
  computerIcon: "#DCDCDC",
  computerIconHover: "#FFFFFF",
  groupedBackground: "#1E1E1E",
  groupedCard: "#2A2929",
  groupedDivider: "#3A3939",
  cardRing: "#1B1B1B",
  attachment: "#252525",
  attachmentRing: "rgba(255, 255, 255, 0.12)",
  attachmentBorder: "#353535",
  fileIcon: "#343434",
  fileIconBorder: "#464646",
  fileIconGlyph: "#626262",
  filePdf: "#E84447",
  fileSheet: "#5AC078",
  mediaPlay: "rgba(18, 18, 18, 0.85)",
  mediaPlayForeground: "#F5F5F5",
  code: "#202020",
  codeForeground: "#ADADAD",
  markdownMarker: "#919191",
  muted: "#1B1B1B",
  mutedForeground: "#A8A8A8",
  faintForeground: "#939393",
  accent: "#242424",
  accentForeground: "#F5F5F5",
  destructive: "#FF6464",
  destructiveFill: "#E5484D",
  destructiveForeground: "#FFFFFF",
  callHangUp: "#CF2B35",
  callHangUpHover: "#FE3640",
  callTurnUser: "#454545",
  callTurnUserForeground: "#F5F5F5",
  callTurnBot: "#282828",
  callRecord: "#171717",
  callRecordRule: "#242424",
  callRecordBotTurn: "#202020",
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
  sidebarDrop: "rgba(255, 255, 255, 0.032)",
  sidebarDropLine: "rgba(245, 245, 245, 0.24)",
  railDivider: "#262626",
  railIcon: "#A2A2A2",
  railIconHover: "#DFDFDF",
  railHover: "#171717",
  chip: "rgba(255, 255, 255, 0.02)",
  chipBorder: "rgba(255, 255, 255, 0.054)",
  replyForeground: "rgba(245, 245, 245, 0.66)",
  replyRing: "rgba(255, 255, 255, 0.1)",
  replyHover: "rgba(255, 255, 255, 0.038)",
  link: "#3D84F7",
  faviconPlate: "#FFFFFF",
  success: "#4ECB71",
  warning: "#E9C46A",
  statusWorking: "#3D84F7",
  unread: "#4D9BFF",
  primaryStar: "#E9993A",
  primaryStarForeground: "#F5F5F5",
  primaryStarRing: "rgba(245, 245, 245, 0.06)",
  inboxBackground: "#141414",
  avatarWhite: "#FFFFFF",
  avatarGrey: "#777777",
  avatarPencil: "#F5F5F5",
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
  sheetPage: "#F2F2F7",
  sheetCell: "#FFFFFF",
  sheetBorder: "#E5E5EA",
  sheetLabel: "#8A8A8E",
  sheetChevron: "#BABABF",
  sheetSwitch: "#AEAEB2",
  catalogPage: "#F2F2F7",
  catalogField: "#FFFFFF",
  foreground: "#1C1C1C",
  card: "#FFFFFF",
  cardForeground: "#1C1C1C",
  cardBorder: "#EDEDED",
  description: "#767676",
  popover: "#FFFFFF",
  popoverForeground: "#1C1C1C",
  glassFill: "#FFFFFF",
  glassStroke: "#14141416",
  popoverBorder: "#E3E3E3",
  popoverAccent: "#F2F2F2",
  paletteHighlight: "#EDEDED",
  control: "#F2F2F2",
  controlOpenBorder: "#E6E6E6",
  controlActive: "#E8E8E8",
  controlIcon: "#2E2E2E",
  primary: "#1C1C1C",
  primaryForeground: "#FCFCFC",
  primaryDisabled: "#DDDDDD",
  primaryDisabledForeground: "#A3A3A3",
  secondary: "#EFEFEF",
  secondaryForeground: "#1C1C1C",
  chatUser: "#1C1C1C",
  chatUserForeground: "#FFFFFF",
  chatBot: "#EFEFEF",
  chatReaction: "#D3E5FA",
  chatTimestamp: "#808080",
  sheet: "#F2F2F2",
  chatPlaceholder: "#A4A4A4",
  composerIcon: "#7A7A7A",
  composerControlBorder: "#E1E1E1",
  pillBorder: "#E9E9E9",
  panelBorder: "#EAEAEA",
  cardHover: "#F2F2F2",
  inlineEditHover: "#E5E5E5",
  preview: "#F2F2F2",
  previewBorder: "#E0E0E0",
  previewGlyph: "#7A7A7A",
  previewGlyphAsleep: "#878787",
  previewWaking: "#9C9C9C",
  caption: "#7F7F7F",
  computerBackdrop: "#141414",
  computerPage: "#000000",
  computerIcon: "#DCDCDC",
  computerIconHover: "#FFFFFF",
  groupedBackground: "#F4F4F4",
  groupedCard: "#FFFFFF",
  groupedDivider: "#E5E5E5",
  cardRing: "#EDEDED",
  attachment: "#FFFFFF",
  attachmentRing: "rgba(28, 28, 28, 0.08)",
  attachmentBorder: "#E3E3E3",
  fileIcon: "#FFFFFF",
  fileIconBorder: "#DEDEDE",
  fileIconGlyph: "#D6D6D6",
  filePdf: "#E74347",
  fileSheet: "#5AC078",
  mediaPlay: "rgba(18, 18, 18, 0.85)",
  mediaPlayForeground: "#F5F5F5",
  code: "#E7E7E7",
  codeForeground: "#5D5D5D",
  markdownMarker: "#797979",
  muted: "#EFEFEF",
  mutedForeground: "#646464",
  faintForeground: "#808080",
  accent: "#E9E9E9",
  accentForeground: "#1C1C1C",
  destructive: "#DC2626",
  destructiveFill: "#E5484D",
  destructiveForeground: "#FFFFFF",
  callHangUp: "#E72E3B",
  callHangUpHover: "#C82532",
  callTurnUser: "#1C1C1C",
  callTurnUserForeground: "#FFFFFF",
  callTurnBot: "#F1F1F1",
  callRecord: "#F3F3F3",
  callRecordRule: "#E2E2E2",
  callRecordBotTurn: "#E6E6E6",
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
  sidebarDrop: "rgba(28, 28, 28, 0.06)",
  sidebarDropLine: "rgba(28, 28, 28, 0.24)",
  railDivider: "#DADADA",
  railIcon: "#666666",
  railIconHover: "#2C2C2C",
  railHover: "#E8E8E8",
  chip: "rgba(0, 0, 0, 0.037)",
  chipBorder: "rgba(0, 0, 0, 0.08)",
  replyForeground: "rgba(28, 28, 28, 0.68)",
  replyRing: "rgba(28, 28, 28, 0.125)",
  replyHover: "rgba(28, 28, 28, 0.059)",
  link: "#2563EB",
  faviconPlate: "#FFFFFF",
  success: "#208437",
  warning: "#B7791F",
  statusWorking: "#2563EB",
  unread: "#086ED3",
  primaryStar: "#F59312",
  primaryStarForeground: "#FFFFFF",
  primaryStarRing: "rgba(28, 28, 28, 0.06)",
  inboxBackground: "#FCFCFC",
  avatarWhite: "#000000",
  avatarGrey: "#959595",
  avatarPencil: "#F5F5F5",
  overlay: "rgba(0, 0, 0, 0.5)",
  scrollbar: "#D4D4D4",
  popupScrollbar: "#7F7F7F",
  scrollbarHover: "#BDBDBD",
} as const satisfies ColorTokens;

/** Dark palette. Prefer `tokensForAppearance` when theme-aware. */
export const tokens = darkTokens;

export const RADIUS = "0.75rem";

export const fontWeight = { regular: "400", medium: "500", semibold: "600" } as const;

/**
 * Native text styles on the system font, in points: iOS body text is 17/22. Titles use the
 * font's own line spacing, written out so they don't inherit a smaller body line height.
 */
export const typeScale = {
  title: { fontSize: 22, lineHeight: 26, fontWeight: fontWeight.semibold },
  headline: { fontSize: 19, lineHeight: 23, fontWeight: fontWeight.semibold },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.medium },
  body: { fontSize: 17, lineHeight: 22 },
  secondary: { fontSize: 15, lineHeight: 19 },
  caption: { fontSize: 14, lineHeight: 18 },
  footnote: { fontSize: 12, lineHeight: 16 },
} as const;

/**
 * Text grows with the iOS text size until body text reaches 23pt, the xxxLarge size. Larger
 * accessibility sizes keep that size, so message bubbles, rows and cards keep their layout.
 */
export const MAX_FONT_SCALE = 23 / typeScale.body.fontSize;

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
