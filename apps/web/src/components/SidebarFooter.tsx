import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
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
import { useLayoutEffect, useRef, useState } from "react";
import { useSidebarUpdate } from "./DesktopUpdates";

type Props = {
  name: string;
  initials: string | null;
  image?: string | null;
  logos?: Array<{ name: string; logo?: string | null }>;
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
};

// Marks are 24px wide, overlap by 6px, and need 2px for the outer ring.
export function sidebarMarkCount(availableWidth: number) {
  return Math.max(0, Math.min(3, Math.floor((availableWidth - 26) / 18) + 1));
}

export function SidebarFooter({
  name,
  initials,
  image,
  logos = [],
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
}: Props) {
  const { t } = useLingui();
  const update = useSidebarUpdate();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const pillRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [markCount, setMarkCount] = useState(3);
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const label = labelRef.current;
    if (!pill || !label || typeof ResizeObserver === "undefined") return;
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
  }, []);
  return (
    <div
      data-testid="sidebar-footer"
      className="flex shrink-0 items-center gap-2 bg-transparent px-4 pb-4 pt-2"
    >
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          data-testid="user-menu-trigger"
          aria-label={t`Account menu for ${name}`}
          className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-sidebar-accent text-sm font-medium text-foreground outline-none hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring"
        >
          {image && failedImage !== image ? (
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
      <Button
        variant="outline"
        ref={pillRef}
        onClick={onIntegrations}
        className="h-9 min-w-0 flex-1 justify-center gap-2 rounded-full border-border bg-card text-[15px] font-normal hover:bg-accent dark:bg-card dark:hover:bg-accent"
      >
        <span ref={labelRef} className="min-w-0 truncate">
          <Trans>Connect apps</Trans>
        </span>
        <span aria-hidden="true" className="flex shrink-0 items-center -space-x-1">
          {logos.slice(0, markCount).map((app) => (
            <span
              key={app.name}
              className="grid size-[18px] shrink-0 place-items-center overflow-hidden rounded-[5px] bg-muted text-[10px] font-medium text-foreground ring-2 ring-card"
            >
              {app.logo && !failedLogos.includes(app.logo) ? (
                <img
                  src={app.logo}
                  alt=""
                  className="size-full object-contain"
                  onError={() => setFailedLogos((failed) => [...failed, app.logo!])}
                />
              ) : (
                app.name[0]
              )}
            </span>
          ))}
        </span>
      </Button>
      {update.available ? (
        <Button
          size="icon-lg"
          className="rounded-full"
          aria-label={t`Install update`}
          title={t`Install update`}
          disabled={update.busy}
          onClick={update.install}
        >
          <Download aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
