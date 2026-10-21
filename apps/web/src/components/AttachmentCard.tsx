import { i18n } from "@lingui/core";
import { isAttachmentAudioMimeType } from "@rakazo/contracts";
import { cn } from "@rakazo/ui-web";
import { Archive, AudioLines, Grid3x3, Play, TextAlignStart } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/** Byte sizes as "35B", "9.7kB", "18kB", "1.2MB": one decimal under 10 kB, binary units. */
export function formatAttachmentSize(size: number) {
  const format = (value: number, unit: string, digits: number) =>
    new Intl.NumberFormat(i18n.locale || "en", {
      style: "unit",
      unit,
      unitDisplay: "narrow",
      maximumFractionDigits: digits,
    }).format(value);
  if (size < 1024) return format(size, "byte", 0);
  if (size < 1024 * 1024) return format(size / 1024, "kilobyte", size < 10 * 1024 ? 1 : 0);
  return format(size / (1024 * 1024), "megabyte", 1);
}

/** A page-shaped type icon; PDFs and spreadsheets carry a colored band along the bottom. */
export function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const glyph = { size: 18, strokeWidth: 2, "aria-hidden": true } as const;
  const band =
    mimeType === "application/pdf" ? "bg-file-pdf" : mimeType === "text/csv" ? "bg-file-sheet" : "";
  return (
    <span className="grid size-10 shrink-0 place-items-center">
      <span className="flex h-10 w-8 flex-col overflow-hidden rounded-md border-[0.5px] border-file-icon-border bg-file-icon text-file-icon-glyph">
        <span className="grid flex-1 place-items-center">
          {mimeType === "text/csv" ? (
            <Grid3x3 {...glyph} />
          ) : mimeType === "application/zip" ? (
            <Archive {...glyph} />
          ) : isAttachmentAudioMimeType(mimeType) ? (
            <AudioLines {...glyph} />
          ) : mimeType === "video/mp4" ? (
            <Play {...glyph} />
          ) : (
            <TextAlignStart {...glyph} />
          )}
        </span>
        {band ? <span data-testid="file-icon-band" className={cn("h-3 shrink-0", band)} /> : null}
      </span>
    </span>
  );
}

/** Name with the extension kept visible when the rest truncates. */
function AttachmentName({ name }: { name: string }) {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  return (
    <span dir="auto" className="flex min-w-0 text-[14px] leading-5 font-medium text-foreground">
      <span className="truncate">{base}</span>
      {extension ? <span className="shrink-0">{extension}</span> : null}
    </span>
  );
}

/** Type icon, name and size; the shared body of every attached-file card. */
export function AttachmentSummary({
  name,
  mimeType,
  size,
}: {
  name: string;
  mimeType: string;
  size: number;
}) {
  return (
    <>
      <FileTypeIcon mimeType={mimeType} />
      <span className="flex min-w-0 flex-1 flex-col gap-px text-start">
        <AttachmentName name={name} />
        <span className="text-[13px] leading-4 text-muted-foreground">
          {formatAttachmentSize(size)}
        </span>
      </span>
    </>
  );
}

export const attachmentCardClass =
  "rk-attachment-card group/attachment flex h-[72px] items-center gap-2.5 rounded-[22px] bg-attachment p-4 text-foreground";

/** Shown only while the card is hovered or holds focus, or always on touch screens. */
export const attachmentRevealClass =
  "opacity-0 transition-[opacity,background-color,color] duration-[120ms] ease-out group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100 [@media(hover:none)]:opacity-100";

/** The 32px ghost circle at a card's trailing edge (remove in the composer, download when sent). */
export function AttachmentCardAction({
  className,
  children,
  ...props
}: ComponentProps<"button"> & { children: ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "me-1 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:bg-muted",
        attachmentRevealClass,
        className,
      )}
    >
      {children}
    </button>
  );
}
