import type { MessageBlock, ThreadMessage } from "@rakazo/contracts";

export interface PeerMessage {
  messageId: string;
  direction: "sent" | "received";
  peerBotId: string;
  peerBotName: string;
  text: string;
  /** Files and images the bot attached while answering the peer; the text is in `text`. */
  attachments: PeerAttachment[];
  createdAt: string;
}

export type PeerAttachment = Extract<MessageBlock, { kind: "file" | "image" }>;

export interface PeerConversation {
  peerBotId: string;
  peerBotName: string;
  messages: PeerMessage[];
  lastText: string;
  lastAt: string;
}

type PeerBlock = Extract<MessageBlock, { kind: "bot_message_sent" | "bot_message_received" }>;

export function isPeerBlock(block: MessageBlock): block is PeerBlock {
  return block.kind === "bot_message_sent" || block.kind === "bot_message_received";
}

function isPeerAttachment(block: MessageBlock): block is PeerAttachment {
  return block.kind === "file" || block.kind === "image";
}

export function peerMessagesFrom(messages: readonly ThreadMessage[]): PeerMessage[] {
  // A run woken by another bot's message answers that bot. Its reply text reaches the page as
  // the sent message; files and images the bot attached in the run only live in its own chat.
  const peerOfRun = new Map<string, { id: string; name: string }>();
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.kind === "bot_message_received" && message.runId && !peerOfRun.has(message.runId))
        peerOfRun.set(message.runId, { id: block.fromBotId, name: block.fromBotName });
    }
  }
  const collected: PeerMessage[] = [];
  for (const message of messages) {
    const peer = message.role === "bot" && message.runId ? peerOfRun.get(message.runId) : undefined;
    const attachments = peer ? message.blocks.filter(isPeerAttachment) : [];
    if (peer && attachments.length > 0) {
      collected.push({
        messageId: message.id,
        direction: "sent",
        peerBotId: peer.id,
        peerBotName: peer.name,
        text: "",
        attachments,
        createdAt: message.createdAt,
      });
    }
    for (const block of message.blocks) {
      if (!isPeerBlock(block)) continue;
      collected.push(
        block.kind === "bot_message_sent"
          ? {
              messageId: message.id,
              direction: "sent",
              peerBotId: block.toBotId,
              peerBotName: block.toBotName,
              text: block.text,
              attachments: [],
              createdAt: message.createdAt,
            }
          : {
              messageId: message.id,
              direction: "received",
              peerBotId: block.fromBotId,
              peerBotName: block.fromBotName,
              text: block.text,
              attachments: [],
              createdAt: message.createdAt,
            },
      );
    }
  }
  return collected;
}

/** One conversation per peer, most recently active first. */
export function peerConversations(messages: readonly ThreadMessage[]): PeerConversation[] {
  const byPeer = new Map<string, PeerConversation>();
  for (const peerMessage of peerMessagesFrom(messages)) {
    const existing = byPeer.get(peerMessage.peerBotId);
    if (existing) {
      existing.messages.push(peerMessage);
      // Names can change; the newest one wins.
      existing.peerBotName = peerMessage.peerBotName;
      // An attachments-only entry keeps the last words.
      existing.lastText = peerMessage.text || existing.lastText;
      existing.lastAt = peerMessage.createdAt;
      continue;
    }
    byPeer.set(peerMessage.peerBotId, {
      peerBotId: peerMessage.peerBotId,
      peerBotName: peerMessage.peerBotName,
      messages: [peerMessage],
      lastText: peerMessage.text,
      lastAt: peerMessage.createdAt,
    });
  }
  return [...byPeer.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
