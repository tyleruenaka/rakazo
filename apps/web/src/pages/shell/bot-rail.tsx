import { Trans, useLingui } from "@lingui/react/macro";
import type { RosterParentable } from "@rakazo/core";
import { nestRosterByParent } from "@rakazo/core";
import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@rakazo/ui-web";
import { Bell, Plus, Search } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Fragment } from "react";
import { RosterHoverCard } from "./pinned-tile";

export type RailGroup<T> = { key: string; pinned: boolean; items: T[] };

/**
 * The rail keeps the sidebar's group order without titles and drops empty groups.
 * Sub-bots follow their parent. The rail has no chevrons, so collapsed sections
 * and parents still list every chat there.
 */
export function railGroups<T extends RosterParentable>(
  groups: readonly { key: string; pinned: boolean; bots: readonly T[] }[],
): RailGroup<T>[] {
  return groups.flatMap((group) => {
    const items = nestRosterByParent(group.bots).map((row) => row.item);
    return items.length > 0 ? [{ key: group.key, pinned: group.pinned, items }] : [];
  });
}

type RailItemProps = Omit<ComponentProps<"button">, "children"> & {
  name: string;
  /** 40px avatar, and the 16px one for the hover card. */
  avatar: ReactNode;
  cardAvatar: ReactNode;
  /** Last message, or the working/error status, shown in the hover card. */
  cardLine: ReactNode;
  unread: boolean;
  selected: boolean;
};

/** One chat in the rail: its avatar on a 54px tile, with Grok's hover card. */
export function RailItem({
  name,
  avatar,
  cardAvatar,
  cardLine,
  unread,
  selected,
  className,
  ...props
}: RailItemProps) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-current={selected ? "page" : undefined}
            {...props}
            className={cn(
              "group/rail-item grid size-[54px] shrink-0 place-items-center rounded-[10px] outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-solid focus-visible:outline-ring",
              selected ? "bg-sidebar-accent" : "hover:bg-sidebar-hover",
              className,
            )}
          />
        }
      >
        <span className="relative size-10">
          {avatar}
          {unread ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute end-1 bottom-1 size-2 rounded-full bg-unread ring-2",
                selected
                  ? "ring-sidebar-accent"
                  : "ring-sidebar group-hover/rail-item:ring-sidebar-hover",
              )}
            />
          ) : null}
        </span>
        <span className="sr-only">
          {name}
          {unread ? <Trans> (unread)</Trans> : null}
        </span>
      </TooltipTrigger>
      <RosterHoverCard
        testId="rail-chat-card"
        name={name}
        avatar={cardAvatar}
        unread={unread}
        line={cardLine}
      />
    </Tooltip>
  );
}

const railButtonClass =
  "grid size-7 shrink-0 place-items-center rounded-full text-rail-icon outline-none hover:bg-rail-hover hover:text-rail-icon-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring";

function RailButton({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Grok's sidebar glyph: a wide rounded frame with a bar a quarter in. */
function SidebarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden="true"
    >
      <rect x="1" y="2.5" width="14" height="11" rx="2" />
      <path d="M4.5 2.5v11" />
    </svg>
  );
}

/** Grok's Connect apps glyph: a storefront with a scalloped awning. */
function StoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 6V3.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V6a2.25 2.25 0 0 1-4.5 0 2.5 2.5 0 0 1-5 0A2.25 2.25 0 0 1 1 6" />
      <path d="M2 7.85v6.65h12V7.85M8 11.5v3" />
    </svg>
  );
}

type BotRailProps<T> = {
  groups: RailGroup<T>[];
  renderItem: (item: T) => ReactNode;
  /** Window controls on desktop. */
  chrome: ReactNode;
  onExpand: () => void;
  onSearch: () => void;
  activityMode: boolean;
  onActivity: () => void;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  createMenu: ReactNode;
  onConnectApps: () => void;
  /** Desktop update install button, when one is ready. */
  update: ReactNode;
  account: ReactNode;
};

/**
 * The collapsed bots sidebar: Grok's column of avatars, then its quiet icons. It
 * covers the sidebar once that is 130px or narrower, so it takes over mid-animation.
 */
export function BotRail<T>({
  groups,
  renderItem,
  chrome,
  onExpand,
  onSearch,
  activityMode,
  onActivity,
  createOpen,
  onCreateOpenChange,
  createMenu,
  onConnectApps,
  update,
  account,
}: BotRailProps<T>) {
  const { t } = useLingui();
  return (
    <nav
      aria-label={t`Bots`}
      data-testid="bots-rail"
      className="absolute inset-0 z-10 hidden flex-col bg-sidebar @max-[130px]/sidebar:flex"
    >
      <div className="app-drag flex h-12 shrink-0 items-start ps-[18px] pt-3">{chrome}</div>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto [scrollbar-width:none]">
        {groups.map((group, index) => (
          <Fragment key={group.key}>
            {index > 0 ? (
              <div
                aria-hidden="true"
                data-rail-divider=""
                className={cn(
                  "w-[54px] shrink-0 border-t-[0.5px] border-rail-divider",
                  groups[index - 1]?.pinned ? "mt-2.5 mb-4" : "mt-3 mb-1.5",
                )}
              />
            ) : null}
            <div data-rail-group={group.key} className="flex flex-col gap-1">
              {group.items.map(renderItem)}
            </div>
          </Fragment>
        ))}
      </div>
      <div className="flex shrink-0 flex-col items-center py-2">
        <RailButton
          label={t`Show bots`}
          trigger={
            <button
              type="button"
              data-testid="restore-bots-sidebar"
              aria-label={t`Show bots`}
              onClick={onExpand}
              className={railButtonClass}
            />
          }
        >
          <SidebarIcon />
        </RailButton>
        <RailButton
          label={t`Search`}
          trigger={
            <button
              type="button"
              aria-label={t`Search`}
              onClick={onSearch}
              className={railButtonClass}
            />
          }
        >
          <Search size={18} strokeWidth={5 / 3} aria-hidden="true" />
        </RailButton>
        <RailButton
          label={t`Activity`}
          trigger={
            <button
              type="button"
              aria-label={t`Activity`}
              aria-pressed={activityMode}
              onClick={onActivity}
              className={cn(railButtonClass, activityMode && "text-rail-icon-hover")}
            />
          }
        >
          <Bell
            size={18}
            strokeWidth={5 / 3}
            fill={activityMode ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </RailButton>
        <Popover open={createOpen} onOpenChange={onCreateOpenChange}>
          <RailButton
            label={t`Create`}
            trigger={
              <PopoverTrigger
                aria-label={t`Create`}
                data-testid="rail-create-menu-trigger"
                className={railButtonClass}
              />
            }
          >
            <Plus strokeWidth={1.5} className="size-5" aria-hidden="true" />
          </RailButton>
          {/* Unmount with the state change so the panel it opens never coexists with the menu. */}
          {createOpen ? (
            <PopoverContent
              side="top"
              align="start"
              className="w-auto gap-0 overflow-hidden p-0 data-closed:animate-none"
            >
              {createMenu}
            </PopoverContent>
          ) : null}
        </Popover>
        <div className="mt-1.5">
          <RailButton
            label={t`Connect apps`}
            trigger={
              <button
                type="button"
                aria-label={t`Connect apps`}
                onClick={onConnectApps}
                className={railButtonClass}
              />
            }
          >
            <StoreIcon />
          </RailButton>
        </div>
        {update}
        <div className="mt-1.5">{account}</div>
      </div>
    </nav>
  );
}
