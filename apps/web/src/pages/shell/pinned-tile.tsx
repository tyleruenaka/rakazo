import { Trans } from "@lingui/react/macro";
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@rakazo/ui-web";
import type { ComponentProps, ReactNode } from "react";

type PinnedTileProps = Omit<ComponentProps<"button">, "children" | "title"> & {
  name: string;
  /** Role chip; only bots with a title have one. */
  label?: string | null;
  /** 72px avatar, and the 16px one for the hover card. */
  avatar: ReactNode;
  cardAvatar: ReactNode;
  /** Last message, or the working/error status, shown in the hover card. */
  cardLine: ReactNode;
  unread: boolean;
  /** Open chat or drop target. */
  active: boolean;
  /** Marks the name for roster tests, as on rows. */
  botName: boolean;
};

/** Pinned tiles wrap in centered rows: two 95px tiles fit the sidebar, a third wraps. */
export function PinnedTileGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: names the tile set; a fieldset is for form controls.
    <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-1">
      {children}
    </div>
  );
}

/** A pinned chat drawn as a Grok-style tile; its hover card carries the full name and preview. */
export function PinnedTile({
  name,
  label,
  avatar,
  cardAvatar,
  cardLine,
  unread,
  active,
  botName,
  className,
  ...buttonProps
}: PinnedTileProps) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <button
            type="button"
            {...buttonProps}
            className={cn(
              "group/tile flex h-[115px] w-[95px] flex-col items-center rounded-[10px] px-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-solid focus-visible:outline-ring",
              active ? "bg-sidebar-accent" : "hover:bg-sidebar-hover",
              className,
            )}
          />
        }
      >
        <span className="relative grid size-[72px] shrink-0 place-items-center">
          {avatar}
          {unread ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute end-2 bottom-2 size-2.5 rounded-full bg-unread ring-2",
                active ? "ring-sidebar-accent" : "ring-sidebar group-hover/tile:ring-sidebar-hover",
              )}
            />
          ) : null}
        </span>
        <span
          dir="auto"
          data-roster-bot-name={botName ? "" : undefined}
          className="w-full truncate text-center text-[12px] leading-4 text-foreground"
        >
          {name}
        </span>
        {unread ? (
          <span className="sr-only">
            <Trans> (unread)</Trans>
          </span>
        ) : null}
        {label ? (
          <span className="mt-1 max-w-full truncate rounded-[3px] border-[0.5px] border-chip-border bg-chip bg-clip-padding px-[2px] text-[11px] leading-[18px] text-sidebar-muted-foreground">
            {label}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        data-testid="pinned-tile-card"
        className="pointer-events-none h-auto w-[260px] max-w-none flex-col items-stretch gap-0 rounded-[11px] border border-popover-border px-[9px] pt-[10px] pb-[9px] text-[13px]"
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="relative shrink-0">
            {cardAvatar}
            {unread ? (
              <span
                aria-hidden="true"
                className="absolute -end-px -bottom-px size-[5px] rounded-full bg-unread ring-2 ring-popover"
              />
            ) : null}
          </span>
          <span dir="auto" className="truncate font-medium leading-4">
            {name}
          </span>
        </span>
        <span dir="auto" className="mt-[5px] line-clamp-2 leading-[18px]">
          {cardLine}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
