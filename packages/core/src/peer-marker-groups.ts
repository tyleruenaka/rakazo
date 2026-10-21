import type { ThreadItem, VoiceChatMessage } from "./voice-chat-groups.js";

export type PeerMarkerPeer = { id: string; name: string };

/**
 * Two or more bot-to-bot markers in a row, shown as one line. `fanout` is the user's bot
 * messaging several bots once each ("Messaged …"); anything else counts the messages
 * ("3 messages with …"). Peers are distinct, in the order they first appear.
 */
export type PeerMarkerGroup<T extends VoiceChatMessage = VoiceChatMessage> = {
  kind: "peerMarkers";
  /** The first marker's id, like the single row it replaces. */
  key: string;
  messages: T[];
  summary: { kind: "fanout" | "thread"; messageCount: number; peers: PeerMarkerPeer[] };
};

function markerOf(message: VoiceChatMessage) {
  for (const block of message.blocks) {
    if (block.kind === "bot_message_sent") {
      return { sent: true, peer: { id: block.toBotId, name: block.toBotName } };
    }
    if (block.kind === "bot_message_received") {
      return { sent: false, peer: { id: block.fromBotId, name: block.fromBotName } };
    }
  }
  return undefined;
}

function summarize(
  markers: NonNullable<ReturnType<typeof markerOf>>[],
): PeerMarkerGroup["summary"] {
  const peers = new Map<string, PeerMarkerPeer>();
  for (const marker of markers) {
    if (!peers.has(marker.peer.id)) peers.set(marker.peer.id, marker.peer);
  }
  const fanout =
    markers.every((marker) => marker.sent) && peers.size >= 2 && markers.length === peers.size;
  return {
    kind: fanout ? "fanout" : "thread",
    messageCount: markers.length,
    peers: [...peers.values()],
  };
}

/**
 * Merges each run of consecutive marker messages into one group. Any other item ends the run;
 * a run of one stays a plain message. `standalone` keeps a marker on its own row (and ends the
 * run), e.g. one whose folded replies expand right below it.
 */
export function groupPeerMarkers<T extends VoiceChatMessage>(
  items: ThreadItem<T>[],
  standalone: (message: T) => boolean = () => false,
): (ThreadItem<T> | PeerMarkerGroup<T>)[] {
  const out: (ThreadItem<T> | PeerMarkerGroup<T>)[] = [];
  let run: T[] = [];
  const flush = () => {
    const first = run[0];
    if (first && run.length >= 2) {
      const markers = run.flatMap((message) => markerOf(message) ?? []);
      out.push({ kind: "peerMarkers", key: first.id, messages: run, summary: summarize(markers) });
    } else if (first) {
      out.push({ kind: "message", message: first });
    }
    run = [];
  };
  for (const item of items) {
    if (item.kind === "message" && markerOf(item.message) && !standalone(item.message)) {
      run.push(item.message);
      continue;
    }
    flush();
    out.push(item);
  }
  flush();
  return out;
}
