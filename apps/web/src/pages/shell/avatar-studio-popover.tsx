import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import {
  BotAvatar,
  botAvatarFill,
  cn,
  DEFAULT_GROK_BOT_COLOR,
  defaultBotAvatarValue,
  GROK_BOT_COLORS,
  GrokShapePreview,
  Popover,
  PopoverContent,
  PopoverTrigger,
  parseBotAvatar,
} from "@rakazo/ui-web";
import { Pencil, Upload } from "lucide-react";
import type { ClipboardEvent, DragEvent } from "react";
import { useRef, useState } from "react";

export interface AvatarStudioPopoverProps {
  value: string;
  identity?: string;
  status?: string;
  size?: number;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AvatarStudioPopover({
  value,
  identity,
  status,
  size = 72,
  onChange,
  disabled = false,
}: AvatarStudioPopoverProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"bot" | "upload">("bot");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = parseBotAvatar(value, identity);
  const currentColor = parsed.color || DEFAULT_GROK_BOT_COLOR;
  const isDefaultLook = !parsed.isImage && parsed.shapeIndex === undefined;

  function selectShape(shapeIndex: number) {
    onChange(`${currentColor}::shape_${shapeIndex}`);
  }

  function selectColor(color: string) {
    if (parsed.shapeIndex === undefined) {
      onChange(color);
      return;
    }
    onChange(`${color}::shape_${parsed.shapeIndex}`);
  }

  function restoreDefaultAvatar() {
    const next = defaultBotAvatarValue(value);
    if (next !== value) onChange(next);
  }

  function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (!src) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const targetSize = 256;
        canvas.width = targetSize;
        canvas.height = targetSize;
        if (!ctx) return;

        ctx.beginPath();
        ctx.arc(targetSize / 2, targetSize / 2, targetSize / 2, 0, Math.PI * 2);
        ctx.clip();

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);

        onChange(canvas.toDataURL("image/webp", 0.9));
        setOpen(false);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  }

  function handlePaste(event: ClipboardEvent<HTMLButtonElement>) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item?.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) {
        processImageFile(file);
        break;
      }
    }
  }

  const tabClass = (active: boolean) =>
    cn(
      "h-[26px] rounded-full px-2 text-[13px] transition-colors",
      active ? "bg-card-hover text-foreground" : "text-description hover:text-foreground",
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="group relative grid cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t`Customize bot avatar`}
        data-testid="avatar-studio-trigger"
      >
        <span className="group-hover:brightness-30 group-data-popup-open:brightness-30">
          <BotAvatar color={value} identity={identity} size={size} status={status} />
        </span>
        <Pencil
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className="pointer-events-none absolute text-avatar-pencil opacity-0 group-hover:opacity-100 group-data-popup-open:opacity-100"
        />
      </PopoverTrigger>
      <PopoverContent
        sideOffset={2}
        aria-label={t`Avatar Studio`}
        className="w-[297px] gap-0 border-card-border p-0"
        data-testid="avatar-studio"
      >
        <div className="flex items-center justify-between border-b-[0.5px] border-card-border p-2">
          <div className="flex gap-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("bot")}
              aria-pressed={activeTab === "bot"}
              className={tabClass(activeTab === "bot")}
            >
              <Trans>Bot</Trans>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              aria-pressed={activeTab === "upload"}
              className={tabClass(activeTab === "upload")}
            >
              <Trans>Upload</Trans>
            </button>
          </div>
          <button type="button" onClick={restoreDefaultAvatar} className={tabClass(false)}>
            <Trans>Reset</Trans>
          </button>
        </div>

        {activeTab === "bot" ? (
          <div className="px-2 pt-3.5 pb-6" data-testid="avatar-studio-bot-tab">
            <div className="flex flex-wrap justify-center">
              <button
                type="button"
                data-testid="avatar-studio-default"
                aria-label={t`Default`}
                aria-pressed={isDefaultLook}
                onClick={restoreDefaultAvatar}
                className="flex size-14 items-center justify-center rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "rounded-full",
                    isDefaultLook &&
                      "ring-1 ring-input-focus ring-offset-[3px] ring-offset-popover",
                  )}
                >
                  <BotAvatar color={defaultBotAvatarValue(value)} identity={identity} size={40} />
                </span>
              </button>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((shapeIndex) => (
                <GrokShapePreview
                  key={shapeIndex}
                  shapeIndex={shapeIndex}
                  color={currentColor}
                  selected={!parsed.isImage && parsed.shapeIndex === shapeIndex}
                  onClick={() => selectShape(shapeIndex)}
                />
              ))}
            </div>
            <div className="mx-auto mt-[26px] flex w-[224px] flex-wrap justify-center gap-4">
              {GROK_BOT_COLORS.map((color) => {
                const selected =
                  currentColor.toLowerCase() === color.toLowerCase() && !parsed.isImage;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => selectColor(color)}
                    aria-label={t`Color ${color}`}
                    aria-pressed={selected}
                    className={cn(
                      "size-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "ring-1 ring-input-focus ring-offset-[3px] ring-offset-popover",
                    )}
                    style={{ backgroundColor: botAvatarFill(color) }}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-2">
            <button
              type="button"
              aria-label={t`Image upload area`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onPaste={handlePaste}
              onClick={() => fileInputRef.current?.click()}
              className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors ${
                dragOver
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted hover:border-foreground/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) processImageFile(file);
                }}
              />
              <div className="mb-2 grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
                <Upload size={18} strokeWidth={1.8} />
              </div>
              <p className="text-[12.5px] font-medium text-muted-foreground">
                <Trans>Drag, drop, or paste an image</Trans>
              </p>
              <span className="mt-3 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground">
                <Trans>Choose file</Trans>
              </span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
