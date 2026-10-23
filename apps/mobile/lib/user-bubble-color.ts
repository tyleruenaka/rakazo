import { isNeutralBotColor, resolvePersonaColorDef } from "@rakazo/core";
import { mobileBotAvatarPresentation } from "./bot-avatar";
import { mixWithBlack } from "./color";

/** Your bubbles in a one-on-one chat take the bot's color; white bots keep the neutral fill. */
export function userBubbleColor(bot: { id: string; color: string }): string | undefined {
  const avatar = mobileBotAvatarPresentation(bot.color);
  const color = resolvePersonaColorDef(
    bot.id,
    avatar.kind === "color" || avatar.kind === "shape" ? avatar.color : undefined,
  );
  // Yellow and bright custom colors (dark eyes) stay neutral here too.
  const neutral = isNeutralBotColor(color) || color.eyeColor !== "#FFFFFF";
  return neutral ? undefined : mixWithBlack(color.hex, 0.83);
}
