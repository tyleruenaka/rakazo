import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { ThreadMessage } from "@rakazo/contracts";
import { timeSeparatorIds } from "@rakazo/core";
import { BotAvatar, Button, parseBotAvatar, resolvePersonaColorDef } from "@rakazo/ui-web";
import { ArrowRightLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { loadPeerHistory } from "../lib/peer-history";
import { peerConversations } from "../lib/peer-messages";
import { rpc } from "../lib/rpc";
import { TimeSeparator } from "./shell/chat-context";

/**
 * View-only transcript of a bot-to-bot exchange, shown in the chat area like Grok's: the
 * sidebar and the bot panel stay, the pair pill replaces the name pill, Close Chat the composer.
 * Opened from a Messaged / Message from chip in the human thread.
 */
export function PeerMessagesOverlay({
  botId,
  botName,
  botColor,
  peerBotId,
  peerBotName: initialPeerBotName,
  peerBotColor,
  onClose,
}: {
  botId: string;
  botName: string;
  botColor: string;
  peerBotId: string;
  peerBotName: string;
  peerBotColor: string;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const [messages, setMessages] = useState<readonly ThreadMessage[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const conversation = useMemo(() => {
    if (!historyReady) return null;
    return peerConversations(messages).find((entry) => entry.peerBotId === peerBotId) ?? null;
  }, [historyReady, messages, peerBotId]);
  const peerBotName = conversation?.peerBotName ?? initialPeerBotName;
  const rows = useMemo(() => {
    const entries = (conversation?.messages ?? []).map((peerMessage, index) => ({
      id: `${peerMessage.messageId}-${index}`,
      createdAt: peerMessage.createdAt,
      peerMessage,
    }));
    const separators = timeSeparatorIds(entries);
    return entries.map((entry) => ({ ...entry, separator: separators.has(entry.id) }));
  }, [conversation]);

  useEffect(() => {
    const abort = new AbortController();
    setHistoryReady(false);
    setHistoryFailed(false);
    setMessages([]);
    void loadPeerHistory({
      signal: abort.signal,
      loadPage: (before, signal) =>
        rpc.threads.messages({ botId, before, includePeerRuns: true }, { signal }),
    })
      .then((loaded) => {
        if (abort.signal.aborted) return;
        setMessages(loaded);
        setHistoryReady(true);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        setHistoryFailed(true);
        setHistoryReady(true);
      });
    return () => {
      abort.abort();
    };
  }, [botId, reloadKey]);

  // The opener is hidden under this view: focus Close Chat, and hand focus back on close. The
  // opener is read in a layout effect, before the browser drops focus from the hidden chat, and
  // focused again after the view has left the DOM and the chat shows again.
  const openerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Keep the first opener: a re-run (React's dev double effects) would find Close Chat.
    openerRef.current ??=
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Open on the latest exchange.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && rows.length > 0) scroller.scrollTop = scroller.scrollHeight;
  }, [rows]);

  const speakers = {
    sent: { id: botId, name: botName, color: botColor },
    received: { id: peerBotId, name: peerBotName, color: peerBotColor },
  };

  return (
    <section
      data-peer-view=""
      data-testid="peer-conversation-view"
      aria-labelledby="peer-conversation-title"
      className="absolute inset-0 z-10 flex flex-col bg-background animate-in fade-in-0 duration-150"
    >
      <h2
        id="peer-conversation-title"
        aria-label={`${botName} · ${peerBotName}`}
        className="absolute start-1/2 top-2.5 z-10 flex h-10 max-w-[calc(100%-200px)] -translate-x-1/2 items-center gap-2.5 rounded-full border-[0.5px] border-card-border bg-card ps-[9.5px] pe-[15px] text-[12.5px] font-normal text-foreground shadow-[0_2px_12px_rgb(0_0_0/0.06)] dark:shadow-none rtl:translate-x-1/2"
      >
        <BotAvatar color={botColor} identity={botId} size={24} />
        <span className="min-w-0 truncate" dir="auto">
          {botName}
        </span>
        <ArrowRightLeft
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className="-ms-1 shrink-0 text-chat-placeholder"
        />
        <BotAvatar color={peerBotColor} identity={peerBotId} size={24} />
        <span className="min-w-0 truncate" dir="auto">
          {peerBotName}
        </span>
      </h2>

      {!historyReady ? (
        <div className="grid flex-1 place-items-center px-8 text-center text-[13.5px] text-muted-foreground/80">
          <Trans>Loading…</Trans>
        </div>
      ) : historyFailed ? (
        <div className="grid flex-1 place-items-center px-8 text-center text-[13.5px] text-muted-foreground/80">
          <div className="flex flex-col items-center gap-3">
            <Trans>Could not load this chat.</Trans>
            <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>
              <Trans>Retry now</Trans>
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="grid flex-1 place-items-center px-8 text-center text-[13.5px] text-muted-foreground/80">
          <Trans>No messages with {peerBotName} yet.</Trans>
        </div>
      ) : (
        <div
          ref={scrollRef}
          data-testid="peer-conversation-transcript"
          className="rk-scroll rk-peer-fade flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto ps-4 pe-2 pb-[54px] pt-[60px] [scrollbar-gutter:stable]"
        >
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
            {rows.map(({ id, peerMessage, separator, createdAt }) => {
              const speaker = speakers[peerMessage.direction];
              const color = resolvePersonaColorDef(
                speaker.id,
                parseBotAvatar(speaker.color, speaker.id).color,
              );
              return (
                <Fragment key={id}>
                  {separator ? (
                    <TimeSeparator createdAt={createdAt} locale={i18n.locale || "en"} />
                  ) : null}
                  <div
                    data-testid="peer-message"
                    className={`flex items-end gap-2 ${separator ? "mt-3" : ""}`}
                  >
                    <BotAvatar color={speaker.color} identity={speaker.id} size={22} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <div
                        className="rk-peer-name ps-3 text-[12px] leading-4"
                        style={
                          {
                            "--bot-name": color.light,
                            "--bot-accent": color.hex,
                          } as CSSProperties
                        }
                        dir="auto"
                      >
                        {speaker.name}
                      </div>
                      <div
                        className="w-fit max-w-[560px] rounded-[18px] bg-muted px-3 py-[7px] text-[14px] leading-[22px] text-foreground"
                        dir="auto"
                      >
                        <ChatMarkdown>{peerMessage.text}</ChatMarkdown>
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      <fieldset
        aria-label={t`This chat is view-only`}
        className="flex h-16 shrink-0 justify-center pt-3"
      >
        <Button
          ref={closeRef}
          variant="ghost"
          className="h-8 rounded-full border-0 bg-muted px-4 text-[14px] text-foreground hover:bg-accent"
          onClick={onClose}
        >
          <Trans>Close Chat</Trans>
        </Button>
      </fieldset>
    </section>
  );
}
