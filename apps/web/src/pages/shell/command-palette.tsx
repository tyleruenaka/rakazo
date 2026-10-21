import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Bot } from "@rakazo/contracts";
import {
  BotAvatar,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Kbd,
} from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";

export function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  // platform is deprecated but still the most reliable Apple check in browsers.
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

function botSearchText(bot: Bot) {
  return `${bot.name} ${bot.title} ${bot.description} ${bot.preview}`.toLowerCase();
}

function botSubtitle(bot: Bot) {
  return bot.description.trim() || bot.preview.trim() || bot.title.trim();
}

function botTitleTag(bot: Bot) {
  const title = bot.title.trim();
  if (!title) return null;
  // Title is already the subtitle when there is no description/preview.
  if (!(bot.description.trim() || bot.preview.trim())) return null;
  return title;
}

export function CommandPalette({
  open,
  onOpenChange,
  bots,
  onSelectBot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bots: Bot[];
  onSelectBot: (botId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [modKey, setModKey] = useState("⌘");

  useEffect(() => {
    setModKey(isApplePlatform() ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filteredBots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return bots;
    return bots.filter((bot) => botSearchText(bot).includes(needle));
  }, [bots, search]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat) {
        return;
      }
      if (!/^[1-9]$/.test(event.key)) return;
      const bot = filteredBots[Number(event.key) - 1];
      if (!bot) return;
      event.preventDefault();
      onSelectBot(bot.id);
      onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredBots, onOpenChange, onSelectBot, open]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t`Switch bot`}
      description={t`Search bots and switch conversations`}
    >
      <Command
        shouldFilter={false}
        className="rounded-none bg-transparent p-0"
        data-testid="command-palette"
      >
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder={t`Search`}
          data-testid="command-palette-search"
        />
        <CommandList className="max-h-[404px] p-2" data-testid="command-palette-list">
          <CommandEmpty>
            <Trans>No bots</Trans>
          </CommandEmpty>
          <CommandGroup className="p-0 **:[[cmdk-group-items]]:flex **:[[cmdk-group-items]]:flex-col **:[[cmdk-group-items]]:gap-0.5">
            {filteredBots.map((bot, index) => {
              const subtitle = botSubtitle(bot);
              const titleTag = botTitleTag(bot);
              const shortcut = index < 9 ? `${modKey}${index + 1}` : null;
              return (
                <CommandItem
                  key={bot.id}
                  value={bot.id}
                  data-testid={`command-palette-bot-${bot.id}`}
                  onSelect={() => {
                    onSelectBot(bot.id);
                    onOpenChange(false);
                  }}
                  className="h-[49px] gap-2 rounded-[10px] px-2 py-0 data-selected:bg-palette-highlight"
                >
                  <BotAvatar color={bot.color} identity={bot.id} size={24} status={bot.status} />
                  <div className="min-w-0 flex-1 pt-px">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate leading-[18px] text-foreground" dir="auto">
                        {bot.name}
                      </span>
                      {titleTag ? (
                        <span className="max-w-[40%] shrink-0 truncate rounded-[3px] border-[0.5px] border-chip-border bg-chip bg-clip-padding px-[4.5px] text-[11px] leading-[17px] text-muted-foreground">
                          {titleTag}
                        </span>
                      ) : null}
                    </div>
                    {subtitle ? (
                      <div
                        className="truncate text-[12.8px] leading-[17px] text-muted-foreground"
                        dir="auto"
                      >
                        {subtitle}
                      </div>
                    ) : null}
                  </div>
                  {bot.unread ? (
                    <span
                      aria-hidden="true"
                      className="me-0.5 size-2 shrink-0 rounded-full bg-unread"
                    />
                  ) : null}
                  {shortcut ? (
                    <CommandShortcut className="tracking-normal">
                      <Kbd>{shortcut}</Kbd>
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export { isCommandPaletteHotkey } from "./command-palette-hotkey";
