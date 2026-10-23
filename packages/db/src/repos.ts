import type { Actor, Bot, BotSection, MessageBlock, SpaceBot } from "@rakazo/contracts";
import { BOT_COLORS, canonicalPiProviderId, InstructionVersionSchema } from "@rakazo/contracts";
import {
  BACKGROUND_RUN_TRIGGERS,
  displayName,
  isBackgroundRunTrigger,
  phoneCallSettings,
  ringingCall,
  userVisibleMessages,
} from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { Prisma } from "./client.js";
import type { ComputerMode } from "./computers.js";
import { ensureComputerRecord, parseComputerMode } from "./computers.js";
import { appendEventInTransaction } from "./events.js";
import { createThreadMessageInTransaction } from "./messages.js";
import { withNewestThreadMessages } from "./preview-messages.js";
import { BotParentError, BotSectionNameConflictError, IsolationError } from "./scope.js";
import { lockSpaceForContentCreation } from "./spaces.js";
import { activeRunSelection, latestBotRunSelection, previewFromBlocks } from "./thread-listing.js";
import { withTransactionRetry } from "./transaction-retry.js";

/** Newest messages loaded for sidebar preview; enough to skip a short peer-run tail. */
const SIDEBAR_PREVIEW_MESSAGE_WINDOW = 16;

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function isSpawnKeyConflict(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const target = (error as { meta?: { target?: string[] | string } }).meta?.target;
  if (target == null) return true;
  const fields = Array.isArray(target) ? target : [target];
  return fields.some((field) => field === "spawnKey" || field.includes("spawnKey"));
}

function rosterRunErrorId(
  latestRun: { id: string; status: string } | undefined,
  activeRun: { status: string } | undefined,
): string | null {
  if (
    latestRun?.status !== "failed" ||
    activeRun?.status === "waiting_input" ||
    activeRun?.status === "waiting_takeover"
  ) {
    return null;
  }
  return latestRun.id;
}

// Roster rows show when the chat last moved. Bot.updatedAt also moves on settings, pin,
// section and reorder writes, so the newest message's time wins when the chat has one.
function rosterUpdatedAt(newestMessage: { createdAt: Date } | undefined, botUpdatedAt: Date) {
  return newestMessage?.createdAt ?? botUpdatedAt;
}

function mapBot(
  bot: {
    id: string;
    spaceId: string;
    name: string;
    title: string;
    description: string;
    instructions: string;
    selfUpdateInstructions?: boolean;
    instructionHistory?: unknown;
    color: string;
    notifyOnFinish: boolean;
    pinned: boolean;
    sectionId: string | null;
    archivedAt: Date | null;
    parentBotId: string | null;
    memoryScope: string | null;
    createdAt: Date;
    updatedAt: Date;
    thread: { id: string; unread: boolean } | null;
    computer: { scope: string } | null;
    voiceId?: string | null;
    autoSpeak?: boolean;
    modelProvider?: string | null;
    modelId?: string | null;
    thinkingLevel?: string | null;
    teamChatAmbientEnabled?: boolean;
    teamChatRules?: string;
    fleetManagement?: boolean;
    primary?: boolean;
    disabledBuiltinTools?: string[];
    webhookSecretId?: string | null;
    spawnKey?: string | null;
  },
  preview = "",
  status = "idle",
  runErrorId: string | null = null,
  updatedAt: Date = bot.updatedAt,
  incomingCall: Bot["incomingCall"] = null,
): Bot {
  if (!bot.thread) {
    throw new IsolationError("Bot is missing its thread");
  }
  return {
    id: bot.id,
    spaceId: bot.spaceId,
    name: bot.name,
    title: displayName(bot.title, ""),
    description: bot.description,
    instructions: bot.instructions,
    selfUpdateInstructions: bot.selfUpdateInstructions ?? false,
    instructionHistory: InstructionVersionSchema.array().parse(bot.instructionHistory ?? []),
    color: bot.color,
    notifyOnFinish: bot.notifyOnFinish,
    pinned: bot.pinned,
    sectionId: bot.sectionId,
    archivedAt: bot.archivedAt?.toISOString() ?? null,
    unread: bot.thread.unread,
    parentBotId: bot.parentBotId,
    memoryScope: bot.memoryScope as "isolated" | "shared" | null,
    threadId: bot.thread.id,
    preview,
    status,
    runErrorId,
    computerMode: bot.computer ? parseComputerMode(bot.computer.scope) : "team",
    createdAt: bot.createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    voiceId: bot.voiceId ?? null,
    autoSpeak: bot.autoSpeak ?? false,
    modelProvider: bot.modelProvider ? canonicalPiProviderId(bot.modelProvider) : null,
    modelId: bot.modelId ?? null,
    thinkingLevel: (bot.thinkingLevel as Bot["thinkingLevel"]) ?? null,
    teamChatAmbientEnabled: bot.teamChatAmbientEnabled ?? false,
    teamChatRules: bot.teamChatRules ?? "",
    fleetManagement: bot.fleetManagement ?? false,
    primary: bot.primary ?? false,
    disabledBuiltinTools: bot.disabledBuiltinTools ?? [],
    webhookConfigured: Boolean(bot.webhookSecretId),
    spawnKey: bot.spawnKey ?? null,
    incomingCall,
  };
}

/**
 * An unpinned parent lists its nested bots under it, so moving it to a section takes their
 * own section along. A pinned parent's nested bots list in their own sections and keep them.
 */
async function moveNestedWithParent(
  tx: Pick<Prisma.TransactionClient, "bot">,
  actor: Actor,
  parent: { id: string; pinned: boolean; parentBotId: string | null },
  sectionId: string | null,
): Promise<void> {
  if (parent.pinned || parent.parentBotId) return;
  await tx.bot.updateMany({
    where: { parentBotId: parent.id, spaceId: actor.spaceId, userId: actor.userId },
    data: { sectionId },
  });
}

export function createRepos(
  prisma: PrismaClient,
  capabilities: { phoneCallsEnabled?: boolean; phoneCallRingSeconds?: number } = {},
) {
  async function listBotSectionsForSpaces(
    actor: Actor,
    spaceIds: string[],
  ): Promise<Array<BotSection & { spaceId: string }>> {
    if (spaceIds.length === 0) return [];
    const sections = await prisma.botSection.findMany({
      where: { spaceId: { in: spaceIds }, userId: actor.userId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return sections.map((section) => ({
      id: section.id,
      spaceId: section.spaceId,
      name: section.name,
      position: section.position,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
    }));
  }

  async function listSpaceBotsForSpaces(actor: Actor, spaceIds: string[]): Promise<SpaceBot[]> {
    if (spaceIds.length === 0) return [];
    const bots = await prisma.bot.findMany({
      where: {
        spaceId: { in: spaceIds },
        userId: actor.userId,
        archivedAt: null,
      },
      select: {
        id: true,
        spaceId: true,
        name: true,
        title: true,
        color: true,
        notifyOnFinish: true,
        pinned: true,
        sectionId: true,
        updatedAt: true,
        parentBotId: true,
        primary: true,
        thread: {
          select: {
            unread: true,
            messages: {
              orderBy: { seq: "desc" },
              take: 1,
              select: { blocks: true, createdAt: true },
            },
            runs: latestBotRunSelection,
          },
        },
        runs: activeRunSelection,
      },
      orderBy: [{ pinned: "desc" }, { position: "asc" }, { createdAt: "asc" }],
    });
    return bots.map((bot) => {
      if (!bot.thread) throw new IsolationError("Bot is missing its thread");
      return {
        id: bot.id,
        spaceId: bot.spaceId,
        name: bot.name,
        title: displayName(bot.title, ""),
        color: bot.color,
        notifyOnFinish: bot.notifyOnFinish,
        pinned: bot.pinned,
        sectionId: bot.sectionId,
        unread: bot.thread.unread,
        parentBotId: bot.parentBotId,
        primary: bot.primary,
        preview: previewFromBlocks(bot.thread.messages[0]?.blocks),
        status: bot.runs[0]?.status ?? "idle",
        runErrorId: rosterRunErrorId(bot.thread.runs[0], bot.runs[0]),
        updatedAt: rosterUpdatedAt(bot.thread.messages[0], bot.updatedAt).toISOString(),
      };
    });
  }

  return {
    async listBotSections(actor: Actor): Promise<BotSection[]> {
      return listBotSectionsForSpaces(actor, [actor.spaceId]);
    },

    listBotSectionsForSpaces,

    async createBotSection(
      actor: Actor,
      input: { botId?: string; groupId?: string; name: string },
    ) {
      const { name } = input;
      return prisma.$transaction(async (tx) => {
        const target = input.botId
          ? await tx.bot.findFirst({
              where: {
                id: input.botId,
                spaceId: actor.spaceId,
                userId: actor.userId,
                archivedAt: null,
              },
              select: { id: true },
            })
          : await tx.chatGroup.findFirst({
              where: {
                id: input.groupId,
                spaceId: actor.spaceId,
                userId: actor.userId,
                archivedAt: null,
              },
              select: { id: true },
            });
        if (!target) throw new IsolationError();

        const aggregate = await tx.botSection.aggregate({
          where: { spaceId: actor.spaceId, userId: actor.userId },
          _max: { position: true },
        });
        await tx.botSection.createMany({
          data: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            name,
            position: (aggregate._max.position ?? -1) + 1,
          },
          skipDuplicates: true,
        });
        const section = await tx.botSection.findUniqueOrThrow({
          where: {
            spaceId_userId_name: {
              spaceId: actor.spaceId,
              userId: actor.userId,
              name,
            },
          },
        });
        if (input.botId) {
          const moved = await tx.bot.update({
            where: { id: target.id },
            data: { sectionId: section.id },
            select: { id: true, pinned: true, parentBotId: true },
          });
          await moveNestedWithParent(tx, actor, moved, section.id);
        } else {
          await tx.chatGroup.update({
            where: { id: target.id },
            data: { sectionId: section.id },
          });
        }
        return {
          id: section.id,
          name: section.name,
          position: section.position,
          createdAt: section.createdAt.toISOString(),
          updatedAt: section.updatedAt.toISOString(),
        } satisfies BotSection;
      });
    },

    async updateBotSection(actor: Actor, input: { sectionId: string; name: string }) {
      const existing = await prisma.botSection.findFirst({
        where: {
          id: input.sectionId,
          spaceId: actor.spaceId,
          userId: actor.userId,
        },
      });
      if (!existing) throw new IsolationError();
      if (existing.name === input.name) {
        return {
          id: existing.id,
          name: existing.name,
          position: existing.position,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        } satisfies BotSection;
      }
      try {
        const section = await prisma.botSection.update({
          where: { id: existing.id },
          data: { name: input.name },
        });
        return {
          id: section.id,
          name: section.name,
          position: section.position,
          createdAt: section.createdAt.toISOString(),
          updatedAt: section.updatedAt.toISOString(),
        } satisfies BotSection;
      } catch (error) {
        if (isUniqueViolation(error)) throw new BotSectionNameConflictError();
        throw error;
      }
    },

    /** Delete one of the actor's sections; its bots and groups stay, unsectioned (FK SetNull). */
    async deleteBotSection(actor: Actor, input: { sectionId: string }) {
      return prisma.$transaction(async (tx) => {
        // The row lock blocks concurrent moves into this section until the delete commits.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM bot_sections
          WHERE id = ${input.sectionId}
            AND "spaceId" = ${actor.spaceId}
            AND "userId" = ${actor.userId}
          FOR UPDATE
        `;
        if (locked.length !== 1) throw new IsolationError();
        const where = { sectionId: input.sectionId };
        const releasedBots = await tx.bot.count({ where });
        const releasedGroups = await tx.chatGroup.count({ where });
        await tx.botSection.delete({ where: { id: input.sectionId } });
        return { id: input.sectionId, releasedBots, releasedGroups };
      });
    },

    async listBots(actor: Actor, options: { archived?: boolean } = {}): Promise<Bot[]> {
      const bots = await withNewestThreadMessages(
        prisma,
        await prisma.bot.findMany({
          where: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            archivedAt: options.archived ? { not: null } : null,
          },
          include: {
            thread: {
              include: {
                runs: latestBotRunSelection,
              },
            },
            runs: activeRunSelection,
            computer: { select: { scope: true } },
          },
          orderBy: [{ pinned: "desc" }, { position: "asc" }, { createdAt: "asc" }],
        }),
        SIDEBAR_PREVIEW_MESSAGE_WINDOW,
      );
      const callThreadIds = capabilities.phoneCallsEnabled
        ? bots.flatMap((bot) => (bot.thread ? [bot.thread.id] : []))
        : [];
      const callMessages = callThreadIds.length
        ? await prisma.message.findMany({
            where: {
              threadId: { in: callThreadIds },
              createdAt: {
                gt: new Date(
                  Date.now() -
                    (capabilities.phoneCallRingSeconds ??
                      phoneCallSettings().phoneCallRingSeconds) *
                      1000,
                ),
              },
              role: "bot",
              clientNonce: { startsWith: "call:", endsWith: ":request" },
            },
            orderBy: { seq: "desc" },
            distinct: ["threadId"],
            select: { threadId: true, role: true, blocks: true },
          })
        : [];
      const callsByThread = new Map(callMessages.map((message) => [message.threadId, message]));
      const candidateRunIds = [
        ...new Set(
          bots.flatMap((bot) =>
            (bot.thread?.messages ?? []).flatMap((message) =>
              message.runId ? [message.runId] : [],
            ),
          ),
        ),
      ];
      const checkedRunIds = new Set<string>();
      const peerRunIds = new Set<string>();
      const backgroundRunIds = new Set<string>();
      const classifyRunIds = async (ids: string[]) => {
        const missing = ids.filter((id) => !checkedRunIds.has(id));
        if (missing.length === 0) return;
        const rows = await prisma.run.findMany({
          where: {
            id: { in: missing },
            trigger: { in: ["bot_message", ...BACKGROUND_RUN_TRIGGERS] },
          },
          select: { id: true, trigger: true },
        });
        for (const row of rows) {
          if (isBackgroundRunTrigger(row.trigger)) backgroundRunIds.add(row.id);
          else peerRunIds.add(row.id);
        }
        for (const id of missing) checkedRunIds.add(id);
      };
      await classifyRunIds(candidateRunIds);
      return Promise.all(
        bots.map(async (bot) => {
          let messages = bot.thread?.messages ?? [];
          const updatedAt = rosterUpdatedAt(messages[0], bot.updatedAt);
          let preview = "";
          for (let attempt = 0; attempt < 5; attempt++) {
            const windowRunIds = [
              ...new Set(messages.flatMap((message) => (message.runId ? [message.runId] : []))),
            ].filter((runId) => !checkedRunIds.has(runId));
            if (windowRunIds.length > 0) {
              await classifyRunIds(windowRunIds);
            }
            const visible = userVisibleMessages(
              messages.map((message) => ({
                ...message,
                blocks: message.blocks as MessageBlock[],
                runId: message.runId ?? undefined,
              })),
              {
                knownPeerRunIds: peerRunIds,
                backgroundRunIds,
                includeDelegatedReplyText: false,
              },
            );
            preview = previewFromBlocks(visible[0]?.blocks);
            if (preview || messages.length === 0 || !bot.thread || attempt === 4) break;
            const oldest = messages[messages.length - 1];
            if (!oldest) break;
            messages = await prisma.message.findMany({
              where: { threadId: bot.thread.id, seq: { lt: oldest.seq } },
              orderBy: { seq: "desc" },
              take: SIDEBAR_PREVIEW_MESSAGE_WINDOW,
            });
            if (messages.length === 0) break;
          }
          return mapBot(
            bot,
            preview,
            bot.runs[0]?.status ?? "idle",
            rosterRunErrorId(bot.thread?.runs[0], bot.runs[0]),
            updatedAt,
            ringingCall(
              bot.thread && callsByThread.has(bot.thread.id)
                ? [callsByThread.get(bot.thread.id)!]
                : [],
            ),
          );
        }),
      );
    },

    listSpaceBotsForSpaces,

    async getBot(actor: Actor, botId: string, options: { includeArchived?: boolean } = {}) {
      const bot = await prisma.bot.findFirst({
        where: {
          id: botId,
          spaceId: actor.spaceId,
          userId: actor.userId,
          ...(options.includeArchived ? {} : { archivedAt: null }),
        },
        include: { thread: true, computer: true },
      });
      if (!bot) throw new IsolationError();
      return bot;
    },

    async createBot(
      actor: Actor,
      input: {
        name: string;
        title: string;
        description: string;
        instructions: string;
        notifyOnFinish: boolean;
        fleetManagement?: boolean;
        color?: string;
        parentBotId?: string | null;
        computerMode?: ComputerMode;
        spawnKey?: string;
        modelProvider?: string | null;
        modelId?: string | null;
        thinkingLevel?: string | null;
        disabledBuiltinTools?: string[];
        initialMessage?: {
          role: "user" | "bot" | "system";
          blocks: MessageBlock[];
          runId?: string;
        };
      },
    ): Promise<Bot> {
      let color = input.color;
      if (color === undefined) {
        const count = await prisma.bot.count({
          where: { spaceId: actor.spaceId, userId: actor.userId },
        });
        color = BOT_COLORS[count % BOT_COLORS.length] ?? BOT_COLORS[0];
      }
      let modelProvider = input.modelProvider ?? null;
      let modelId = input.modelId ?? null;
      let thinkingLevel = input.thinkingLevel ?? null;
      let disabledBuiltinTools = input.disabledBuiltinTools ?? [];
      if (input.parentBotId) {
        const parent = await prisma.bot.findFirst({
          where: {
            id: input.parentBotId,
            spaceId: actor.spaceId,
            userId: actor.userId,
          },
        });
        if (!parent) throw new IsolationError();
        if (!modelId) {
          modelProvider = parent.modelProvider ?? null;
          modelId = parent.modelId ?? null;
        }
        if (thinkingLevel == null) thinkingLevel = parent.thinkingLevel ?? null;
        if (input.disabledBuiltinTools === undefined) {
          disabledBuiltinTools = parent.disabledBuiltinTools;
        }
      }
      const settings = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
      const envKind = process.env.SANDBOX_PROVIDER ?? "docker";
      const kind =
        envKind === "docker" && settings?.computerHost === "this-mac" ? "desktop" : envKind;
      const insertBot = () =>
        prisma.$transaction(async (tx) => {
          await lockSpaceForContentCreation(tx, {
            spaceId: actor.spaceId,
            userId: actor.userId,
          });
          const positions = await tx.bot.aggregate({
            where: { spaceId: actor.spaceId, userId: actor.userId },
            _max: { position: true },
          });
          const teamComputer = await ensureComputerRecord(tx, {
            mode: "team",
            spaceId: actor.spaceId,
            userId: actor.userId,
            kind,
          });
          const created = await tx.bot.create({
            data: {
              spaceId: actor.spaceId,
              userId: actor.userId,
              name: displayName(input.name, ""),
              title: displayName(input.title, ""),
              description: input.description,
              instructions: input.instructions,
              notifyOnFinish: input.notifyOnFinish,
              fleetManagement: input.fleetManagement,
              color,
              position: (positions._max.position ?? -1) + 1,
              parentBotId: input.parentBotId ?? null,
              computerId: teamComputer.id,
              spawnKey: input.spawnKey,
              modelProvider,
              modelId,
              thinkingLevel,
              disabledBuiltinTools,
            },
          });
          const thread = await tx.thread.create({
            data: {
              spaceId: actor.spaceId,
              botId: created.id,
              userId: actor.userId,
            },
          });
          if (input.initialMessage) {
            await createThreadMessageInTransaction(tx, {
              threadId: thread.id,
              ...input.initialMessage,
            });
          }
          if (input.computerMode === "dedicated") {
            const dedicated = await ensureComputerRecord(tx, {
              mode: "dedicated",
              spaceId: actor.spaceId,
              userId: actor.userId,
              botId: created.id,
              kind,
            });
            await tx.bot.update({ where: { id: created.id }, data: { computerId: dedicated.id } });
          }
          await tx.browserProfile.create({
            data: {
              spaceId: actor.spaceId,
              botId: created.id,
              userId: actor.userId,
            },
          });
          await tx.memoryDocument.create({
            data: {
              spaceId: actor.spaceId,
              userId: actor.userId,
              botId: created.id,
              scope: "bot",
              path: "MEMORY.md",
              content: `# ${input.name}\n\n`,
            },
          });
          return tx.bot.findFirstOrThrow({
            where: { id: created.id },
            include: { thread: true, computer: true },
          });
        });

      const findBySpawnKey = async () => {
        if (!input.spawnKey) return null;
        return prisma.bot.findUnique({
          where: {
            spaceId_spawnKey: {
              spaceId: actor.spaceId,
              spawnKey: input.spawnKey,
            },
          },
          include: { thread: true, computer: true },
        });
      };

      let bot: Awaited<ReturnType<typeof insertBot>>;
      try {
        bot = await insertBot();
      } catch (error) {
        if (!input.spawnKey || !isSpawnKeyConflict(error)) throw error;
        const existing = await findBySpawnKey();
        if (!existing || existing.userId !== actor.userId) throw error;
        if (!existing.archivedAt) {
          bot = existing;
        } else {
          // Free the key from the archived bot so empty-space onboarding
          // creates a fresh first bot (stale thread/runtime must not return).
          await prisma.bot.update({
            where: { id: existing.id },
            data: { spawnKey: null },
          });
          try {
            bot = await insertBot();
          } catch (retryError) {
            if (!isSpawnKeyConflict(retryError)) throw retryError;
            const winner = await findBySpawnKey();
            if (!winner || winner.userId !== actor.userId || winner.archivedAt) throw retryError;
            bot = winner;
          }
        }
      }
      return mapBot(bot);
    },

    async reorderBots(actor: Actor, botIds: string[]): Promise<void> {
      await prisma.$transaction(async (tx) => {
        const bots = await tx.bot.findMany({
          where: {
            spaceId: actor.spaceId,
            userId: actor.userId,
            archivedAt: null,
          },
          select: { id: true },
        });
        const existing = new Set(bots.map((bot) => bot.id));
        if (existing.size !== botIds.length || botIds.some((id) => !existing.has(id))) {
          throw new IsolationError();
        }
        // ponytail: rosters are small; switch to one SQL CASE update only if this becomes hot.
        await Promise.all(
          botIds.map((id, position) => tx.bot.update({ where: { id }, data: { position } })),
        );
      });
    },

    /**
     * Move a bot to one of the actor's sections, or to unassigned with null. An unpinned
     * parent lists its nested bots under it, so they take the new section too and keep it
     * once the parent is pinned. A pinned parent's nested bots list in their own sections,
     * which stay as they are.
     */
    async setBotSection(actor: Actor, botId: string, sectionId: string | null): Promise<void> {
      await prisma.$transaction(async (tx) => {
        // Lock the bot and its nested bots in id order, the order setBotParent locks rows.
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            parentBotId: string | null;
            pinned: boolean;
            archivedAt: Date | null;
          }>
        >`
          SELECT id, "parentBotId", pinned, "archivedAt"
          FROM bots
          WHERE (id = ${botId} OR "parentBotId" = ${botId})
            AND "spaceId" = ${actor.spaceId}
            AND "userId" = ${actor.userId}
          ORDER BY id
          FOR UPDATE
        `;
        const bot = rows.find((row) => row.id === botId);
        if (!bot || bot.archivedAt) throw new IsolationError();
        if (sectionId) {
          const section = await tx.botSection.findFirst({
            where: { id: sectionId, spaceId: actor.spaceId, userId: actor.userId },
            select: { id: true },
          });
          if (!section) throw new IsolationError();
        }
        await tx.bot.update({ where: { id: botId }, data: { sectionId } });
        await moveNestedWithParent(tx, actor, bot, sectionId);
      });
    },

    /**
     * Nest a bot under another of the actor's top-level bots, or move it back to
     * the top level. Nesting gives the parent's fleet tools reach over it. The bot
     * keeps its own section and is never pinned: it lists under its parent while the
     * parent is unpinned, and as an ordinary row in its own section while the parent
     * is pinned.
     */
    async setBotParent(actor: Actor, botId: string, parentBotId: string | null): Promise<void> {
      if (parentBotId === botId) throw new BotParentError("A bot can't be nested under itself");
      await prisma.$transaction(async (tx) => {
        // Lock both rows in id order so two opposite nests can't both pass the checks.
        const ids = parentBotId ? [botId, parentBotId].sort() : [botId];
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            parentBotId: string | null;
            sectionId: string | null;
            pinned: boolean;
            primary: boolean;
          }>
        >`
          SELECT id, "parentBotId", "sectionId", pinned, "primary"
          FROM bots
          WHERE id IN (${Prisma.join(ids)})
            AND "spaceId" = ${actor.spaceId}
            AND "userId" = ${actor.userId}
            AND "archivedAt" IS NULL
          ORDER BY id
          FOR UPDATE
        `;
        const parent = rows.find((row) => row.id === parentBotId);
        if (!rows.some((row) => row.id === botId) || (parentBotId && !parent)) {
          throw new IsolationError();
        }
        if (!parent) {
          // A nested bot is never shown pinned, so moving it out leaves it unpinned too.
          const nested = rows.some((row) => row.id === botId && row.parentBotId);
          await tx.bot.update({
            where: { id: botId },
            data: nested ? { parentBotId: null, pinned: false } : { parentBotId: null },
          });
          return;
        }
        // The Primary manages every bot, so no bot can manage it.
        if (rows.some((row) => row.id === botId && row.primary)) {
          throw new BotParentError("The Primary bot can't be nested");
        }
        if (parent.parentBotId) throw new BotParentError("A nested bot can't have nested bots");
        const child = await tx.bot.findFirst({
          where: { parentBotId: botId },
          select: { id: true },
        });
        if (child) throw new BotParentError("A bot with nested bots can't be nested");
        await tx.bot.update({
          where: { id: botId },
          data: { parentBotId: parent.id, pinned: false },
        });
      });
    },

    /**
     * Make a bot the actor's Primary in this space, replacing the current one. The
     * Primary stays top level and can manage, as its role needs. Writes `bot.updated`
     * to the new and the previous Primary's threads so open chats refresh their list.
     */
    async setBotPrimary(
      actor: Actor,
      botId: string,
    ): Promise<Array<{ threadId: string; seq: number }>> {
      return prisma.$transaction(async (tx) => {
        // Serialize switches per owner and space; the partial unique index backs this up.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`primary:${actor.spaceId}:${actor.userId}`}, 0))::text AS "lock"
        `;
        const scope = { spaceId: actor.spaceId, userId: actor.userId };
        const select = {
          id: true,
          name: true,
          title: true,
          description: true,
          primary: true,
          thread: { select: { id: true } },
        } as const;
        const bot = await tx.bot.findFirst({
          where: { ...scope, id: botId, archivedAt: null },
          select,
        });
        if (!bot?.thread) throw new IsolationError();
        if (bot.primary) return [];
        const previous = await tx.bot.findMany({ where: { ...scope, primary: true }, select });
        const threadIds = [bot.thread.id, ...previous.flatMap((row) => row.thread?.id ?? [])];
        // Event appends lock the thread; take thread locks before bot rows, as other writers do.
        await tx.$queryRaw`
          SELECT id FROM threads WHERE id IN (${Prisma.join(threadIds)}) ORDER BY id FOR UPDATE
        `;
        // Then the bot rows in id order, the order setBotParent locks them, so the two can't deadlock.
        const botIds = [bot.id, ...previous.map((row) => row.id)];
        await tx.$queryRaw`
          SELECT id FROM bots WHERE id IN (${Prisma.join(botIds)}) ORDER BY id FOR UPDATE
        `;
        await tx.bot.updateMany({ where: { ...scope, primary: true }, data: { primary: false } });
        await tx.bot.update({
          where: { id: botId },
          data: { primary: true, parentBotId: null, fleetManagement: true },
        });
        const appended: Array<{ threadId: string; seq: number }> = [];
        for (const row of [bot, ...previous]) {
          if (!row.thread) continue;
          const event = await appendEventInTransaction(tx, {
            spaceId: actor.spaceId,
            threadId: row.thread.id,
            botId: row.id,
            type: "bot.updated",
            payload: {
              botId: row.id,
              name: row.name,
              title: row.title,
              description: row.description,
            },
          });
          appended.push({ threadId: row.thread.id, seq: event.seq });
        }
        return appended;
      });
    },

    async setBotComputer(actor: Actor, botId: string, mode: ComputerMode): Promise<Bot> {
      const bot = await prisma.bot.findFirst({
        where: { id: botId, spaceId: actor.spaceId, userId: actor.userId },
        include: { computer: true },
      });
      if (!bot?.computer) throw new IsolationError();
      const kind = bot.computer.kind;
      // Keep ensure + bot link in one transaction so a capped quota lock covers
      // both steps (a computer row alone does not count until a live bot refs it).
      const updated = await withTransactionRetry(() =>
        prisma.$transaction(async (tx) => {
          const computer = await ensureComputerRecord(tx, {
            mode,
            spaceId: actor.spaceId,
            userId: actor.userId,
            botId,
            kind,
          });
          return tx.bot.update({
            where: { id: botId },
            data: { computerId: computer.id },
            include: { thread: true, computer: true },
          });
        }),
      );
      return mapBot(updated);
    },
  };
}
