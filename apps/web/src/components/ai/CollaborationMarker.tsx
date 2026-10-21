import { BotAvatar, Button, GroupAvatar, type GroupAvatarMember } from "@rakazo/ui-web";
import { ChevronDown } from "lucide-react";
import { LoadingState } from "./primitives";

/**
 * Lightweight peer event shown without exposing the exchanged message body. `replies` adds a
 * toggle for the peer run's folded replies.
 */
export function CollaborationMarker({
  ariaLabel,
  color,
  identity,
  label,
  onClick,
  replies,
}: {
  ariaLabel: string;
  color: string;
  identity: string;
  label: string;
  onClick: () => void;
  replies?: { expanded: boolean; label: string; onToggle: () => void };
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        data-testid="peer-receipt-chip"
        aria-label={ariaLabel}
        onClick={onClick}
        className="inline-flex h-4 max-w-full items-center gap-1.5 rounded-sm text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <BotAvatar color={color} identity={identity} size={16} />
        <span dir="auto" className="truncate">
          {label}
        </span>
      </button>
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
