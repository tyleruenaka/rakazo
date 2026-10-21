import type { ArtifactWithContent } from "@rakazo/contracts";
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

function acquireDownload(key: string, load: () => Promise<ArtifactWithContent>) {
  let download = downloads.get(key);
  if (!download) {
    const entry: ImageDownload = {
      consumers: 0,
      objectUrl: null,
      settled: false,
      promise: load()
        .then((artifact) => {
          const bytes = decodeArtifactBase64(artifact.contentBase64);
          entry.objectUrl = URL.createObjectURL(
            new Blob([new Uint8Array(bytes)], { type: artifact.mimeType }),
          );
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
    const download = acquireDownload(key, () => rpc.artifacts.get({ ...scope, artifactId }));
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

/** Image of the newest version of a space artifact, as listed on the Artifacts screen. */
export function useLatestArtifactImage(
  artifact: { id: string; version: number; versionCount: number },
  enabled = true,
) {
  const [src, setSrc] = useState<string | null>(null);
  const { id, version, versionCount } = artifact;
  useEffect(() => {
    setSrc(null);
    if (!enabled) return;
    let cancelled = false;
    // Listed ids are the family root; later versions live under their own id.
    const download = acquireDownload(JSON.stringify(["space", id, version]), async () => {
      const latestId =
        versionCount > 1 ? ((await rpc.artifacts.listVersions({ familyId: id }))[0]?.id ?? id) : id;
      return rpc.artifacts.getById({ artifactId: latestId });
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
