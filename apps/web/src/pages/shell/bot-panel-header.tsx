import { t } from "@lingui/core/macro";
import type { Bot } from "@rakazo/contracts";
import { BOT_NAME_MAX_LENGTH, BOT_TITLE_MAX_LENGTH } from "@rakazo/contracts";
import { cn } from "@rakazo/ui-web";
import { useRef, useState } from "react";
import { errorText } from "../../lib/user-error";
import { AvatarStudioPopover } from "./avatar-studio-popover";

/**
 * Avatar, name, and label at the top of the bot panel. Name and label edit in place; the
 * avatar opens Avatar Studio below it.
 */
export function BotPanelHeader({
  bot,
  onSave,
}: {
  bot: Bot;
  onSave: (patch: { name?: string; title?: string; color?: string }) => Promise<void>;
}) {
  // Show a picked look at once and save picks in order, as bot settings do.
  const [color, setColor] = useState<string | null>(null);
  const colorSaves = useRef(Promise.resolve());

  function saveColor(next: string) {
    setColor(next);
    colorSaves.current = colorSaves.current
      .then(() => onSave({ color: next }))
      .catch(() => setColor(null));
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mt-3 grid h-20 place-items-center">
        <AvatarStudioPopover
          value={color ?? bot.color}
          identity={bot.id}
          status={bot.status}
          onChange={saveColor}
        />
      </div>
      <InlineBotField
        label={t`Name`}
        value={bot.name}
        maxLength={BOT_NAME_MAX_LENGTH}
        required
        onSave={(name) => onSave({ name })}
        className="mt-2 h-[29px] rounded-[8px] px-[11px] text-[16.5px] font-medium text-foreground"
      />
      <InlineBotField
        label={t`Title`}
        value={bot.title}
        maxLength={BOT_TITLE_MAX_LENGTH}
        onSave={(title) => onSave({ title })}
        className="mt-1 h-[18px] rounded-[4px] px-[6px] text-[11px] text-muted-foreground"
      />
    </div>
  );
}

/**
 * A text field that reads as plain text until hovered or focused. Blur and Enter save a
 * trimmed change; Escape, an unchanged value, or an empty required value save nothing.
 */
export function InlineBotField({
  label,
  value,
  maxLength,
  required = false,
  onSave,
  className,
}: {
  label: string;
  value: string;
  maxLength: number;
  required?: boolean;
  onSave: (value: string) => Promise<void>;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if ((required && !next) || next === value.trim()) return;
    setSaving(next);
    try {
      await onSave(next);
    } catch (err) {
      setError(errorText(err, t`Could not save`));
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <input
        aria-label={label}
        placeholder={required ? undefined : label}
        value={draft ?? saving ?? value}
        maxLength={maxLength}
        dir="auto"
        onFocus={() => {
          setError(null);
          setDraft(value);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.stopPropagation();
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
        onBlur={() => void commit()}
        className={cn(
          "field-sizing-content max-w-full truncate border-[0.5px] border-transparent bg-transparent text-center outline-none placeholder:text-placeholder hover:border-card hover:bg-inline-edit-hover focus:border-transparent focus:bg-inline-edit-hover",
          className,
        )}
      />
      {error ? (
        <p role="alert" className="mt-1 text-center text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
