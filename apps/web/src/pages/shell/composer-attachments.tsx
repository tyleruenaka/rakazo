import { useLingui } from "@lingui/react/macro";
import { inferAttachmentMimeType } from "@rakazo/core";
import { cn } from "@rakazo/ui-web";
import { Play, X } from "lucide-react";
import { useState } from "react";
import {
  AttachmentCardAction,
  AttachmentSummary,
  attachmentCardClass,
  attachmentRevealClass,
} from "../../components/AttachmentCard";
import { ImagePreviewDialog } from "./message-cards";

type ComposerAttachment = { id: string; file: File; previewUrl?: string };

/**
 * Picked files inside the composer, above the text, in one row that scrolls sideways: images
 * and videos as square tiles, everything else as a file card.
 */
export function ComposerAttachments<T extends ComposerAttachment>({
  attachments,
  onRemove,
}: {
  attachments: readonly T[];
  onRemove: (attachment: T) => void;
}) {
  const { t } = useLingui();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const viewing = attachments.find((attachment) => attachment.id === viewingId);
  return (
    <div
      data-testid="composer-attachments"
      className="no-scrollbar -mx-3 -mt-2 -mb-[9px] flex basis-[calc(100%+24px)] flex-nowrap gap-2 overflow-x-auto px-3 py-1.5"
    >
      {attachments.map((attachment) => {
        const { name } = attachment.file;
        const mimeType =
          inferAttachmentMimeType(name, attachment.file.type) ?? attachment.file.type;
        const remove = () => onRemove(attachment);
        if (!attachment.previewUrl) {
          return (
            <div
              key={attachment.id}
              data-testid="composer-attachment-card"
              className={cn(
                attachmentCardClass,
                "w-[calc(50%-4px)] min-w-[220px] max-w-[354px] shrink-0",
              )}
            >
              <AttachmentSummary name={name} mimeType={mimeType} size={attachment.file.size} />
              <AttachmentCardAction aria-label={t`Remove ${name}`} onClick={remove}>
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </AttachmentCardAction>
            </div>
          );
        }
        return (
          <div
            key={attachment.id}
            data-testid="composer-attachment-tile"
            className="group/attachment relative size-18 shrink-0 overflow-hidden rounded-xl after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:border-[0.5px] after:border-attachment-border"
          >
            {mimeType.startsWith("image/") ? (
              <button
                type="button"
                aria-label={t`Open ${name}`}
                onClick={() => {
                  setViewingId(attachment.id);
                  setViewerOpen(true);
                }}
                className="size-full cursor-pointer"
              >
                <img src={attachment.previewUrl} alt="" className="size-full object-cover" />
              </button>
            ) : (
              <>
                <video
                  src={attachment.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  aria-label={name}
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid size-7 place-items-center rounded-full bg-media-play text-media-play-foreground">
                    <Play size={12} strokeWidth={0} fill="currentColor" aria-hidden="true" />
                  </span>
                </span>
              </>
            )}
            <button
              type="button"
              aria-label={t`Remove ${name}`}
              onClick={remove}
              className={cn(
                "absolute end-0.5 top-0.5 z-10 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground",
                attachmentRevealClass,
              )}
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {viewing?.previewUrl ? (
        <ImagePreviewDialog
          src={viewing.previewUrl}
          name={viewing.file.name}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
        />
      ) : null}
    </div>
  );
}
