import { isAttachmentAudioMimeType } from "@rakazo/contracts";
import { cn } from "@rakazo/ui-web";
import { File, FileAudio, FileCode, FileText, FileVideo, ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { artifactKind } from "../lib/artifact-kind";
import { useArtifactThumbnail } from "../lib/use-artifact-image";

type ThumbnailArtifact = {
  id: string;
  mimeType: string;
  version: number;
  versionCount: number;
};

/** Image artifacts show the picture itself; everything else shows its type icon. */
export function ArtifactThumbnail({
  artifact,
  iconSize,
  className,
}: {
  artifact: ThumbnailArtifact;
  iconSize: number;
  className?: string;
}) {
  const isImage = artifactKind(artifact.mimeType) === "image";
  const [visible, setVisible] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const src = useArtifactThumbnail(artifact, isImage && visible);

  // Fetch pictures only once they scroll near the viewport.
  useEffect(() => {
    if (!isImage) return;
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isImage]);

  return (
    <span
      ref={container}
      className={cn("grid shrink-0 place-items-center overflow-hidden", className)}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <ArtifactTypeIcon mimeType={artifact.mimeType} size={iconSize} />
      )}
    </span>
  );
}

function ArtifactTypeIcon({ mimeType, size }: { mimeType: string; size: number }) {
  const props = { size, strokeWidth: 1.5, "aria-hidden": true, className: "text-muted-foreground" };
  switch (artifactKind(mimeType)) {
    case "image":
      return <ImageIcon {...props} />;
    case "document":
      return <FileText {...props} />;
    case "code":
      return <FileCode {...props} />;
    case "media":
      return isAttachmentAudioMimeType(mimeType) ? (
        <FileAudio {...props} />
      ) : (
        <FileVideo {...props} />
      );
    default:
      return <File {...props} />;
  }
}
