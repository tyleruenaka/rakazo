import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rakazo/ui-web";
import {
  BookOpen,
  Download,
  FolderOpen,
  Gauge,
  LogOut,
  Settings,
  Smartphone,
  SquareKanban,
  UserRound,
} from "lucide-react";
import type { FocusEvent, HTMLAttributes } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useSidebarUpdate } from "./DesktopUpdates";

type Props = {
  name: string;
  initials: string | null;
  image?: string | null;
  logos?: Array<{ name: string; logo?: string | null }>;
  connectedCount?: number;
  email?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIntegrations: () => void;
  onBoard?: () => void;
  onArtifacts: () => void;
  onSettings: () => void;
  onUsage: () => void;
  onLogOut: () => void;
  signingOut: boolean;
  logOutError: string | null;
  /** Set while the collapsed rail covers the sidebar. */
  inert?: boolean;
};

// Marks are 18px wide (a 16px logo in a 1px ring) and overlap by 6px.
export function sidebarMarkCount(availableWidth: number) {
  return Math.max(0, Math.min(3, Math.floor((availableWidth - 18) / 12) + 1));
}

// As in Grok, enough connected apps put the name in its own pill and fold Connect apps to its logos.
const compactAt = 4;
const pillMotion = "duration-200 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none";
// Hovering the pill fans the stacked logos out.
const markFan = [
  "group-hover/button:-translate-x-[3px] group-hover/button:-rotate-8",
  "group-hover/button:-translate-y-px",
  "group-hover/button:translate-x-[3px] group-hover/button:rotate-8",
];

type Engaged = "account" | "connect" | null;

export function SidebarFooter({
  name,
  initials,
  image,
  logos = [],
  connectedCount = 0,
  email,
  open,
  onOpenChange,
  onIntegrations,
  onBoard,
  onArtifacts,
  onSettings,
  onUsage,
  onLogOut,
  signingOut,
  logOutError,
  inert,
}: Props) {
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const pillRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [markCount, setMarkCount] = useState(3);
  const [hovered, setHovered] = useState<Engaged>(null);
  const [focused, setFocused] = useState<Engaged>(null);
  const compact = connectedCount >= compactAt && logos.length > 0;
  const engaged = open ? "account" : (hovered ?? focused);
  const connectOpen = compact && engaged === "connect";
  const track = (kind: Exclude<Engaged, null>) => ({
    onPointerEnter: () => setHovered(kind),
    onPointerLeave: () => setHovered((current) => (current === kind ? null : current)),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const visible = event.currentTarget.matches(":focus-visible");
      setFocused((current) => (visible ? kind : current === kind ? null : current));
    },
    onBlur: () => setFocused((current) => (current === kind ? null : current)),
  });
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const label = labelRef.current;
    if (compact || !pill || !label || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const style = getComputedStyle(pill);
      const available =
        pill.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight) -
        label.scrollWidth -
        Number.parseFloat(style.columnGap);
      setMarkCount(sidebarMarkCount(available));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    observer.observe(label);
    measure();
    return () => observer.disconnect();
  }, [compact]);
  return (
    <div
      data-testid="sidebar-footer"
      inert={inert}
      className="flex shrink-0 items-center gap-2 bg-transparent px-4 pb-4 pt-2"
    >
      <AccountMenu
        name={name}
        initials={initials}
        image={image}
        email={email}
        open={open}
        onOpenChange={onOpenChange}
        onBoard={onBoard}
        onArtifacts={onArtifacts}
        onSettings={onSettings}
        onUsage={onUsage}
        onLogOut={onLogOut}
        signingOut={signingOut}
        logOutError={logOutError}
        pill={compact ? { expanded: !connectOpen, ...track("account") } : undefined}
      />
      <Button
        variant="outline"
        ref={pillRef}
        onClick={onIntegrations}
        data-expanded={connectOpen || undefined}
        {...track("connect")}
        className={cn(
          "h-9 min-w-9 justify-center text-[14px] font-medium text-foreground transition-[background-color,flex-grow,padding]",
          pillMotion,
          !compact
            ? "min-w-0 flex-1 gap-1.5 ps-4"
            : connectOpen
              ? "min-w-0 shrink grow gap-0 ps-4"
              : "grow-0 gap-0",
        )}
      >
        <span
          ref={labelRef}
          className={cn(
            "min-w-0 truncate",
            compact && cn("transition-[max-width,opacity]", pillMotion),
            compact && (connectOpen ? "max-w-[200px]" : "max-w-0 opacity-0"),
          )}
        >
          <Trans>Connect apps</Trans>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex shrink-0 items-center",
            compact && cn("transition-[margin-inline-start]", pillMotion),
            connectOpen && "ms-1.5",
          )}
        >
          {logos.slice(0, compact ? 3 : markCount).map((app, index) => (
            <span
              key={app.name}
              className={cn(
                "size-[18px] shrink-0 rounded-[6px] bg-card p-px transition-transform duration-300 ease-spring group-hover/button:bg-popover-accent motion-reduce:transition-none",
                index > 0 && "-ms-1.5",
                markFan[index],
              )}
            >
              <span className="grid size-full place-items-center overflow-hidden rounded-[4px] bg-muted text-[9px] font-medium text-foreground outline-[0.5px] -outline-offset-[0.5px] outline-input outline-solid">
                {app.logo && !failedLogos.includes(app.logo) ? (
                  <img
                    src={app.logo}
                    alt=""
                    className="size-full bg-favicon-plate object-contain p-px"
                    onError={() => setFailedLogos((failed) => [...failed, app.logo!])}
                  />
                ) : (
                  app.name[0]
                )}
              </span>
            </span>
          ))}
        </span>
      </Button>
      <SidebarUpdateButton />
    </div>
  );
}

/** Installs a downloaded desktop update; nothing until one is ready. */
export function SidebarUpdateButton({ className }: { className?: string }) {
  const { t } = useLingui();
  const update = useSidebarUpdate();
  if (!update.available) return null;
  return (
    <Button
      size="icon-lg"
      className={cn("rounded-full", className)}
      aria-label={t`Install update`}
      title={t`Install update`}
      disabled={update.busy}
      onClick={update.install}
    >
      <Download aria-hidden="true" />
    </Button>
  );
}

type AccountMenuProps = Omit<Props, "logos" | "onIntegrations" | "inert"> & {
  /** In the collapsed rail the avatar sits on a 54px hover square, as in Grok. */
  rail?: boolean;
  /** The avatar and name share a pill; the name folds away while Connect apps expands. */
  pill?: { expanded: boolean } & Pick<
    HTMLAttributes<HTMLElement>,
    "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur"
  >;
};

const accountAvatarClass =
  "grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-sidebar-accent text-sm font-medium text-foreground";

/** The account avatar and its menu, shared by the sidebar footer and the collapsed rail. */
export function AccountMenu({
  name,
  initials,
  image,
  email,
  open,
  onOpenChange,
  onBoard,
  onArtifacts,
  onSettings,
  onUsage,
  onLogOut,
  signingOut,
  logOutError,
  rail = false,
  pill,
}: AccountMenuProps) {
  const { t } = useLingui();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const avatar =
    image && failedImage !== image ? (
      <img
        src={image}
        alt=""
        className="size-full object-cover"
        onError={() => setFailedImage(image)}
      />
    ) : initials ? (
      initials
    ) : (
      <UserRound size={18} aria-hidden="true" />
    );
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {/* The hidden sidebar keeps its trigger mounted, so the rail's has its own test id. */}
      <DropdownMenuTrigger
        data-testid={rail ? "rail-user-menu-trigger" : "user-menu-trigger"}
        aria-label={t`Account menu for ${name}`}
        title={pill ? name : undefined}
        data-expanded={pill?.expanded || undefined}
        onPointerEnter={pill?.onPointerEnter}
        onPointerLeave={pill?.onPointerLeave}
        onFocus={pill?.onFocus}
        onBlur={pill?.onBlur}
        className={
          rail
            ? "grid size-[54px] shrink-0 place-items-center rounded-[12px] outline-none hover:bg-rail-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-solid focus-visible:outline-ring"
            : pill
              ? cn(
                  // The name wraps onto a hidden second row once the pill is too narrow for it.
                  "relative flex h-9 min-w-9 shrink-0 grow-0 basis-9 flex-wrap content-start items-center gap-y-9 overflow-hidden rounded-full bg-card text-foreground outline-none transition-[background-color,flex-grow,padding] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-input after:ring-inset hover:bg-popover-accent hover:after:ring-input-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring",
                  pillMotion,
                  pill.expanded && "shrink grow pe-[17px]",
                )
              : cn(
                  accountAvatarClass,
                  "outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring",
                )
        }
      >
        {rail ? (
          <span className={accountAvatarClass}>{avatar}</span>
        ) : pill ? (
          <>
            <span
              className={cn(accountAvatarClass, "border-0 bg-foreground/8 text-muted-foreground")}
            >
              {avatar}
            </span>
            <span
              className={cn(
                "min-w-0 grow basis-6 truncate text-start text-[14px] font-medium transition-[opacity,margin-inline-start]",
                pillMotion,
                pill.expanded ? "ms-2" : "opacity-0",
              )}
            >
              {name}
            </span>
          </>
        ) : (
          avatar
        )}
      </DropdownMenuTrigger>
      {open ? (
        <DropdownMenuContent
          side="top"
          sideOffset={4}
          align="start"
          className="w-[228px] max-w-[calc(100vw-69px)] px-[7.5px] *:shrink-0 data-closed:animate-none"
        >
          <div data-testid="account-menu-header" className="min-w-0 px-[7px] py-1.5 text-sm">
            <p className="truncate text-[13px]">{name}</p>
            {email && email !== name ? (
              <p className="truncate text-[13px] text-placeholder">{email}</p>
            ) : null}
          </div>
          <DropdownMenuSeparator className="mx-1.5" />
          <DropdownMenuItem className="px-[7px]" onClick={onUsage}>
            <Gauge />
            <Trans>Usage</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="px-[7px]"
            render={
              <a
                href={
                  /Android/i.test(navigator.userAgent)
                    ? "https://github.com/elie222/rakazo/releases/download/android/rakazo.apk"
                    : "https://apps.apple.com/app/rakazo/id6801531099"
                }
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Smartphone />
            <Trans>Get the mobile app</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="px-[7px]"
            render={
              <a
                href="https://github.com/elie222/rakazo/blob/main/docs/self-host.md"
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <BookOpen />
            <Trans>Docs</Trans>
          </DropdownMenuItem>
          {onBoard ? (
            <DropdownMenuItem className="px-[7px]" onClick={onBoard}>
              <SquareKanban />
              <Trans>Board</Trans>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="px-[7px]" onClick={onArtifacts}>
            <FolderOpen />
            <Trans>Artifacts</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem className="px-[7px]" aria-label={t`Settings`} onClick={onSettings}>
            <Settings />
            <Trans>Settings</Trans>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="mx-1.5" />
          {/* Stays open so a failed sign-out can say so below. */}
          <DropdownMenuItem
            className="px-[7px]"
            closeOnClick={false}
            disabled={signingOut}
            onClick={onLogOut}
          >
            <LogOut />
            <Trans>Log out</Trans>
          </DropdownMenuItem>
          {logOutError ? (
            <p role="alert" className="px-[7px] pt-1 pb-2 text-[13px] text-destructive">
              {logOutError}
            </p>
          ) : null}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
