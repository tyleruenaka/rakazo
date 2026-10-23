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

describePostgres("setBotParent (PostgreSQL)", () => {
  const provider = "sendblue";
  const addresses = ["+15550005551", "+15550005552"];
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let owners: Array<{ userId: string; spaceId: string; botId: string }>;

  const actorOf = (owner: { userId: string; spaceId: string }) => ({
    userId: owner.userId,
    spaceId: owner.spaceId,
    email: "nesting@example.com",
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

  it("nests under a pinned bot without pinning, and moving out keeps it unpinned", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const parent = await create(owners[0]!, "Parent");
      const child = await create(owners[0]!, "Child");
      const section = await repos.createBotSection(actor, { botId: parent.id, name: "Nesting" });
      await prisma.bot.update({ where: { id: parent.id }, data: { pinned: true } });

      // The child keeps its own section (none here); the sidebar lists it under an unpinned parent.
      await repos.setBotParent(actor, child.id, parent.id);
      expect((await read(parent.id)).sectionId).toBe(section.id);
      expect(await read(child.id)).toMatchObject({
        parentBotId: parent.id,
        sectionId: null,
        pinned: false,
      });

      await repos.setBotParent(actor, child.id, null);
      expect(await read(child.id)).toMatchObject({
        parentBotId: null,
        sectionId: null,
        pinned: false,
      });
    }));

  it("keeps the nested bot's own section when it is nested", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const parent = await create(owners[0]!, "Own parent");
      const child = await create(owners[0]!, "Own child");
      const parentSection = await repos.createBotSection(actor, {
        botId: parent.id,
        name: "Own parent section",
      });
      const childSection = await repos.createBotSection(actor, {
        botId: child.id,
        name: "Own child section",
      });
      expect(parentSection.id).not.toBe(childSection.id);

      await repos.setBotParent(actor, child.id, parent.id);
      expect(await read(child.id)).toMatchObject({
        parentBotId: parent.id,
        sectionId: childSection.id,
      });
    }));

  it("moving out keeps the bot where it was listed: an unpinned parent's section", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const parent = await create(owners[0]!, "Out parent");
      const child = await create(owners[0]!, "Out child");
      const parentSection = await repos.createBotSection(actor, {
        botId: parent.id,
        name: "Out parent section",
      });
      const childSection = await repos.createBotSection(actor, {
        botId: child.id,
        name: "Out child section",
      });

      // Unpinned parent: the child listed in the parent's section, so it stays there.
      await repos.setBotParent(actor, child.id, parent.id);
      await repos.setBotParent(actor, child.id, null);
      expect(await read(child.id)).toMatchObject({
        parentBotId: null,
        sectionId: parentSection.id,
        pinned: false,
      });

      // Pinned parent: the child listed in its own section, so it keeps that one.
      await repos.setBotSection(actor, child.id, childSection.id);
      await prisma.bot.update({ where: { id: parent.id }, data: { pinned: true } });
      await repos.setBotParent(actor, child.id, parent.id);
      await repos.setBotParent(actor, child.id, null);
      expect(await read(child.id)).toMatchObject({
        parentBotId: null,
        sectionId: childSection.id,
      });

      // A parent with no section: the child lands in unassigned with it.
      await prisma.bot.update({
        where: { id: parent.id },
        data: { pinned: false, sectionId: null },
      });
      await repos.setBotParent(actor, child.id, parent.id);
      await repos.setBotParent(actor, child.id, null);
      expect((await read(child.id)).sectionId).toBeNull();
    }));

  it("moves an unpinned parent's nested bots with it, and leaves a pinned parent's alone", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const parent = await create(owners[0]!, "Mover");
      const first = await create(owners[0]!, "Mover child one");
      const second = await create(owners[0]!, "Mover child two");
      const bystander = await create(owners[0]!, "Mover bystander");
      const start = await repos.createBotSection(actor, { botId: first.id, name: "Mover start" });
      const sales = await repos.createBotSection(actor, {
        botId: bystander.id,
        name: "Mover sales",
      });
      const ops = await repos.createBotSection(actor, { botId: bystander.id, name: "Mover ops" });
      await repos.setBotParent(actor, first.id, parent.id);
      await repos.setBotParent(actor, second.id, parent.id);

      // Unpinned: every nested bot takes the parent's new section, including none.
      await repos.setBotSection(actor, parent.id, sales.id);
      for (const id of [parent.id, first.id, second.id]) {
        expect((await read(id)).sectionId).toBe(sales.id);
      }
      expect((await read(bystander.id)).sectionId).toBe(ops.id);
      await repos.setBotSection(actor, parent.id, null);
      for (const id of [parent.id, first.id, second.id]) {
        expect((await read(id)).sectionId).toBeNull();
      }

      // "New section" from the parent's menu moves them too.
      const fresh = await repos.createBotSection(actor, { botId: parent.id, name: "Mover new" });
      for (const id of [parent.id, first.id, second.id]) {
        expect((await read(id)).sectionId).toBe(fresh.id);
      }

      // Pinned: its nested bots list in their own sections, which stay.
      await repos.setBotSection(actor, first.id, start.id);
      await prisma.bot.update({ where: { id: parent.id }, data: { pinned: true } });
      await repos.setBotSection(actor, parent.id, ops.id);
      await repos.createBotSection(actor, { botId: parent.id, name: "Mover pinned new" });
      expect((await read(first.id)).sectionId).toBe(start.id);
      expect((await read(second.id)).sectionId).toBe(fresh.id);
    }));

  it("refuses a section move for another owner's bot or section", async () => {
    const theirs = await runAsTenant(owners[1]!, async () => {
      const bot = await create(owners[1]!, "Their mover");
      const section = await createRepos(prisma).createBotSection(actorOf(owners[1]!), {
        botId: bot.id,
        name: "Their section",
      });
      return { bot, section };
    });
    await runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const mine = await create(owners[0]!, "My mover");
      await expect(repos.setBotSection(actor, theirs.bot.id, null)).rejects.toBeInstanceOf(
        IsolationError,
      );
      await expect(repos.setBotSection(actor, mine.id, theirs.section.id)).rejects.toBeInstanceOf(
        IsolationError,
      );
      expect((await read(mine.id)).sectionId).toBeNull();
    });
  });

  it("unpins a pinned bot when it is nested, and clears a stale pin when it moves out", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const parent = await create(owners[0]!, "Parent two");
      const pinned = await create(owners[0]!, "Pinned");
      await prisma.bot.update({ where: { id: pinned.id }, data: { pinned: true } });
      await repos.setBotParent(actor, pinned.id, parent.id);
      expect((await read(pinned.id)).pinned).toBe(false);

      // Older data can hold a nested bot marked pinned; the sidebar shows it unpinned.
      await prisma.bot.update({ where: { id: pinned.id }, data: { pinned: true } });
      await repos.setBotParent(actor, pinned.id, null);
      expect((await read(pinned.id)).pinned).toBe(false);
    }));

  it("refuses itself, a nested parent, and a bot that has nested bots", () =>
    runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      const top = await create(owners[0]!, "Top");
      const middle = await create(owners[0]!, "Middle");
      const other = await create(owners[0]!, "Other");
      await repos.setBotParent(actor, middle.id, top.id);

      await expect(repos.setBotParent(actor, top.id, top.id)).rejects.toBeInstanceOf(
        BotParentError,
      );
      // Under a nested bot would make a second level.
      await expect(repos.setBotParent(actor, other.id, middle.id)).rejects.toBeInstanceOf(
        BotParentError,
      );
      // A bot with nested bots can't move under another; nor under its own child (a cycle).
      await expect(repos.setBotParent(actor, top.id, other.id)).rejects.toBeInstanceOf(
        BotParentError,
      );
      await expect(repos.setBotParent(actor, top.id, middle.id)).rejects.toBeInstanceOf(
        BotParentError,
      );
      expect((await read(top.id)).parentBotId).toBeNull();
      expect((await read(other.id)).parentBotId).toBeNull();
    }));

  it("refuses archived bots and bots of another owner", async () => {
    const [mine, archived] = await runAsTenant(owners[0]!, async () => {
      const mine = await create(owners[0]!, "Mine");
      const archived = await create(owners[0]!, "Archived");
      await prisma.bot.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
      return [mine, archived];
    });
    const theirs = await runAsTenant(owners[1]!, () => create(owners[1]!, "Theirs"));

    await runAsTenant(owners[0]!, async () => {
      const repos = createRepos(prisma);
      const actor = actorOf(owners[0]!);
      await expect(repos.setBotParent(actor, mine.id, archived.id)).rejects.toBeInstanceOf(
        IsolationError,
      );
      await expect(repos.setBotParent(actor, mine.id, theirs.id)).rejects.toBeInstanceOf(
        IsolationError,
      );
      await expect(repos.setBotParent(actor, theirs.id, mine.id)).rejects.toBeInstanceOf(
        IsolationError,
      );
    });
    await runAsTenant(owners[1]!, async () => {
      await expect(
        createRepos(prisma).setBotParent(actorOf(owners[1]!), theirs.id, mine.id),
      ).rejects.toBeInstanceOf(IsolationError);
      expect((await read(theirs.id)).parentBotId).toBeNull();
    });
  });

  it("lets only one of two opposite nests win", async () => {
    const actor = actorOf(owners[0]!);
    for (let round = 0; round < 10; round += 1) {
      const [a, b] = await runAsTenant(owners[0]!, () =>
        Promise.all([create(owners[0]!, `A${round}`), create(owners[0]!, `B${round}`)]),
      );
      const results = await Promise.allSettled([
        runAsTenant(owners[0]!, () => createRepos(prisma).setBotParent(actor, a.id, b.id)),
        runAsTenant(owners[0]!, () => createRepos(prisma).setBotParent(actor, b.id, a.id)),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const parents = await runAsTenant(owners[0]!, async () => [
        (await read(a.id)).parentBotId,
        (await read(b.id)).parentBotId,
      ]);
      expect(parents.filter(Boolean)).toHaveLength(1);
    }
  });
});
