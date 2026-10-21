import type { MessageBlock } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { groupPeerMarkers } from "./peer-marker-groups.js";
import type { ThreadItem, VoiceChatMessage } from "./voice-chat-groups.js";

const bots = { otto: "Otto", ezra: "Ezra", riley: "Riley" } as const;
type Bot = keyof typeof bots;

const sent = (id: string, to: Bot): VoiceChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "bot_message_sent", toBotId: to, toBotName: bots[to], text: "hi" }],
});
const received = (id: string, from: Bot): VoiceChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "bot_message_received", fromBotId: from, fromBotName: bots[from], text: "hi" }],
});
const text = (id: string): VoiceChatMessage => ({
  id,
  role: "bot",
  blocks: [{ kind: "text", text: "Done." } as MessageBlock],
});
const items = (...messages: VoiceChatMessage[]): ThreadItem[] =>
  messages.map((message) => ({ kind: "message", message }));

describe("groupPeerMarkers", () => {
  it("merges one message to each of several bots into a fanout", () => {
    const [group] = groupPeerMarkers(
      items(sent("a", "riley"), sent("b", "otto"), sent("c", "ezra")),
    );
    expect(group).toEqual({
      kind: "peerMarkers",
      key: "a",
      messages: [expect.objectContaining({ id: "a" }), expect.anything(), expect.anything()],
      summary: {
        kind: "fanout",
        messageCount: 3,
        peers: [
          { id: "riley", name: "Riley" },
          { id: "otto", name: "Otto" },
          { id: "ezra", name: "Ezra" },
        ],
      },
    });
  });

  it("counts every message but each bot once, in first-appearance order", () => {
    const [group] = groupPeerMarkers(
      items(sent("a", "otto"), sent("b", "ezra"), sent("c", "otto")),
    );
    expect(group).toMatchObject({
      kind: "peerMarkers",
      summary: {
        kind: "thread",
        messageCount: 3,
        peers: [
          { id: "otto", name: "Otto" },
          { id: "ezra", name: "Ezra" },
        ],
      },
    });
  });

  it("treats a sent and received pair with one bot as a thread with one peer", () => {
    const [group] = groupPeerMarkers(items(sent("a", "otto"), received("b", "otto")));
    expect(group).toMatchObject({
      summary: { kind: "thread", messageCount: 2, peers: [{ id: "otto", name: "Otto" }] },
    });
  });

  it("uses the thread wording when any marker is incoming", () => {
    const [group] = groupPeerMarkers(items(received("a", "otto"), received("b", "ezra")));
    expect(group).toMatchObject({ summary: { kind: "thread", messageCount: 2 } });
  });

  it("splits runs at any other item and leaves a lone marker as a message", () => {
    const grouped = groupPeerMarkers(
      items(sent("a", "otto"), sent("b", "ezra"), text("t"), sent("c", "riley")),
    );
    expect(grouped.map((item) => item.kind)).toEqual(["peerMarkers", "message", "message"]);
    expect(grouped[2]).toEqual({ kind: "message", message: expect.objectContaining({ id: "c" }) });
  });

  it("keeps standalone markers on their own row and splits the run there", () => {
    const grouped = groupPeerMarkers(
      items(sent("a", "otto"), received("b", "ezra"), sent("c", "riley"), sent("d", "otto")),
      (message) => message.id === "b",
    );
    expect(grouped.map((item) => (item.kind === "peerMarkers" ? item.key : item.kind))).toEqual([
      "message",
      "message",
      "c",
    ]);
  });

  it("passes voice chat groups through and lets them end a run", () => {
    const call: ThreadItem = { kind: "voiceChat", key: "call:1", callId: "1", messages: [] };
    const grouped = groupPeerMarkers([...items(sent("a", "otto")), call, ...items(text("t"))]);
    expect(grouped.map((item) => item.kind)).toEqual(["message", "voiceChat", "message"]);
  });
});
