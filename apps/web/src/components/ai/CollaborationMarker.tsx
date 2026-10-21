import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { PeerMarkerGroup, PeerMarkerPeer } from "@rakazo/core";
import {
  type AvatarStyle,
  BotAvatar,
  Button,
  botAvatarOutline,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GroupAvatar,
  type GroupAvatarMember,
  useAvatarStyle,
} from "@rakazo/ui-web";
import { ChevronDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";
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
    <PeerChip
      ariaLabel={ariaLabel}
      color={color}
      identity={identity}
      peer={peer}
      onClick={onClick}
    />
  );
  return (
    <div
      data-testid="peer-marker"
      className="flex min-h-6 w-full items-center justify-center gap-1"
    >
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

function PeerChip({
  ariaLabel,
  color,
  identity,
  peer,
  onClick,
}: {
  ariaLabel?: string;
  color: string;
  identity: string;
  peer: string;
  onClick: () => void;
}) {
  return (
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
}

/**
 * Grok's stack cut: the next disc's silhouette, grown by a 2px gap, punched out of a 16px disc.
 * The next disc starts 10px in; round discs (photos, robots) cut a circle.
 */
function stackCut(color: string, identity: string, avatarStyle: AvatarStyle): CSSProperties {
  const outline = botAvatarOutline(color, identity, avatarStyle);
  // A 4px stroke (in the outline's own units) grows the silhouette by 2px on every side.
  const stroke = outline ? (Number(outline.viewBox.split(" ")[2]) * 4) / 16 : 0;
  const hole = outline
    ? `<svg x="10" width="16" height="16" viewBox="${outline.viewBox}" overflow="visible">${outline.paths
        .map(
          (d) => `<path d="${d}" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round"/>`,
        )
        .join("")}</svg>`
    : `<circle cx="18" cy="8" r="10"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><mask id="c"><rect width="16" height="16" fill="#fff"/>${hole}</mask><rect width="16" height="16" mask="url(#c)"/></svg>`;
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}") no-repeat`;
  return { mask, WebkitMask: mask };
}

/**
 * Consecutive markers as one row, like Grok: "Messaged" or "N messages with", then one chip,
 * two chips joined by "and", or for three or more bots a stacked-avatar chip whose menu
 * opens any of the exchanges.
 */
export function CollaborationMarkerGroup({
  summary,
  peerColor,
  onOpen,
}: {
  summary: PeerMarkerGroup["summary"];
  peerColor: (botId: string) => string;
  onOpen: (peer: PeerMarkerPeer) => void;
}) {
  const { t } = useLingui();
  const avatarStyle = useAvatarStyle();
  const { peers } = summary;
  const label =
    summary.kind === "fanout" ? (
      <Trans>Messaged</Trans>
    ) : (
      <Plural value={summary.messageCount} one="# message with" other="# messages with" />
    );
  const chip = (peer: PeerMarkerPeer) => (
    <PeerChip
      key={peer.id}
      color={peerColor(peer.id)}
      identity={peer.id}
      peer={peer.name}
      onClick={() => onOpen(peer)}
    />
  );
  let chips: ReactNode;
  if (peers.length <= 2) {
    chips = peers.map((peer, index) => (
      <Fragment key={peer.id}>
        {index > 0 ? (
          <span className="text-placeholder">
            <Trans>and</Trans>
          </span>
        ) : null}
        {chip(peer)}
      </Fragment>
    ));
  } else {
    const count = peers.length;
    const stack = peers.slice(0, 3);
    chips = (
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="peer-group-chip"
          aria-label={t`${count} Bots, show list`}
          className={peerChipClass}
        >
          {/* Grok's stack: 16px discs 6px apart, each cut where the next one overlaps it. */}
          <span dir="ltr" className="flex shrink-0 items-center">
            {stack.map((peer, index) => {
              const next = stack[index + 1];
              return (
                <span
                  key={peer.id}
                  className={next ? "-mr-1.5 flex" : "flex"}
                  style={next ? stackCut(peerColor(next.id), next.id, avatarStyle) : undefined}
                >
                  <BotAvatar color={peerColor(peer.id)} identity={peer.id} size={16} />
                </span>
              );
            })}
          </span>
          <span className="truncate">
            <Trans>{count} Bots</Trans>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          aria-label={t`Bots in this exchange`}
          className="w-auto max-w-[320px]"
        >
          {peers.map((peer) => (
            <DropdownMenuItem key={peer.id} onClick={() => onOpen(peer)}>
              <BotAvatar color={peerColor(peer.id)} identity={peer.id} size={18} />
              <span dir="auto" className="min-w-0 truncate">
                {peer.name}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <div
      data-testid="peer-marker-group"
      className="flex min-h-6 w-full items-center justify-center gap-0.5 text-[12px] whitespace-nowrap text-muted-foreground"
    >
      <span>{label}</span>
      {chips}
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
