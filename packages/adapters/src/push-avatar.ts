import { createHmac, timingSafeEqual } from "node:crypto";
import { parseBotAvatarValue } from "@rakazo/contracts";
import {
  avatarIdentitySeed,
  organicAvatarPath,
  resolvePersonaColorDef,
  SHIPPED_BOT_AVATAR_CENTER,
  SHIPPED_BOT_AVATAR_VIEWBOX,
  shippedBotAvatarShapePath,
} from "@rakazo/core";

/**
 * A push that shows its bot's picture carries a link to it. iOS fetches the picture as the push
 * arrives, which can be days later for a phone that was off, so the link lasts a week. It opens
 * one bot's picture for one user, and only while that user is still in the space.
 */
export const PUSH_AVATAR_TTL_MS = 7 * 24 * 60 * 60_000;
export const PUSH_AVATAR_PATH = "/api/push-avatar";
export const PUSH_AVATAR_SIZE = 256;

/** Where the API answers and the key both API and worker hold (ENCRYPTION_KEY). */
export type PushAvatarLinks = { origin: string; encryptionKey: string };
export type PushAvatarClaims = { botId: string; spaceId: string; userId: string };

function signingKey(encryptionKey: string) {
  return createHmac("sha256", encryptionKey).update("rakazo:push-avatar:v1").digest();
}

function sign(payload: string, encryptionKey: string) {
  return createHmac("sha256", signingKey(encryptionKey)).update(payload).digest("base64url");
}

/** The picture link for a push, or undefined when phones could not fetch it (no HTTPS origin). */
export function pushAvatarUrl(
  links: PushAvatarLinks,
  claims: PushAvatarClaims,
  now = Date.now(),
): string | undefined {
  let url: URL;
  try {
    url = new URL(PUSH_AVATAR_PATH, links.origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const payload = Buffer.from(
    JSON.stringify({
      b: claims.botId,
      s: claims.spaceId,
      u: claims.userId,
      e: now + PUSH_AVATAR_TTL_MS,
    }),
  ).toString("base64url");
  // `token=` keeps it out of the access log: the shipped Caddyfile redacts that parameter.
  url.searchParams.set("token", `${payload}.${sign(payload, links.encryptionKey)}`);
  return url.toString();
}

/** The claims of a link this server signed, or null when it is forged, malformed or expired. */
export function openPushAvatarToken(
  token: string,
  encryptionKey: string,
  now = Date.now(),
): PushAvatarClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, encryptionKey));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { b, s, u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof b !== "string" || typeof s !== "string" || typeof u !== "string") return null;
    if (typeof e !== "number" || e <= now) return null;
    return { botId: b, spaceId: s, userId: u };
  } catch {
    return null;
  }
}

/**
 * The bot's picture as a square PNG for a notification: an uploaded photo as is, otherwise the
 * bot's shape (or the organic blob or robot face, per the user's avatar style) in its color on a
 * dark tile tinted with that color. iOS crops it to a circle.
 */
export async function renderPushAvatarPng(input: {
  color: string;
  botId: string;
  avatarStyle: string;
}): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const parsed = parseBotAvatarValue(input.color);
  if (parsed.kind === "image" && parsed.imageUrl) {
    const bytes = Buffer.from(parsed.imageUrl.slice(parsed.imageUrl.indexOf(",") + 1), "base64");
    return sharp(bytes)
      .resize(PUSH_AVATAR_SIZE, PUSH_AVATAR_SIZE, { fit: "cover" })
      .png()
      .toBuffer();
  }
  return sharp(Buffer.from(pushAvatarSvg(input)))
    .png()
    .toBuffer();
}

const TILE = "#141414";

/** SVG of a drawn avatar; exported for tests. Mirrors the web app's flat bot glyph. */
export function pushAvatarSvg(input: { color: string; botId: string; avatarStyle: string }) {
  const parsed = parseBotAvatarValue(input.color);
  const raw = parsed.kind === "shape" || parsed.kind === "color" ? parsed.color : undefined;
  const fill = resolvePersonaColorDef(input.botId, raw).hex;
  const tile = mix(TILE, fill, 0.22);
  const size = PUSH_AVATAR_SIZE;
  const inner = Math.round(size * 0.7);
  const offset = (size - inner) / 2;
  let art: string;
  if (parsed.kind === "shape" || input.avatarStyle === "organic") {
    // Same frames as BotGlyph in ui-web: a shape or the organic blob, two eyes cut out.
    const frame =
      parsed.kind === "shape"
        ? {
            viewBox: SHIPPED_BOT_AVATAR_VIEWBOX,
            x: SHIPPED_BOT_AVATAR_CENTER,
            y: SHIPPED_BOT_AVATAR_CENTER - 8,
            dx: 29,
            unit: 2.16,
            path: shippedBotAvatarShapePath(parsed.shapeIndex),
          }
        : {
            viewBox: "-60 -60 120 120",
            x: 0,
            y: 0,
            dx: 12,
            unit: 1,
            path: organicAvatarPath(avatarIdentitySeed(input.botId || raw || "agent")),
          };
    const w = 12 * frame.unit;
    const h = 26 * frame.unit;
    const eyes = [-1, 1]
      .map(
        (side) =>
          `<rect x="${frame.x + side * frame.dx - w / 2}" y="${frame.y - h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="${tile}"/>`,
      )
      .join("");
    art = `<svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="${frame.viewBox}" overflow="visible"><path d="${frame.path}" fill="${fill}"/>${eyes}</svg>`;
  } else {
    // The robot face the phone app draws: a dark visor with two white eyes on the bot's color.
    const visorW = size * 0.68 * 0.8;
    const visorH = size * 0.44 * 0.8;
    const eyeW = size * 0.11 * 0.8;
    const eyeH = size * 0.17 * 0.8;
    const gap = size * 0.11 * 0.8;
    const c = size / 2;
    art =
      `<circle cx="${c}" cy="${c}" r="${size * 0.4}" fill="${fill}"/>` +
      `<rect x="${c - visorW / 2}" y="${c - visorH / 2}" width="${visorW}" height="${visorH}" rx="${visorH * 0.52}" fill="#0C0C0E"/>` +
      [-1, 1]
        .map(
          (side) =>
            `<rect x="${c + (side * (gap + eyeW)) / 2 - eyeW / 2}" y="${c - eyeH / 2}" width="${eyeW}" height="${eyeH}" rx="${eyeW * 0.6}" fill="#FFFFFF"/>`,
        )
        .join("");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${tile}"/>${art}</svg>`;
}

/** `base` with `amount` of `color` over it, as #rrggbb. */
function mix(base: string, color: string, amount: number) {
  const channels = (hex: string) => {
    const full = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, "$&$&") : hex;
    return [1, 3, 5].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
  };
  const a = channels(base);
  const b = channels(color);
  return `#${a
    .map((value, i) => Math.round(value + ((b[i] ?? value) - value) * amount))
    .map((value) => (Number.isFinite(value) ? value : 0).toString(16).padStart(2, "0"))
    .join("")}`;
}
