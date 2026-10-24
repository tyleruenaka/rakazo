import { isNeutralBotColor, resolvePersonaColorDef } from "@rakazo/core";
import { mobileBotAvatarPresentation } from "./bot-avatar";
import { mixWithBlack } from "./color";

/** Your bubbles in a one-on-one chat take the bot's color; white bots keep the neutral fill. */
export function userBubbleColor(bot: { id: string; color: string }): string | undefined {
  const accent = chatAccentColor(bot);
  return accent && bubbleShade(accent);
}

/** The bot's full color when it tints your bubbles; undefined when they stay neutral. */
export function chatAccentColor(bot: { id: string; color: string }): string | undefined {
  const avatar = mobileBotAvatarPresentation(bot.color);
  const color = resolvePersonaColorDef(
    bot.id,
    avatar.kind === "color" || avatar.kind === "shape" ? avatar.color : undefined,
  );
  // Yellow and bright custom colors (dark eyes) stay neutral here too.
  const neutral = isNeutralBotColor(color) || color.eyeColor !== "#FFFFFF";
  return neutral ? undefined : color.hex;
}

/** Your bubble's fill for a bot color, like web's color-mix(--bot-accent 83%, black). */
export function bubbleShade(accent: string): string {
  return mixWithBlack(accent, 0.83);
}
