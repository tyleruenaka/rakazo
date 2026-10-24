import { describe, expect, it } from "vitest";
import {
  openPushAvatarToken,
  PUSH_AVATAR_TTL_MS,
  pushAvatarSvg,
  pushAvatarUrl,
  renderPushAvatarPng,
} from "./push-avatar.js";

const KEY = "test-encryption-key-test-encryption-key";
const LINKS = { origin: "https://rakazo.example", encryptionKey: KEY };
const CLAIMS = { botId: "bot-1", spaceId: "space-1", userId: "user-1" };

function tokenOf(url: string) {
  return new URL(url).searchParams.get("token") ?? "";
}

describe("push avatar links", () => {
  it("opens a link this server signed until it expires", () => {
    const now = 1_000_000;
    const url = pushAvatarUrl(LINKS, CLAIMS, now);
    expect(url).toMatch(/^https:\/\/rakazo\.example\/api\/push-avatar\?token=/);
    const token = tokenOf(url!);
    expect(openPushAvatarToken(token, KEY, now + 1)).toEqual(CLAIMS);
    expect(openPushAvatarToken(token, KEY, now + PUSH_AVATAR_TTL_MS)).toBeNull();
  });

  it("rejects a link signed with another key, edited claims or junk", () => {
    const token = tokenOf(pushAvatarUrl(LINKS, CLAIMS)!);
    expect(openPushAvatarToken(token, "another-key-another-key-another-key")).toBeNull();
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ b: "bot-2", s: "space-1", u: "user-1", e: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(openPushAvatarToken(`${forged}.${signature}`, KEY)).toBeNull();
    for (const junk of ["", ".", "a.b", `${token}.extra`, "not a token"]) {
      expect(openPushAvatarToken(junk, KEY)).toBeNull();
    }
  });

  it("makes no link when phones could not fetch it over HTTPS", () => {
    expect(pushAvatarUrl({ ...LINKS, origin: "http://127.0.0.1:3100" }, CLAIMS)).toBeUndefined();
    expect(pushAvatarUrl({ ...LINKS, origin: "" }, CLAIMS)).toBeUndefined();
  });
});

describe("push avatar picture", () => {
  it("draws a picked shape in the bot's color with eyes", () => {
    const svg = pushAvatarSvg({ color: "#8B5CF6::shape_3", botId: "bot-1", avatarStyle: "robot" });
    expect(svg).toContain('fill="#8B5CF6"');
    expect(svg).toContain('viewBox="-15 -15 259 259"');
    expect(svg.match(/<rect /g)).toHaveLength(3);
  });

  it("follows the user's avatar style when the bot has only a color", () => {
    const organic = pushAvatarSvg({ color: "#22C55E", botId: "bot-1", avatarStyle: "organic" });
    const robot = pushAvatarSvg({ color: "#22C55E", botId: "bot-1", avatarStyle: "robot" });
    expect(organic).toContain('viewBox="-60 -60 120 120"');
    expect(robot).toContain('fill="#0C0C0E"');
    expect(robot).not.toContain("-60 -60 120 120");
  });

  it("renders PNGs for drawn and uploaded avatars", async () => {
    const drawn = await renderPushAvatarPng({
      color: "#F97316",
      botId: "b",
      avatarStyle: "organic",
    });
    expect(drawn.subarray(1, 4).toString()).toBe("PNG");
    const { default: sharp } = await import("sharp");
    const photo = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#123456" },
    })
      .webp()
      .toBuffer();
    const uploaded = await renderPushAvatarPng({
      color: `data:image/webp;base64,${photo.toString("base64")}`,
      botId: "b",
      avatarStyle: "organic",
    });
    const meta = await sharp(uploaded).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 256, 256]);
  });
});
