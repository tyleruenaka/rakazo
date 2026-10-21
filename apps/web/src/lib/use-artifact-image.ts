import { useEffect, useState } from "react";
import type { ArtifactTarget } from "./artifact-open";
import { decodeArtifactBase64 } from "./artifact-open";
import { rpc } from "./rpc";

type ImageDownload = {
  promise: Promise<string>;
  consumers: number;
  objectUrl: string | null;
  settled: boolean;
};

const downloads = new Map<string, ImageDownload>();

function releaseUnusedDownload(key: string, download: ImageDownload) {
  // Keep pending work reusable even if its original consumers leave.
  if (download.consumers || !download.settled) return;
  if (download.objectUrl) URL.revokeObjectURL(download.objectUrl);
  if (downloads.get(key) === download) downloads.delete(key);
}

function acquireDownload(key: string, load: () => Promise<Blob>) {
  let download = downloads.get(key);
  if (!download) {
    const entry: ImageDownload = {
      consumers: 0,
      objectUrl: null,
      settled: false,
      promise: load()
        .then((blob) => {
          entry.objectUrl = URL.createObjectURL(blob);
          return entry.objectUrl;
        })
        .catch((error) => {
          if (downloads.get(key) === entry) downloads.delete(key);
          throw error;
        })
        .finally(() => {
          entry.settled = true;
          releaseUnusedDownload(key, entry);
        }),
    };
    download = entry;
    downloads.set(key, download);
  }
  download.consumers++;
  const entry = download;
  return {
    promise: entry.promise,
    release: () => {
      entry.consumers--;
      releaseUnusedDownload(key, entry);
    },
  };
}

export function useArtifactImage(
  target: ArtifactTarget | undefined,
  artifactId: string,
  enabled = true,
) {
  const [src, setSrc] = useState<string | null>(null);
  const botId = target && "botId" in target ? target.botId : undefined;
  const groupId = target && "groupId" in target ? target.groupId : undefined;
  useEffect(() => {
    setSrc(null);
    if (!enabled || (!botId && !groupId)) return;
    let cancelled = false;
    const scope = botId ? { botId } : { groupId: groupId! };
    const key = JSON.stringify([botId ? "bot" : "group", botId ?? groupId, artifactId]);
    const download = acquireDownload(key, () =>
      rpc.artifacts.get({ ...scope, artifactId }).then(artifactBlob),
    );
    void download.promise
      .then((objectUrl) => {
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      download.release();
    };
  }, [artifactId, botId, groupId, enabled]);
  return src;
}

function artifactBlob(artifact: { contentBase64: string; mimeType: string }): Blob {
  const bytes = decodeArtifactBase64(artifact.contentBase64);
  return new Blob([new Uint8Array(bytes)], { type: artifact.mimeType });
}

const THUMBNAIL_CACHE = "rakazo-artifact-thumbnails-v1";
/** Shortest side in device pixels: covers a grid card at 2x without upscaling. */
const THUMBNAIL_EDGE = 480;

async function openThumbnailCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  return caches.open(THUMBNAIL_CACHE).catch(() => null);
}

/** Forget every stored thumbnail, e.g. when the user signs out. */
export async function clearArtifactThumbnails(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete(THUMBNAIL_CACHE).catch(() => false);
}

async function shrinkImage(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = THUMBNAIL_EDGE / Math.min(bitmap.width, bitmap.height);
    if (scale >= 1) {
      bitmap.close();
      return blob;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return blob;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) =>
      canvas.toBlob((small) => resolve(small ?? blob), "image/webp", 0.85),
    );
  } catch {
    return blob;
  }
}

/**
 * Small picture of the newest version of a space artifact, as listed on the Artifacts screen.
 * The server only serves whole files, so each version is downloaded once, shrunk, and kept in
 * Cache Storage; a version's bytes never change, so the cache needs no invalidation.
 */
export function useArtifactThumbnail(
  artifact: { id: string; version: number; versionCount: number },
  enabled = true,
) {
  const [src, setSrc] = useState<string | null>(null);
  const { id, version, versionCount } = artifact;
  useEffect(() => {
    setSrc(null);
    if (!enabled) return;
    let cancelled = false;
    const download = acquireDownload(JSON.stringify(["thumbnail", id, version]), async () => {
      const cache = await openThumbnailCache();
      const cacheKey = `/artifact-thumbnails/${encodeURIComponent(id)}/${version}`;
      const stored = await cache?.match(cacheKey);
      if (stored) return stored.blob();
      // Listed ids are the family root; later versions live under their own id.
      const latestId =
        versionCount > 1 ? ((await rpc.artifacts.listVersions({ familyId: id }))[0]?.id ?? id) : id;
      const thumbnail = await shrinkImage(
        artifactBlob(await rpc.artifacts.getById({ artifactId: latestId })),
      );
      await cache?.put(cacheKey, new Response(thumbnail)).catch(() => undefined);
      return thumbnail;
    });
    void download.promise
      .then((objectUrl) => {
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      download.release();
    };
  }, [id, version, versionCount, enabled]);
  return src;
}
