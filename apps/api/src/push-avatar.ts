import { openPushAvatarToken, PUSH_AVATAR_PATH, renderPushAvatarPng } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { type PrismaClient, runAsTenant } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { Hono } from "hono";

/**
 * Serves the bot picture an iOS notification shows. The phone's notification service has no
 * session, so the signed, short-lived `token` from the push is the only credential; it opens one
 * bot's picture for the user it was sent to, while they are still in that space.
 */
export function mountPushAvatarRoute(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    encryptionKey: string;
    /** The user's actor in the space, or null once they are no longer a member. */
    member: (userId: string, spaceId: string) => Promise<Actor | null>;
  },
) {
  app.get(PUSH_AVATAR_PATH, async (c) => {
    const claims = openPushAvatarToken(c.req.query("token") ?? "", deps.encryptionKey);
    if (!claims) return c.body(null, 404);
    const actor = await deps.member(claims.userId, claims.spaceId);
    if (!actor) return c.body(null, 404);
    const found = await runAsTenant(actor, async () => ({
      bot: await deps.prisma.bot.findFirst({
        where: { id: claims.botId, spaceId: actor.spaceId, archivedAt: null },
        select: { id: true, color: true },
      }),
      user: await deps.prisma.user.findUnique({
        where: { id: actor.userId },
        select: { avatarStyle: true },
      }),
    }));
    if (!found.bot) return c.body(null, 404);
    try {
      const png = await renderPushAvatarPng({
        color: found.bot.color,
        botId: found.bot.id,
        avatarStyle: found.user?.avatarStyle ?? "organic",
      });
      return new Response(new Uint8Array(png), {
        headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" },
      });
    } catch (error) {
      getLogger().error("push avatar render", error);
      return c.body(null, 500);
    }
  });
}
