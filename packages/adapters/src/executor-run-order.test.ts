import { runContinueJob } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { createRunExecutor } from "./executor.js";

type Row = Record<string, unknown>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Row[]).some((clause) => matches(row, clause));
    const value = row[key] as never;
    if (condition instanceof Date) return (value as Date | null)?.getTime() === condition.getTime();
    if (condition && typeof condition === "object") {
      return Object.entries(condition).every(([op, arg]) => {
        if (op === "in") return (arg as unknown[]).includes(value);
        if (op === "not") return value !== arg;
        if (op === "lt") return value < (arg as never);
        if (op === "lte") return value <= (arg as never);
        if (op === "gt") return value > (arg as never);
        throw new Error(`Unsupported operator ${op}`);
      });
    }
    return value === condition;
  });
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

function queuedRun(id: string, createdAt: Date, extra: Row = {}): Row {
  return {
    id,
    botId: "bot-1",
    spaceId: "space-1",
    threadId: `thread-${id}`,
    taskId: `task-${id}`,
    userId: "user-1",
    status: "queued",
    trigger: "user",
    checkpoint: null,
    error: null,
    leaseOwner: null,
    leaseFence: 0,
    leaseExpiresAt: null,
    startedAt: null,
    createdAt,
    // A waiting run's continue job rewrites it on every lease retry.
    updatedAt: new Date(Date.now() - 2_000),
    ...extra,
  };
}

/** Team Computer executor whose runs stop right after taking (or missing) the bot's lease. */
function harness(runs: Row[], options: { failSetup?: boolean } = {}) {
  const leases: Row[] = [];
  const leaseTakenBy: string[] = [];
  const enqueue = vi.fn(async (_job: { payload: { runId: string }; availableAt?: Date }) => {});
  const findRuns = (where: Row) => runs.filter((row) => matches(row, where));
  const sortRuns = (rows: Row[], orderBy?: Row | Row[]) => {
    const order = orderBy ? [orderBy].flat() : [];
    return [...rows].sort((a, b) => {
      for (const clause of order) {
        const [key, direction] = Object.entries(clause)[0] as [string, "asc" | "desc"];
        const left = a[key] as never;
        const right = b[key] as never;
        if (left !== right) return (left < right ? -1 : 1) * (direction === "asc" ? 1 : -1);
      }
      return 0;
    });
  };
  let botLookups = 0;
  const prisma: Row = {
    // Settling a released takeover's cards finds none here.
    $transaction: async (work: (tx: Row) => Promise<unknown>) => work(prisma),
    $queryRaw: async () => [],
    message: { findMany: async () => [] },
    run: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => findRuns(where)[0] ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: Row }) => findRuns(where)[0]!),
      findMany: vi.fn(
        async ({ where, orderBy, take }: { where: Row; orderBy?: Row | Row[]; take?: number }) =>
          sortRuns(findRuns(where), orderBy).slice(0, take),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = findRuns(where);
        for (const row of hit) Object.assign(row, data, { updatedAt: new Date() });
        return { count: hit.length };
      }),
    },
    bot: {
      findUniqueOrThrow: vi.fn(async () => {
        botLookups += 1;
        if (options.failSetup && botLookups > 1) throw new Error("setup failed");
        return { computerId: "computer-1", computerSwitching: false, computer: { scope: "team" } };
      }),
    },
    computer: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "computer-1",
        scope: "team",
        state: "ready",
        maintenanceId: null,
        updatedAt: new Date(),
      })),
    },
    computerExecutionLease: {
      updateManyAndReturn: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = leases.filter((lease) => matches(lease, where));
        for (const lease of hit) {
          lease.runId = data.runId;
          lease.expiresAt = data.expiresAt;
          lease.fence = (lease.fence as number) + 1;
          leaseTakenBy.push(data.runId as string);
        }
        return hit.map((lease) => ({ fence: lease.fence }));
      }),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (leases.some((lease) => lease.botId === data.botId)) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        leases.push({ ...data });
        leaseTakenBy.push(data.runId as string);
        return { fence: data.fence };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = leases.filter((lease) => matches(lease, where));
        for (const lease of hit) Object.assign(lease, data);
        return { count: hit.length };
      }),
    },
    attempt: {
      create: vi.fn(async () => {
        if (options.failSetup) return { id: "attempt-1" };
        throw new Error("stop after lease");
      }),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const executor = createRunExecutor({
    prisma,
    jobs: { enqueue },
    events: { notify: vi.fn(async () => undefined) },
    secrets: [],
  } as unknown as Parameters<typeof createRunExecutor>[0]);
  const continueRun = (runId: string) =>
    executor.continueRun(runId, `worker-${runId}`).catch(() => undefined);
  return { continueRun, leases, leaseTakenBy, enqueue, runs };
}

describe("bot run order", () => {
  it("starts a bot's waiting runs oldest-first", async () => {
    const older = queuedRun("run-old", minutesAgo(106));
    const newer = queuedRun("run-new", minutesAgo(20));
    const { continueRun, leaseTakenBy, enqueue } = harness([older, newer]);

    await continueRun("run-new");

    expect(leaseTakenBy).toEqual([]);
    expect(newer.status).toBe("queued");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { runId: "run-new" }, availableAt: expect.any(Date) }),
    );

    await continueRun("run-old");

    expect(leaseTakenBy).toEqual(["run-old"]);
  });

  it("does not wait behind an older run that stopped retrying", async () => {
    const stale = queuedRun("run-old", minutesAgo(106), { updatedAt: minutesAgo(5) });
    const { continueRun, leaseTakenBy } = harness([stale, queuedRun("run-new", minutesAgo(20))]);

    await continueRun("run-new");

    expect(leaseTakenBy).toEqual(["run-new"]);
  });

  it("does not wait behind an older run waiting on the user", async () => {
    const waiting = queuedRun("run-old", minutesAgo(106), { status: "waiting_input" });
    const { continueRun, leaseTakenBy } = harness([waiting, queuedRun("run-new", minutesAgo(20))]);

    await continueRun("run-new");

    expect(leaseTakenBy).toEqual(["run-new"]);
  });

  it("does not wait behind another bot's runs", async () => {
    const otherBot = queuedRun("run-old", minutesAgo(106), { botId: "bot-2" });
    const { continueRun, leaseTakenBy } = harness([otherBot, queuedRun("run-new", minutesAgo(20))]);

    await continueRun("run-new");

    expect(leaseTakenBy).toEqual(["run-new"]);
  });

  it("resumes a run that holds the bot's lease ahead of older waiting runs", async () => {
    const resuming = queuedRun("run-new", minutesAgo(20), { checkpoint: "takeover" });
    const { continueRun, leases, leaseTakenBy } = harness([
      queuedRun("run-old", minutesAgo(106)),
      resuming,
    ]);
    leases.push({
      computerId: "computer-1",
      botId: "bot-1",
      runId: "run-new",
      fence: 3,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });

    await continueRun("run-new");

    expect(leaseTakenBy).toEqual(["run-new"]);
  });

  it("starts the oldest waiting run as soon as the lease frees", async () => {
    const { continueRun, leaseTakenBy, enqueue } = harness(
      [
        queuedRun("run-active", minutesAgo(120)),
        queuedRun("run-next", minutesAgo(106)),
        queuedRun("run-last", minutesAgo(20)),
      ],
      { failSetup: true },
    );

    await continueRun("run-active");

    expect(leaseTakenBy).toEqual(["run-active"]);
    // Due now, not after the rest of its lease retry backoff.
    expect(enqueue).toHaveBeenCalledWith(runContinueJob("run-next"));
    expect(enqueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ payload: { runId: "run-last" } }),
    );
  });

  it("starts the person's message ahead of an older bot-to-bot backlog", async () => {
    const backlog = queuedRun("run-bot", minutesAgo(106), { trigger: "bot_message" });
    const { continueRun, leaseTakenBy } = harness([backlog, queuedRun("run-user", minutesAgo(20))]);

    await continueRun("run-user");

    expect(leaseTakenBy).toEqual(["run-user"]);
  });

  it("holds a bot-to-bot run behind a newer waiting message from the person", async () => {
    const backlog = queuedRun("run-bot", minutesAgo(106), { trigger: "bot_message" });
    const { continueRun, leaseTakenBy } = harness([backlog, queuedRun("run-user", minutesAgo(20))]);

    await continueRun("run-bot");

    expect(leaseTakenBy).toEqual([]);
    expect(backlog.status).toBe("queued");
  });

  it("wakes the person's waiting message before an older bot-to-bot run", async () => {
    const { continueRun, enqueue } = harness(
      [
        queuedRun("run-active", minutesAgo(120)),
        queuedRun("run-bot", minutesAgo(106), { trigger: "routine" }),
        queuedRun("run-user", minutesAgo(20), { trigger: "follow_up" }),
      ],
      { failSetup: true },
    );

    await continueRun("run-active");

    expect(enqueue).toHaveBeenCalledWith(runContinueJob("run-user"));
    expect(enqueue).not.toHaveBeenCalledWith(runContinueJob("run-bot"));
  });

  it("does not wait behind or wake early an older run whose setup keeps failing", async () => {
    const failing = queuedRun("run-failing", minutesAgo(106), {
      error: "Run setup failed; retrying",
    });
    const { continueRun, leaseTakenBy, enqueue } = harness(
      [failing, queuedRun("run-new", minutesAgo(20))],
      { failSetup: true },
    );

    await continueRun("run-new");

    expect(leaseTakenBy).toEqual(["run-new"]);
    expect(enqueue).not.toHaveBeenCalledWith(runContinueJob("run-failing"));
  });
});
