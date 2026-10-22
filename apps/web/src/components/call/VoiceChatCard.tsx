import { useLingui } from "@lingui/react/macro";
import type { VoiceChatGroup } from "@rakazo/core";
import { callRequestBlock, speechFromBlocks, voiceChatDuration } from "@rakazo/core";
import { cn } from "@rakazo/ui-web";
import { PhoneIncoming, PhoneMissed, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { VoiceWaveIcon } from "../VoiceWaveIcon";

const TRANSCRIPT_MAX_HEIGHT = 210;
/** The open card's fill, its rule and the transcript move together; the fill fades faster. */
const MOVE = { transitionDuration: "380ms, 380ms, 120ms" };

function callClock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A finished call in the chat, as in Grok: one small centered row (icon, title and length)
 * that opens into a card with the call's transcript.
 */
export function VoiceChatCard({
  group,
  revealMessageId,
  onCallBack,
}: {
  group: VoiceChatGroup;
  revealMessageId?: string;
  onCallBack?: () => void;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  /** How far the hover pill sits in from each side, so it wraps just the row. */
  const [pillInset, setPillInset] = useState(0);
  const revealed =
    revealMessageId != null && group.messages.some((message) => message.id === revealMessageId);
  // A jump looks the row up in the same commit. Expand during render so the row exists,
  // and leave the card open after the request clears.
  if (revealed && !open) setOpen(true);

  useLayoutEffect(() => {
    const outer = frame.current;
    const inner = row.current;
    if (!outer || !inner) return;
    const measure = () => setPillInset(Math.max(0, (outer.offsetWidth - inner.offsetWidth) / 2));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  /** Present when the bot placed this call; the row then follows the call's outcome. */
  const request = callRequestBlock(group.messages[0]?.blocks);
  const seconds = voiceChatDuration(group);
  const ringing = request?.status === "ringing" && Date.parse(request.expiresAt) > Date.now();
  // A call that rang out reads as missed even before the server's ring-out lands.
  const missed =
    request?.status === "declined" ||
    request?.status === "missed" ||
    (request?.status === "ringing" && !ringing);
  const marker = group.marker?.blocks[0];
  const callTitle = marker?.kind === "voice_call" ? marker.title.trim() : "";
  const title = !request
    ? callTitle || t`Voice chat`
    : ringing
      ? t`Calling you…`
      : missed
        ? t`Missed call`
        : t`Incoming call`;
  const detail = ringing
    ? ""
    : request?.status === "declined"
      ? t`You declined`
      : missed
        ? ""
        : callClock(seconds);
  const reason = missed || ringing ? (request?.reason ?? "") : "";
  // The opening was spoken, not posted: show it as the call's first bot turn.
  const transcript = [
    ...(request && !missed && !ringing && request.opening
      ? [{ id: `${group.key}:opening`, role: "bot", text: request.opening }]
      : []),
    ...group.messages.map((message) => ({
      id: message.id,
      role: message.role,
      // The request and the marker are the card's own lines, never transcript turns.
      text:
        message === group.marker || callRequestBlock(message.blocks)
          ? ""
          : speechFromBlocks(message.blocks).trim(),
    })),
  ];
  const expandable = transcript.some((line) => line.text);
  const Icon = request ? (missed ? PhoneMissed : PhoneIncoming) : null;
  const label = detail ? `${title} · ${detail}` : title;

  return (
    <div
      data-testid="voice-chat-card"
      data-call-status={request?.status}
      className="mx-auto flex w-full max-w-[min(96%,720px,calc(100%-48px))] flex-col items-center gap-2"
    >
      <div
        ref={frame}
        data-expanded={open || undefined}
        className={cn("relative flex w-full min-w-0 flex-col items-center", open && "pb-3")}
      >
        <div
          aria-hidden="true"
          className={cn(
            "rk-call-tray pointer-events-none absolute bottom-0 rounded-[12px] bg-call-record transition-[inset,top,opacity] motion-reduce:transition-none",
            open ? "-top-1.5 opacity-100" : hovered ? "top-0 opacity-100" : "top-0 opacity-0",
          )}
          style={{ ...MOVE, insetInline: open ? 0 : pillInset }}
        />
        <div className={cn("relative w-full min-w-0", open && "px-[42px]")}>
          <div ref={row} className="mx-auto flex w-fit max-w-full min-w-0 items-center gap-0.5">
            <button
              type="button"
              aria-expanded={expandable ? open : undefined}
              aria-label={label}
              disabled={!expandable}
              onClick={() => setOpen((wasOpen) => !wasOpen)}
              onPointerEnter={() => setHovered(true)}
              onPointerLeave={() => setHovered(false)}
              onFocus={(event) => setHovered(event.currentTarget.matches(":focus-visible"))}
              onBlur={() => setHovered(false)}
              className={cn(
                "inline-flex h-6 min-w-0 items-center gap-1 rounded-full py-1 ps-1 pe-1.5 text-[12px] leading-4 outline-none transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default",
                missed ? "text-destructive" : "text-muted-foreground enabled:hover:text-foreground",
              )}
            >
              {Icon ? (
                <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <VoiceWaveIcon className="size-4 shrink-0" />
              )}
              <span className="flex min-w-0 items-baseline">
                <span className="min-w-0 truncate" dir="auto">
                  {title}
                </span>
                {detail ? (
                  <span className="shrink-0 whitespace-pre text-faint-foreground tabular-nums">
                    {` · ${detail}`}
                  </span>
                ) : null}
              </span>
            </button>
            {missed && onCallBack ? (
              <button
                type="button"
                onClick={onCallBack}
                className="inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[12px] leading-4 text-foreground transition-colors duration-[120ms] hover:bg-control focus-visible:outline-2 focus-visible:outline-ring"
              >
                {t`Call back`}
              </button>
            ) : null}
          </div>
          {open ? (
            <button
              type="button"
              aria-label={t`Close`}
              onClick={() => setOpen(false)}
              className="rk-call-record-close absolute end-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-control hover:text-foreground"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          ) : null}
          <div
            aria-hidden="true"
            className={cn(
              "rk-call-tray pointer-events-none absolute -bottom-[9px] h-[0.5px] bg-call-record-rule transition-[inset,opacity] motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDuration: "380ms, 120ms", insetInline: open ? 0 : pillInset }}
          />
        </div>
        <div
          aria-hidden={!open}
          inert={!open}
          className={cn(
            "rk-call-tray relative grid w-full min-w-0 transition-[grid-template-rows] duration-[380ms] motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "pointer-events-none grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-[9px]">
              <div
                className="rk-scroll mt-2.5 flex w-full flex-col items-start gap-2.5 overflow-y-auto px-4"
                style={{ maxHeight: TRANSCRIPT_MAX_HEIGHT }}
              >
                {transcript.map((line) =>
                  line.text ? (
                    <p
                      key={line.id}
                      data-message-id={open ? line.id : undefined}
                      dir="auto"
                      className={cn(
                        "w-fit max-w-[88%] select-text rounded-[18px] px-3 py-2 text-[14px] leading-[22px] wrap-anywhere",
                        line.role === "user"
                          ? "rk-user-bubble self-end bg-chat-user text-chat-user-foreground"
                          : "self-start bg-call-record-bot-turn text-foreground",
                      )}
                    >
                      {line.text}
                    </p>
                  ) : (
                    <span
                      key={line.id}
                      data-message-id={open ? line.id : undefined}
                      className="sr-only"
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {reason ? (
        <p
          className="max-w-full truncate text-center text-[12px] leading-4 text-muted-foreground"
          dir="auto"
        >
          {reason}
        </p>
      ) : null}
    </div>
  );
}
