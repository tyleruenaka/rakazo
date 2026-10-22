import type { BotMotion } from "./bot-character.js";
import { isBackgroundRunTrigger } from "./run-state.js";

/** The part of a live thread event the activity reader needs (web and mobile events both fit). */
export type BotActivityEvent = {
  type: string;
  botId?: string | null;
  payload?: Record<string, unknown> | null;
};

/** What a working bot is doing right now, read from its live thread events. */
export type ActivityKind =
  | "thinking"
  | "typing"
  | "computer"
  | "search"
  | "reading"
  | "writing"
  | "commands"
  | "messaging"
  | "memory"
  | "creating"
  | "waiting"
  | "working";

/** A run outcome the face shows after the work: happy, sad, or waiting on the user. */
type RunOutcome = "done" | "failed" | "blocked";

export type BotActivity = { kind: ActivityKind | RunOutcome; at: number };

const TOOL_KINDS: [RegExp, ActivityKind][] = [
  [/ask_user/, "waiting"],
  [/message_user|call_user/, "typing"],
  [/computer|browser|screenshot|click|launch_app/, "computer"],
  [/search/, "search"],
  [/fetch|read|web|list|grep|glob/, "reading"],
  [/write|edit|file/, "writing"],
  [/connector/, "working"],
  [/bash|shell|command|exec|terminal/, "commands"],
  [/message|handoff|bot|agent/, "messaging"],
  [/remember|recall|memory|brain/, "memory"],
  [/image|video/, "creating"],
];

/** Tool names come from built-in tools, MCP servers and harnesses, so match loosely. */
export function toolActivityKind(name: string): ActivityKind {
  const lower = name.toLowerCase();
  return TOOL_KINDS.find(([pattern]) => pattern.test(lower))?.[1] ?? "working";
}

function nextActivity(
  current: BotActivity | undefined,
  event: BotActivityEvent,
): BotActivity["kind"] | null | undefined {
  const working = current && current.kind !== "done" && current.kind !== "failed";
  const payload = event.payload ?? {};
  switch (event.type) {
    case "run.started":
      return isBackgroundRunTrigger(payload.trigger as string | undefined) ? undefined : "thinking";
    case "agent.tool.called":
      return toolActivityKind(String(payload.name ?? ""));
    case "agent.tool.completed":
      return working ? "thinking" : undefined;
    case "thread.progress":
      return payload.streaming === true ? "typing" : undefined;
    case "thread.message.created":
      // Narration published mid-run: the bot goes back to thinking.
      return working && current.kind !== "blocked" && payload.role === "bot"
        ? "thinking"
        : undefined;
    case "run.completed":
      return "done";
    case "run.failed":
      return "failed";
    case "run.waiting_input":
    case "computer.takeover.requested":
      return "blocked";
    case "run.cancelled":
      return null;
    default:
      return undefined;
  }
}

/** Live activity by bot id. Unchanged events return the same map. */
export function reduceBotActivity(
  prev: ReadonlyMap<string, BotActivity>,
  event: BotActivityEvent,
  now: number,
): ReadonlyMap<string, BotActivity> {
  const botId = event.botId;
  if (!botId) return prev;
  const current = prev.get(botId);
  const kind = nextActivity(current, event);
  if (kind === undefined || kind === current?.kind) return prev;
  const next = new Map(prev);
  if (kind === null) next.delete(botId);
  else next.set(botId, { kind, at: now });
  return next;
}

/** Grok's face per activity: glyphs for thinking, searching, writing, creating, messaging and waiting. */
export function activityMotion(activity: BotActivity): BotMotion {
  switch (activity.kind) {
    case "thinking":
    case "typing":
    case "done":
    case "failed":
    case "blocked":
    case "writing":
    case "messaging":
    case "creating":
    case "waiting":
      return activity.kind;
    case "search":
      return "searching";
    default:
      return "busy";
  }
}

/** Grok's elapsed time on a step: "1m" once a minute has passed, then "1h", "1h 5m". */
export function formatStepElapsed(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
