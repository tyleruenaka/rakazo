import type { ProductEvent } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import type { BotActivity } from "./bot-activity";
import {
  activityMotion,
  formatStepElapsed,
  reduceBotActivity,
  toolActivityKind,
} from "./bot-activity";

function event(type: string, payload: Record<string, unknown> = {}, botId = "ezra") {
  return { id: type, seq: 1, type, threadId: "t", botId, runId: "r", payload } as ProductEvent;
}

function replay(events: ProductEvent[]) {
  return events.reduce<ReadonlyMap<string, BotActivity>>(
    (map, next, index) => reduceBotActivity(map, next, index),
    new Map(),
  );
}

describe("bot activity", () => {
  it("follows a run from thinking through tools and typing to done", () => {
    const steps = [
      event("run.started", { trigger: "user" }),
      event("agent.tool.called", { name: "computer_act" }),
      event("agent.tool.completed"),
      event("thread.progress", { delta: "Sure", streaming: true }),
      event("run.completed"),
    ];
    const kinds = steps.map((_, index) => replay(steps.slice(0, index + 1)).get("ezra")?.kind);
    expect(kinds).toEqual(["thinking", "computer", "thinking", "typing", "done"]);
  });

  it("ignores background runs, activity lines and events without a bot", () => {
    const start = replay([event("run.started", { trigger: "user" })]);
    expect(reduceBotActivity(start, event("thread.progress", { activity: true }), 1)).toBe(start);
    expect(reduceBotActivity(start, event("run.started", {}, ""), 1)).toBe(start);
    expect(replay([event("run.started", { trigger: "tickets" })]).size).toBe(0);
  });

  it("shows a sad face when a run fails, blocks while it waits, and clears on cancel", () => {
    const start = event("run.started", { trigger: "user" });
    expect(replay([start, event("run.failed")]).get("ezra")?.kind).toBe("failed");
    expect(replay([start, event("run.waiting_input")]).get("ezra")?.kind).toBe("blocked");
    expect(replay([start, event("computer.takeover.requested")]).get("ezra")?.kind).toBe("blocked");
    expect(replay([start, event("run.waiting_input"), start]).get("ezra")?.kind).toBe("thinking");
    expect(replay([start, event("run.cancelled")]).size).toBe(0);
  });

  it("formats time on a step as Grok does", () => {
    expect(formatStepElapsed(60_000)).toBe("1m");
    expect(formatStepElapsed(59 * 60_000 + 59_000)).toBe("59m");
    expect(formatStepElapsed(120 * 60_000)).toBe("2h");
    expect(formatStepElapsed(65 * 60_000)).toBe("1h 5m");
  });

  it("maps tool names from built-in tools, MCP servers and harnesses", () => {
    expect(toolActivityKind("browser_navigate")).toBe("computer");
    expect(toolActivityKind("web_search")).toBe("search");
    expect(toolActivityKind("WebFetch")).toBe("reading");
    expect(toolActivityKind("mcp__gmail__list")).toBe("reading");
    expect(toolActivityKind("Edit")).toBe("writing");
    expect(toolActivityKind("Bash")).toBe("commands");
    expect(toolActivityKind("message_bot")).toBe("messaging");
    expect(toolActivityKind("message_user")).toBe("typing");
    expect(toolActivityKind("ask_user")).toBe("waiting");
    expect(toolActivityKind("recall")).toBe("memory");
    expect(toolActivityKind("generate_image")).toBe("creating");
    expect(toolActivityKind("connectors_execute_tool")).toBe("working");
    expect(toolActivityKind("something_new")).toBe("working");
  });

  it("gives each activity Grok's face", () => {
    expect(activityMotion({ kind: "thinking", at: 0 })).toBe("thinking");
    expect(activityMotion({ kind: "search", at: 0 })).toBe("searching");
    expect(activityMotion({ kind: "writing", at: 0 })).toBe("writing");
    expect(activityMotion({ kind: "messaging", at: 0 })).toBe("messaging");
    expect(activityMotion({ kind: "computer", at: 0 })).toBe("busy");
    expect(activityMotion({ kind: "failed", at: 0 })).toBe("failed");
    expect(activityMotion({ kind: "done", at: 0 })).toBe("done");
  });
});
