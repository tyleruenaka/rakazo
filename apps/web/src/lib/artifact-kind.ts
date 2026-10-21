import { isAttachmentAudioMimeType, isAttachmentImageMimeType } from "@rakazo/contracts";

/** Groups the attachment MIME types Rakazo stores into the Artifacts type filter. */
export type ArtifactKind = "image" | "document" | "code" | "media" | "other";

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  "image",
  "document",
  "code",
  "media",
  "other",
];

const DOCUMENT_MIME_TYPES = new Set(["application/pdf", "text/markdown", "text/plain", "text/csv"]);
const CODE_MIME_TYPES = new Set(["text/html", "application/json"]);

export function artifactKind(mimeType: string): ArtifactKind {
  if (isAttachmentImageMimeType(mimeType)) return "image";
  if (DOCUMENT_MIME_TYPES.has(mimeType)) return "document";
  if (CODE_MIME_TYPES.has(mimeType)) return "code";
  if (isAttachmentAudioMimeType(mimeType) || mimeType === "video/mp4") return "media";
  return "other";
}

export function filterArtifactsByKind<T extends { mimeType: string }>(
  items: readonly T[],
  kind: ArtifactKind | "all",
): T[] {
  return kind === "all" ? [...items] : items.filter((item) => artifactKind(item.mimeType) === kind);
}
