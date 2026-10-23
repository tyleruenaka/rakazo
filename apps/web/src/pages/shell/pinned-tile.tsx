import { Trans } from "@lingui/react/macro";
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@rakazo/ui-web";
import type { ComponentProps, ReactNode, Ref } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Where a dragged bot would land on a row or tile: beside it, or nested under it. */
export type RosterDropMark = "before" | "after" | "nest";

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
  drop?: RosterDropMark | null;
};

/** Pinned tiles wrap in centered rows: two 95px tiles fit the sidebar, a third wraps. */
export function PinnedTileGrid({ label, children }: { label: string; children: ReactNode }) {
  // Grok grows and shrinks the pinned area over 0.3s when a slot wraps to a new row, so the
  // list below glides instead of jumping. The first measure applies without a transition.
  const [height, setHeight] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className={cn(
        "overflow-clip [overflow-clip-margin:4px]",
        height !== null &&
          "transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
      )}
      style={height !== null ? { height } : undefined}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: names the tile set; a fieldset is for form controls. */}
      <div
        ref={grid}
        role="group"
        aria-label={label}
        className="flex flex-wrap justify-center gap-1"
      >
        {children}
      </div>
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
  drop,
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
              "group/tile relative flex h-[115px] w-[95px] flex-col items-center rounded-[10px] px-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-solid focus-visible:outline-ring",
              active ? "bg-sidebar-accent" : "hover:bg-sidebar-hover",
              className,
            )}
          />
        }
      >
        <RosterDropIndicator mark={drop} vertical />
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
      <RosterHoverCard
        testId="pinned-tile-card"
        name={name}
        avatar={cardAvatar}
        unread={unread}
        line={cardLine}
      />
    </Tooltip>
  );
}

/**
 * A drop mark on a row or tile, in Grok's drop language: a hairline where the
 * bot lands (vertical between tiles), or the section-hover fill with a dashed
 * edge, Grok's "drop into" mark, for nesting.
 */
export function RosterDropIndicator({
  mark,
  vertical = false,
}: {
  mark: RosterDropMark | null | undefined;
  vertical?: boolean;
}) {
  if (!mark) return null;
  if (mark === "nest") {
    return (
      <span
        aria-hidden="true"
        data-roster-drop-mark="nest"
        className="pointer-events-none absolute inset-0 rounded-[10px] border border-dashed border-sidebar-drop-line bg-sidebar-drop"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-roster-drop-mark={mark}
      className={cn(
        "pointer-events-none absolute bg-sidebar-drop-line",
        vertical ? "inset-y-2 w-px" : "inset-x-0 h-px",
        vertical
          ? mark === "before"
            ? "-start-[2.5px]"
            : "-end-[2.5px]"
          : mark === "before"
            ? "-top-[2.5px]"
            : "-bottom-[2.5px]",
      )}
    />
  );
}

/** True one frame after mount, so an entering element can transition in. */
function useEntered() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return entered;
}

/**
 * The tile a dragged bot would become. It stays mounted for the whole drag and opens its slot
 * while the bot is over the pinned area, with Grok's timing: the slot widens over 0.3s
 * `(.2,0,0,1)` and the tile fades and scales in over 0.3s `(.1,.9,.2,1)`. Closed, its negative
 * margin cancels the grid gap so the other tiles don't move.
 */
export function PinnedTileSlot({
  open,
  name,
  label,
  avatar,
}: {
  open: boolean;
  name: string;
  label?: string | null;
  avatar: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="pinned-tile-slot"
      data-open={open ? "" : undefined}
      className={cn(
        "h-[115px] overflow-hidden motion-reduce:transition-none",
        open ? "w-[95px] scale-100 opacity-100" : "-mx-0.5 w-0 scale-[0.85] opacity-0",
      )}
      style={{
        transition:
          "width 300ms cubic-bezier(0.2,0,0,1), margin 300ms cubic-bezier(0.2,0,0,1), opacity 300ms cubic-bezier(0.1,0.9,0.2,1), scale 300ms cubic-bezier(0.1,0.9,0.2,1)",
      }}
    >
      <div className="flex w-[95px] flex-col items-center px-2">
        <span className="grid size-[72px] shrink-0 place-items-center">{avatar}</span>
        <span
          dir="auto"
          className="w-full truncate text-center text-[12px] leading-4 text-foreground"
        >
          {name}
        </span>
        {label ? (
          <span className="mt-1 max-w-full truncate rounded-[3px] border-[0.5px] border-chip-border bg-chip bg-clip-padding px-[2px] text-[11px] leading-[18px] text-sidebar-muted-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Grok's drag ghost: a tile card centered on the pointer, lifted slightly. Over
 * the pinned grid the card fades so the opening tile reads as the target. A
 * transparent shield under it keeps the arrow cursor and stops row hover fills.
 * `ref` is the positioned layer the drag moves; `announce` feeds screen readers.
 */
export function RosterDragGhost({
  ref,
  name,
  label,
  avatar,
  overPinned,
  announce,
}: {
  ref: Ref<HTMLDivElement>;
  name: string;
  label?: string | null;
  avatar: ReactNode;
  overPinned: boolean;
  announce: string;
}) {
  const lifted = useEntered();
  return createPortal(
    <>
      <div data-roster-shield="" className="fixed inset-0 z-[998] cursor-default" />
      <div
        ref={ref}
        aria-hidden="true"
        data-testid="roster-drag-ghost"
        className="pointer-events-none fixed top-0 left-0 z-[999]"
      >
        <div
          className={cn(
            "relative flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 px-2 py-1 transition-[scale] duration-200 ease-[cubic-bezier(0.2,0.9,0.3,1)] motion-reduce:transition-none",
            lifted && !overPinned ? "scale-[1.04]" : "scale-100",
          )}
        >
          <span
            className={cn(
              "absolute inset-0 -z-10 rounded-[10px] bg-popover shadow-popover transition-opacity duration-200 motion-reduce:transition-none dark:shadow-none",
              overPinned ? "opacity-0" : "opacity-90",
            )}
          />
          {avatar}
          <span
            dir="auto"
            className="w-full truncate text-center text-[13px] leading-4 text-foreground"
          >
            {name}
          </span>
          {label ? (
            <span className="max-w-full truncate rounded-[3px] border-[0.5px] border-chip-border bg-chip bg-clip-padding px-[4.5px] text-[11px] leading-[18px] text-sidebar-muted-foreground">
              {label}
            </span>
          ) : null}
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </>,
    document.body,
  );
}

/** Grok's hover card for a chat: its 16px icon, full name, and last message or status. */
export function RosterHoverCard({
  testId,
  name,
  avatar,
  unread,
  line,
}: {
  testId: string;
  name: string;
  avatar: ReactNode;
  unread: boolean;
  line: ReactNode;
}) {
  return (
    <TooltipContent
      side="right"
      sideOffset={8}
      data-testid={testId}
      className="pointer-events-none h-auto w-[260px] max-w-none flex-col items-stretch gap-0 rounded-[11px] border border-popover-border px-[9px] pt-[10px] pb-[9px] text-[13px]"
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="relative shrink-0">
          {avatar}
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
        {line}
      </span>
    </TooltipContent>
  );
}
