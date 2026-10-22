import type { ThreadMessage } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { peerConversations, peerMessagesFrom } from "./peer-messages.js";

function message(id: string, createdAt: string, blocks: ThreadMessage["blocks"]): ThreadMessage {
  return { id, threadId: "t_1", seq: 1, role: "bot", blocks, createdAt };
}

const sentToAnalyst = message("m_1", "2026-08-25T10:00:00.000Z", [
  { kind: "bot_message_sent", toBotId: "b_2", toBotName: "Analyst", text: "chart q3" },
]);
const replyFromAnalyst = message("m_2", "2026-08-25T10:01:00.000Z", [
  { kind: "bot_message_received", fromBotId: "b_2", fromBotName: "Analyst", text: "done" },
]);
const plainText = message("m_3", "2026-08-25T10:02:00.000Z", [{ kind: "text", text: "hello" }]);

describe("peer conversations", () => {
  const messages = [sentToAnalyst, replyFromAnalyst, plainText];

  it("reads both directions out of the thread", () => {
    expect(peerMessagesFrom(messages)).toEqual([
      expect.objectContaining({ direction: "sent", peerBotName: "Analyst", text: "chart q3" }),
      expect.objectContaining({ direction: "received", peerBotName: "Analyst", text: "done" }),
    ]);
  });

  it("groups an exchange with one peer into a single conversation", () => {
    const conversations = peerConversations(messages);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]?.peerBotName).toBe("Analyst");
    expect(conversations[0]?.messages).toHaveLength(2);
    expect(conversations[0]?.lastText).toBe("done");
  });

  it("orders conversations by most recent activity", () => {
    const older = message("m_0", "2026-08-24T09:00:00.000Z", [
      { kind: "bot_message_sent", toBotId: "b_3", toBotName: "Scout", text: "look into it" },
    ]);
    expect(peerConversations([older, ...messages]).map((c) => c.peerBotName)).toEqual([
      "Analyst",
      "Scout",
    ]);
  });

  it("finds nothing in a thread with no peer traffic", () => {
    expect(peerConversations([plainText])).toEqual([]);
  });

  it("carries the files and images a bot attached while answering a peer", () => {
    const image = {
      kind: "image" as const,
      artifactId: "a_1",
      mimeType: "image/png",
      name: "chart.png",
    };
    const file = {
      kind: "file" as const,
      artifactId: "a_2",
      mimeType: "application/pdf",
      name: "q3.pdf",
      size: 2048,
    };
    const woken = {
      ...message("m_4", "2026-08-25T11:00:00.000Z", [
        { kind: "bot_message_received", fromBotId: "b_2", fromBotName: "Analyst", text: "send it" },
      ]),
      role: "user" as const,
      runId: "r_1",
    };
    const reply = {
      ...message("m_5", "2026-08-25T11:01:00.000Z", [
        { kind: "text", text: "Here it is" },
        image,
        file,
      ]),
      runId: "r_1",
    };
    const answer = {
      ...message("m_6", "2026-08-25T11:02:00.000Z", [
        { kind: "bot_message_sent", toBotId: "b_2", toBotName: "Analyst", text: "Here it is" },
      ]),
      runId: "r_1",
    };
    // A file from a run the person started is not part of any exchange.
    const ownFile = {
      ...message("m_7", "2026-08-25T11:03:00.000Z", [{ ...file, artifactId: "a_3" }]),
      runId: "r_2",
    };
    const conversation = peerConversations([woken, reply, answer, ownFile])[0];
    expect(
      conversation?.messages.map(({ direction, text, attachments }) => ({
        direction,
        text,
        attachments,
      })),
    ).toEqual([
      { direction: "received", text: "send it", attachments: [] },
      { direction: "sent", text: "", attachments: [image, file] },
      { direction: "sent", text: "Here it is", attachments: [] },
    ]);
  });
});
