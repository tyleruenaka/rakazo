import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { provisionMessagingIdentity } from "./messaging.js";
import { createRepos } from "./repos.js";
import { runAsSystem, runAsTenant } from "./row-security.js";
import { BotParentError, IsolationError } from "./scope.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("setBotPrimary (PostgreSQL)", () => {
  const provider = "sendblue";
  const addresses = ["+15550006661", "+15550006662"];
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let owners: Array<{ userId: string; spaceId: string; botId: string }>;

  const actorOf = (owner: { userId: string; spaceId: string }) => ({
    userId: owner.userId,
    spaceId: owner.spaceId,
    email: "primary@example.com",
    isDeploymentOwner: false,
  });
  const create = (owner: { userId: string; spaceId: string }, name: string) =>
    createRepos(prisma).createBot(actorOf(owner), {
      name,
      title: "",
      description: "",
      instructions: "",
      notifyOnFinish: true,
    });
  const read = (id: string) => prisma.bot.findUniqueOrThrow({ where: { id } });
  const primaries = (owner: { userId: string; spaceId: string }) =>
    prisma.bot.findMany({
      where: { userId: owner.userId, spaceId: owner.spaceId, primary: true },
      select: { id: true },
    });

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    owners = await runAsSystem("test fixture", async () => {
      const provisioned = [];
      for (const address of addresses) {
        provisioned.push(
          await provisionMessagingIdentity(
            prisma,
            { provider, address },
            { signupsEnabled: undefined, signupAllowlist: undefined },
          ),
        );
      }
      return provisioned;
    });
  });

  afterAll(async () => {
    if (owners) {
      await runAsSystem("test fixture cleanup", async () => {
        await prisma.messagingIdentity.deleteMany({
          where: { provider, address: { in: addresses } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: owners.map((owner) => owner.spaceId) } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: owners.map((owner) => owner.userId) } },
        });
      });
    }
    await close?.();
  });

  it("moves the star, turns management on, and tells both chats", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const first = await create(owners[0]!, "First");
      const second = await create(owners[0]!, "Second");
      await prisma.bot.update({ where: { id: second.id }, data: { fleetManagement: false } });

      expect(await repos.setBotPrimary(actor, first.id)).toHaveLength(1);
      const moved = await repos.setBotPrimary(actor, second.id);
      expect(moved.map((event) => event.threadId).sort()).toEqual(
        [first.threadId, second.threadId].sort(),
      );
      expect(await primaries(owners[0]!)).toEqual([{ id: second.id }]);
      expect((await read(second.id)).fleetManagement).toBe(true);
      expect(
        await prisma.event.count({ where: { threadId: first.threadId, type: "bot.updated" } }),
      ).toBe(2);
      // Already the Primary: nothing to write.
      expect(await repos.setBotPrimary(actor, second.id)).toEqual([]);
    }));

  it("keeps the Primary top level: making it un-nests, nesting it is refused", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const parent = await create(owners[0]!, "Parent");
      const child = await create(owners[0]!, "Child");
      const other = await create(owners[0]!, "Other");
      await repos.setBotParent(actor, child.id, parent.id);

      await repos.setBotPrimary(actor, child.id);
      expect(await read(child.id)).toMatchObject({ primary: true, parentBotId: null });
      await expect(repos.setBotParent(actor, child.id, other.id)).rejects.toBeInstanceOf(
        BotParentError,
      );
      // Other bots can still nest under the Primary.
      await repos.setBotParent(actor, other.id, child.id);
      expect((await read(other.id)).parentBotId).toBe(child.id);
    }));

  it("refuses archived bots and bots of another owner", async () => {
    const archived = await runAsTenant(owners[0]!, async () => {
      const bot = await create(owners[0]!, "Archived");
      await prisma.bot.update({ where: { id: bot.id }, data: { archivedAt: new Date() } });
      return bot;
    });
    const theirs = await runAsTenant(owners[1]!, () => create(owners[1]!, "Theirs"));
    await runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      await expect(repos.setBotPrimary(actor, archived.id)).rejects.toBeInstanceOf(IsolationError);
      await expect(repos.setBotPrimary(actor, theirs.id)).rejects.toBeInstanceOf(IsolationError);
    });
    await runAsTenant(owners[1]!, async () => {
      expect(await primaries(owners[1]!)).toEqual([]);
    });
  });

  it("leaves exactly one Primary when two switches race", async () => {
    const actor = actorOf(owners[1]!);
    for (let round = 0; round < 5; round += 1) {
      const [a, b] = await runAsTenant(owners[1]!, () =>
        Promise.all([create(owners[1]!, `A${round}`), create(owners[1]!, `B${round}`)]),
      );
      await Promise.all([
        runAsTenant(owners[1]!, () => createRepos(prisma).setBotPrimary(actor, a.id)),
        runAsTenant(owners[1]!, () => createRepos(prisma).setBotPrimary(actor, b.id)),
      ]);
      expect(await runAsTenant(owners[1]!, () => primaries(owners[1]!))).toHaveLength(1);
    }
  });

  it("does not deadlock when a Primary switch and a nest touch the same bots", async () => {
    const actor = actorOf(owners[1]!);
    for (let round = 0; round < 40; round += 1) {
      const [a, b] = await runAsTenant(owners[1]!, () =>
        Promise.all([create(owners[1]!, `Lock A${round}`), create(owners[1]!, `Lock B${round}`)]),
      );
      // Order the pair so the switch writes the higher id (the old Primary) first.
      const [low, high] = [a, b].sort((x, y) => (x.id < y.id ? -1 : 1));
      await runAsTenant(owners[1]!, () => createRepos(prisma).setBotPrimary(actor, high!.id));
      const results = await Promise.allSettled([
        runAsTenant(owners[1]!, () => createRepos(prisma).setBotPrimary(actor, low!.id)),
        // Stagger the nest across the switch's round trips to hit the window between its writes.
        new Promise((resolve) => setTimeout(resolve, round % 10)).then(() =>
          runAsTenant(owners[1]!, () => createRepos(prisma).setBotParent(actor, high!.id, low!.id)),
        ),
      ]);
      // The nest may lose to the switch (the Primary can't be nested), but never by deadlock.
      for (const result of results) {
        if (result.status === "rejected") expect(String(result.reason)).not.toMatch(/deadlock/i);
      }
    }
  });
});
