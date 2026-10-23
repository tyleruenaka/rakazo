import { useLingui } from "@lingui/react/macro";
import type { ReplyPreview, ThreadMessage } from "@rakazo/contracts";
import { formatTimeSeparator, isPeerReceiptBlocks, replyLabel } from "@rakazo/core";
import { File, MessageCircleMore, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ArtifactTarget } from "../../lib/artifact-open";
import { useArtifactImage } from "../../lib/use-artifact-image";

function ReplyThumbnail({
  attachment,
  target,
  lazy = false,
}: {
  lazy?: boolean;
  attachment: NonNullable<ReplyPreview["attachment"]>;
  target: ArtifactTarget;
}) {
  const [visible, setVisible] = useState(!lazy);
  const container = useRef<HTMLSpanElement>(null);
  const src = useArtifactImage(target, attachment.artifactId, visible);
  useEffect(() => {
    if (!lazy) return;
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy]);
  return (
    <span
      ref={container}
      aria-hidden="true"
      className="size-4 shrink-0 overflow-hidden rounded-[4px] bg-muted"
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </span>
  );
}

export function TimeSeparator({ createdAt, locale }: { createdAt: string; locale: string }) {
  const { t } = useLingui();
  return (
    <h3
      data-testid="time-separator"
      className="mt-2 mb-0.5 select-none text-center text-xs font-normal text-muted-foreground"
    >
      {formatTimeSeparator(createdAt, locale, { today: t`Today`, yesterday: t`Yesterday` })}
    </h3>
  );
}

/** Marks where the messages the user hadn't seen yet begin. Sized like the time separator. */
export function UnreadDivider({ afterSeparator = false }: { afterSeparator?: boolean }) {
  const { t } = useLingui();
  return (
    <div
      data-testid="unread-divider"
      className={`flex select-none items-center gap-2.5 pb-1 ${afterSeparator ? "pt-0" : "pt-2"}`}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-unread opacity-40" />
      <span className="text-xs font-medium text-unread">
        <span aria-hidden="true">{t`New`}</span>
        <span className="sr-only">{t`New messages`}</span>
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-unread opacity-40" />
    </div>
  );
}

/** Ring-outlined reply pill shared by the composer and sent user replies. */
const replyPillClass =
  "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-start text-[12px] leading-4 text-reply-foreground outline-none ring-1 ring-inset ring-reply-ring transition-colors duration-[120ms] ease-[ease] hover:bg-reply-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
/** 20px ghost circle that cancels a reply or quote. */
const replyCancelClass =
  "grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-[120ms] ease-[ease] hover:bg-reply-hover hover:text-control-icon";

/** Cuts text to `max` characters, the last one an ellipsis. */
export function ellipsize(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Escape cancels from anywhere in the window. */
function useEscapeToDismiss(onDismiss: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);
}

function ReplyAttachmentIcon({
  attachment,
  target,
  lazy,
}: {
  attachment?: ReplyPreview["attachment"];
  target?: ArtifactTarget;
  lazy?: boolean;
}) {
  if (attachment?.kind === "image" && target)
    return <ReplyThumbnail attachment={attachment} target={target} lazy={lazy} />;
  if (attachment?.kind === "file")
    return <File size={14} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />;
  return null;
}

/** The replied message as a pill inside the composer; clicking it jumps to the message. */
export function ComposerReplyPreview({
  text,
  attachment,
  target,
  onJump,
  onDismiss,
}: {
  text: string;
  attachment?: ReplyPreview["attachment"];
  target?: ArtifactTarget;
  onJump?: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLingui();
  useEscapeToDismiss(onDismiss);
  const label = replyLabel(undefined, collapseWhitespace(text), attachment, {
    photo: t`Photo`,
    attachment: t`Attachment`,
  });
  const excerpt = label.slice(0, 120);
  return (
    <div
      data-testid="reply-chip"
      className="relative -mx-1 mb-[3.5px] min-w-0 basis-[calc(100%+8px)]"
    >
      <button
        type="button"
        aria-label={t`Jump to replied message: ${excerpt}`}
        // Keep the caret in the field.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onJump}
        className={`${replyPillClass} w-full ps-3 pe-7`}
        dir="auto"
      >
        <ReplyAttachmentIcon attachment={attachment} target={target} />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      <button
        type="button"
        aria-label={t`Cancel reply`}
        onClick={onDismiss}
        className={`absolute end-1 top-1 ${replyCancelClass}`}
      >
        <X size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

/** A selected-text quote at the start of the composer field. */
export function ComposerQuoteChip({ quote, onDismiss }: { quote: string; onDismiss: () => void }) {
  const { t } = useLingui();
  useEscapeToDismiss(onDismiss);
  const text = collapseWhitespace(quote);
  // The cancel button swaps in for the icon on hover or focus, so it takes no room of its own.
  const swap = "transition-opacity duration-[120ms] ease-[ease]";
  return (
    <span
      data-testid="quote-chip"
      title={text}
      className="group/quote me-0.5 inline-flex h-6 min-w-0 max-w-[170px] shrink-0 items-center gap-[5px] text-[14px] leading-5 text-foreground"
    >
      <span className="relative ms-0.5 grid size-[13px] shrink-0 place-items-center">
        <MessageCircleMore
          size={13}
          strokeWidth={1.6}
          aria-hidden="true"
          className={`${swap} group-focus-within/quote:opacity-0 group-hover/quote:opacity-0 [@media(hover:none)]:opacity-0`}
        />
        <button
          type="button"
          aria-label={t`Cancel reply`}
          onClick={onDismiss}
          className={`${swap} absolute -inset-1 grid place-items-center rounded-full text-muted-foreground opacity-0 outline-none hover:bg-reply-hover hover:text-control-icon focus-visible:bg-reply-hover focus-visible:opacity-100 group-hover/quote:opacity-100 [@media(hover:none)]:opacity-100`}
        >
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </span>
      <q className="block min-w-0 truncate" dir="auto">
        {ellipsize(text, 20)}
      </q>
    </span>
  );
}

/**
 * What a sent message replies to: an outlined pill above a user bubble ("sent") or a bubble-less
 * bot message ("above"), or a quoted first row inside a bot bubble ("in-bubble").
 */
export function ReplyLine({
  message,
  fallbackText,
  target,
  placement,
  onJump,
}: {
  message: ThreadMessage;
  fallbackText?: string;
  target?: ArtifactTarget;
  placement: "sent" | "above" | "in-bubble";
  onJump?: (id: string) => void;
}) {
  const { t } = useLingui();
  // Peer receipts use internal reply links for routing; their bodies belong in the peer view.
  if (isPeerReceiptBlocks(message.blocks)) return null;
  if (!message.replyToMessageId && message.replyQuote == null) return null;
  const inBubble = placement === "in-bubble";
  const className = inBubble
    ? "mb-1 flex h-[22px] max-w-full items-center gap-1 text-start text-[13px] leading-[18px] text-reply-foreground outline-none transition-colors duration-[120ms] ease-[ease] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    : `${replyPillClass} mb-1 w-fit max-w-[252px] ${placement === "sent" ? "ms-auto" : ""}`;
  const unavailable = message.replyPreview === null || !message.replyToMessageId;
  if (unavailable)
    return (
      <div data-testid="reply-parent-preview" className={`${className} pointer-events-none`}>
        <span className="min-w-0 truncate">{t`Original message unavailable`}</span>
      </div>
    );
  const attachment = message.replyPreview?.attachment;
  const previewText = message.replyPreview?.text || (attachment ? undefined : fallbackText);
  const text = replyLabel(
    message.replyQuote,
    previewText ? collapseWhitespace(previewText) : undefined,
    attachment,
    { photo: t`Photo`, attachment: t`Attachment` },
  );
  const excerpt = text.slice(0, 120);
  return (
    <button
      type="button"
      data-testid="reply-parent-preview"
      aria-label={t`Jump to replied message: ${excerpt}`}
      onClick={() => {
        if (message.replyToMessageId) onJump?.(message.replyToMessageId);
      }}
      className={className}
      dir="auto"
    >
      {inBubble ? (
        <MessageCircleMore
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className="-ms-0.5 shrink-0"
        />
      ) : null}
      <ReplyAttachmentIcon attachment={attachment} target={target} lazy />
      {inBubble ? (
        <q className="block min-w-0 truncate">{ellipsize(text, 56)}</q>
      ) : (
        <span className="min-w-0 truncate">{text}</span>
      )}
    </button>
  );
}
