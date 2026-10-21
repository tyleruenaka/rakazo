import { Trans, useLingui } from "@lingui/react/macro";
import type { Artifact } from "@rakazo/contracts";
import { Button, Dialog, DialogContent, DialogTitle } from "@rakazo/ui-web";
import { useEffect, useRef, useState } from "react";
import { ArtifactPreviewPane } from "../../components/ArtifactPreviewPane";
import { ArtifactThumbnail } from "../../components/ArtifactThumbnail";
import { formatRelativeTime } from "../../lib/relative-time";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

type LibraryItem = Artifact & { versionCount: number };

const PAGE_SIZE = 60;

/** The open bot's artifacts, newest first, as the right panel's Library tab. */
export function BotLibrary({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [previewing, setPreviewing] = useState<LibraryItem | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setItems(null);
    setNextCursor(null);
    setLoadError(null);
    setLoadingMore(false);
    void rpc.artifacts
      .listSpace({ botId, limit: PAGE_SIZE })
      .then((page) => {
        if (current !== generation.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (current === generation.current) {
          setLoadError(errorText(error, t`Could not load artifacts.`));
        }
      });
  }, [botId, t]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const current = generation.current;
    setLoadingMore(true);
    try {
      const page = await rpc.artifacts.listSpace({ botId, cursor: nextCursor, limit: PAGE_SIZE });
      if (current !== generation.current) return;
      setItems((loaded) => (loaded ?? []).concat(page.items));
      setNextCursor(page.nextCursor);
    } catch {
      // Keep what is loaded so Load more can be retried.
    } finally {
      if (current === generation.current) setLoadingMore(false);
    }
  }

  if (loadError || items?.length === 0) {
    return (
      <p className="mx-auto mt-[39px] max-w-[245px] text-center text-[13px] leading-[18px] text-caption">
        {loadError ?? <Trans>Files this Bot makes show up here</Trans>}
      </p>
    );
  }
  if (!items) return null;

  return (
    <div className="pt-5">
      <ul className="rounded-[12px] border-[0.5px] border-input bg-card p-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setPreviewing(item)}
              className="group flex h-9 w-full items-center gap-2 rounded-[8px] ps-2 pe-3 text-start outline-none hover:bg-card-hover focus-visible:bg-card-hover"
            >
              <ArtifactThumbnail
                artifact={item}
                iconSize={12}
                className="size-5 rounded-[4px] border-[0.5px] border-card-border"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" dir="auto">
                {item.name}
              </span>
              <span className="hidden shrink-0 text-[13px] text-description group-hover:inline group-focus-visible:inline">
                {formatRelativeTime(item.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {nextCursor ? (
        <div className="mt-2 flex justify-center">
          <Button variant="text" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
          </Button>
        </div>
      ) : null}
      <Dialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(85vh,900px)] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          {previewing ? (
            <>
              <DialogTitle className="sr-only">{previewing.name}</DialogTitle>
              <ArtifactPreviewPane artifactId={previewing.id} onClose={() => setPreviewing(null)} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
