import { Trans } from "@lingui/react/macro";
import { BotAvatar, Button, GroupAvatar, type GroupAvatarMember } from "@rakazo/ui-web";
import { ChevronDown } from "lucide-react";
import { LoadingState } from "./primitives";

/** The bot-to-bot exchange chip: a pill that fills on hover and keyboard focus, like Grok. */
const peerChipClass =
  "inline-flex h-6 min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-full py-1 ps-1 pe-1.5 text-[12px] text-muted-foreground outline-none transition-colors duration-[120ms] ease-[ease] hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground active:bg-accent";

/**
 * Lightweight peer event shown without exposing the exchanged message body: "Messaged" or
 * "Message from" and a chip with the peer's avatar and name that opens the exchange.
 * `replies` adds a toggle for the peer run's folded replies.
 */
export function CollaborationMarker({
  ariaLabel,
  color,
  identity,
  peer,
  sent,
  onClick,
  replies,
}: {
  ariaLabel: string;
  color: string;
  identity: string;
  peer: string;
  sent: boolean;
  onClick: () => void;
  replies?: { expanded: boolean; label: string; onToggle: () => void };
}) {
  const chip = (
    <button
      type="button"
      data-testid="peer-receipt-chip"
      aria-label={ariaLabel}
      title={peer}
      onClick={onClick}
      className={peerChipClass}
    >
      <BotAvatar color={color} identity={identity} size={16} />
      <span dir="auto" className="truncate">
        {peer}
      </span>
    </button>
  );
  return (
    <div className="flex min-h-6 items-center justify-center gap-1">
      <span className="flex min-w-0 items-center gap-0.5 text-[12px] whitespace-nowrap text-muted-foreground">
        {sent ? <Trans>Messaged {chip}</Trans> : <Trans>Message from {chip}</Trans>}
      </span>
      {replies ? (
        <Button
          variant="ghost"
          size="icon-xs"
          data-testid="peer-replies-toggle"
          aria-expanded={replies.expanded}
          aria-label={replies.label}
          onClick={replies.onToggle}
          className="size-4 rounded-full text-muted-foreground"
        >
          <ChevronDown
            size={14}
            strokeWidth={1.8}
            className={
              replies.expanded
                ? "size-3.5 transition-transform"
                : "size-3.5 -rotate-90 transition-transform"
            }
            aria-hidden="true"
          />
        </Button>
      ) : null}
    </div>
  );
}

export function ActiveBotGlyph({ bots, label }: { bots: GroupAvatarMember[]; label: string }) {
  return (
    <div className="flex min-h-10 items-center px-1">
      <LoadingState indicator={<GroupAvatar members={bots} size={28} />} label={label} />
    </div>
  );
}
