import { pushAvatarUrl } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountPushAvatarRoute } from "./push-avatar.js";

const encryptionKey = "test-encryption-key-test-encryption-key";
const links = { origin: "https://rakazo.example", encryptionKey };

function server(options: { member?: boolean; bot?: { id: string; color: string } | null } = {}) {
  const lookups: unknown[] = [];
  const prisma = {
    bot: {
      findFirst: async (query: unknown) => {
        lookups.push(query);
        return options.bot === undefined ? { id: "bot-1", color: "#8B5CF6::shape_2" } : options.bot;
      },
    },
    user: { findUnique: async () => ({ avatarStyle: "organic" }) },
  } as unknown as PrismaClient;
  const app = new Hono();
  mountPushAvatarRoute(app, {
    prisma,
    encryptionKey,
    member: async (userId, spaceId) =>
      options.member === false ? null : ({ userId, spaceId, role: "owner" } as unknown as Actor),
  });
  return { app, lookups };
}

function path(url: string | undefined) {
  const parsed = new URL(url ?? "");
  return parsed.pathname + parsed.search;
}

describe("push avatar route", () => {
  const link = pushAvatarUrl(links, { botId: "bot-1", spaceId: "space-1", userId: "user-1" });

  it("serves the bot's picture to a link the server signed", async () => {
    const { app, lookups } = server();
    const response = await app.request(path(link));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(lookups).toEqual([
      {
        where: { id: "bot-1", spaceId: "space-1", archivedAt: null },
        select: { id: true, color: true },
      },
    ]);
  });

  it("answers 404 to forged, edited and missing links", async () => {
    const { app, lookups } = server();
    const other = pushAvatarUrl(
      { ...links, encryptionKey: "another-key-another-key-another-key" },
      { botId: "bot-1", spaceId: "space-1", userId: "user-1" },
    );
    for (const url of [path(other), "/api/push-avatar", "/api/push-avatar?token=x.y"]) {
      expect((await app.request(url)).status).toBe(404);
    }
    expect(lookups).toEqual([]);
  });

  it("answers 404 once the user left the space or the bot is gone", async () => {
    expect((await server({ member: false }).app.request(path(link))).status).toBe(404);
    expect((await server({ bot: null }).app.request(path(link))).status).toBe(404);
  });
});
