import type { PrismaClient } from "@rakazo/db";
import {
  createDb,
  createRepos,
  provisionMessagingIdentity,
  runAsSystem,
  runAsTenant,
} from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { managedBotsWhere } from "./child-bots.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("managedBotsWhere (PostgreSQL)", () => {
  const provider = "sendblue";
  const address = "+15550007771";
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let owner: { userId: string; spaceId: string; botId: string };

  const actor = () => ({
    userId: owner.userId,
    spaceId: owner.spaceId,
    email: "managed@example.com",
    isDeploymentOwner: false,
  });
  const create = (name: string) =>
    createRepos(prisma).createBot(actor(), {
      name,
      title: "",
      description: "",
      instructions: "",
      notifyOnFinish: true,
    });
  const managedBy = async (botId: string) => {
    const bots = await prisma.bot.findMany({
      where: await managedBotsWhere(prisma, { ...owner, botId }),
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return bots.map((bot) => bot.name);
  };

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    owner = await runAsSystem("test fixture", () =>
      provisionMessagingIdentity(
        prisma,
        { provider, address },
        { signupsEnabled: undefined, signupAllowlist: undefined },
      ),
    );
  });

  afterAll(async () => {
    if (owner) {
      await runAsSystem("test fixture cleanup", async () => {
        await prisma.messagingIdentity.deleteMany({ where: { provider, address } });
        await prisma.organization.deleteMany({ where: { id: owner.spaceId } });
        await prisma.user.deleteMany({ where: { id: owner.userId } });
      });
    }
    await close?.();
  });

  it("gives the Primary every other bot, nested ones and later ones too; others keep their nested bots", () =>
    runAsTenant(owner, async () => {
      const repos = createRepos(prisma);
      const primary = await create("Primary");
      const ezra = await create("Ezra");
      const otto = await create("Otto");
      await repos.setBotParent(actor(), otto.id, ezra.id);
      await repos.setBotPrimary(actor(), primary.id);
      const later = await create("Later");

      const everyone = (await prisma.bot.findMany({ where: { id: { not: primary.id } } }))
        .filter((bot) => bot.userId === owner.userId)
        .map((bot) => bot.name)
        .sort();
      expect(await managedBy(primary.id)).toEqual(everyone);
      expect(everyone).toEqual(expect.arrayContaining(["Ezra", "Otto", "Later"]));
      expect(await managedBy(ezra.id)).toEqual(["Otto"]);
      expect(await managedBy(later.id)).toEqual([]);

      // Moving the star moves the reach with it.
      await repos.setBotPrimary(actor(), later.id);
      expect(await managedBy(primary.id)).toEqual([]);
      expect(await managedBy(later.id)).toContain("Primary");
    }));
});
