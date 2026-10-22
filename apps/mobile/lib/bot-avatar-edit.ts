import { BOT_COLORS, parseBotAvatarValue } from "@rakazo/contracts";
import { DEFAULT_BOT_AVATAR_COLOR } from "@rakazo/core";

/** The color a bot avatar value is drawn in; a photo falls back to the first palette color. */
export function avatarColor(value: string): string {
  const parsed = parseBotAvatarValue(value);
  return parsed.kind === "color" || parsed.kind === "shape" ? parsed.color : BOT_COLORS[0];
}

export function avatarShape(value: string): number | null {
  const parsed = parseBotAvatarValue(value);
  return parsed.kind === "shape" ? parsed.shapeIndex : null;
}

export function isAvatarPhoto(value: string): boolean {
  return parseBotAvatarValue(value).kind === "image";
}

/** Keeps a chosen shape when the color changes; a photo is replaced by the color. */
export function withAvatarColor(value: string, color: string): string {
  const shape = avatarShape(value);
  return shape === null ? color : `${color}::shape_${shape}`;
}

export function withAvatarShape(value: string, shape: number): string {
  return `${avatarColor(value)}::shape_${shape}`;
}

/** Reset keeps the color and drops a shape or photo; a photo goes back to the default color. */
export function defaultAvatarValue(value: string): string {
  const parsed = parseBotAvatarValue(value);
  return parsed.kind === "color" || parsed.kind === "shape"
    ? parsed.color
    : DEFAULT_BOT_AVATAR_COLOR;
}

/** Switches on a bot's pages take its color, a quarter darker so the white knob stands out. */
export function botSwitchTint(value: string): string {
  const hex = avatarColor(value).replace("#", "");
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  const channels = [0, 2, 4].map((start) =>
    Math.round(Number.parseInt(full.slice(start, start + 2), 16) * 0.76)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}
