import { Trans, useLingui } from "@lingui/react/macro";
import type { Artifact, Bot } from "@rakazo/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  BotAvatar,
  Button,
  cn,
  NativeSelect,
  NativeSelectOption,
} from "@rakazo/ui-web";
import { ChevronLeft, Filter, LayoutGrid, List, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactPreviewPane } from "../components/ArtifactPreviewPane";
import { ArtifactThumbnail } from "../components/ArtifactThumbnail";
import { IconTooltip } from "../components/IconTooltip";
import type { ArtifactKind } from "../lib/artifact-kind";
import { ARTIFACT_KINDS, filterArtifactsByKind } from "../lib/artifact-kind";
import { takeInitialBootstrap } from "../lib/bootstrap";
import { desktopBridge } from "../lib/desktop";
import { formatRelativeTime } from "../lib/relative-time";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { WindowChrome } from "./WindowChrome";

type ViewMode = "grid" | "list";
type DateFilter = "all" | "today" | "week" | "month";
const VIEW_MODE_STORAGE_KEY = "rakazo:artifacts-view-mode";
const LIST_PAGE_SIZE = 60;

type ArtifactSummary = Artifact & { versionCount: number };

function readViewMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function writeViewMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Preference only; ignore storage failures.
  }
}

function matchesCalendarDateFilter(iso: string, filter: DateFilter, now: Date): boolean {
  if (filter === "all") return true;
  const date = new Date(iso);
  if (filter === "today") return date.toDateString() === now.toDateString();
  if (filter === "week") {
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    return date >= startOfWeek;
  }
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function ArtifactsPage() {
  const { artifactId } = useParams<{ artifactId?: string }>();
  const navigate = useNavigate();
  const { t } = useLingui();
  const [bots, setBots] = useState<Bot[]>([]);
  const [items, setItems] = useState<ArtifactSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const listingGenerationRef = useRef(0);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [kindFilter, setKindFilter] = useState<ArtifactKind | "all">("all");
  const kindLabels: Record<ArtifactKind, string> = {
    image: t`Images`,
    document: t`Documents`,
    code: t`Code`,
    media: t`Media`,
    other: t`Other`,
  };
  const [maximized, setMaximized] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ArtifactSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void takeInitialBootstrap().then((bootstrap) => setBots(bootstrap.bots));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listingGenerationRef.current += 1;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setItems(null);
    setLoadError(null);
    setNextCursor(null);
    void rpc.artifacts
      .listSpace({ botId: activeBotId ?? undefined, limit: LIST_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(errorText(error, t`Could not load artifacts.`));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeBotId, t]);

  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return;
    const generation = listingGenerationRef.current;
    const listingChanged = () => generation !== listingGenerationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await rpc.artifacts.listSpace({
        botId: activeBotId ?? undefined,
        cursor: nextCursor,
        limit: LIST_PAGE_SIZE,
      });
      if (listingChanged()) return;
      setItems((current) => (current ?? []).concat(page.items));
      setNextCursor(page.nextCursor);
    } catch {
      // Keep the current page so Load more can be retried.
    } finally {
      if (!listingChanged()) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    setMaximized(false);
  }, [artifactId]);

  useEffect(() => {
    if (!artifactId) return;
    // Menus and the delete confirmation take Escape first and mark it handled.
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) {
        navigate("/app/artifacts");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [artifactId, navigate]);

  const botsById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots]);

  const filteredItems = useMemo(() => {
    if (!items) return null;
    const now = new Date();
    const query = searchQuery.trim().toLowerCase();
    return filterArtifactsByKind(items, kindFilter).filter((item) => {
      if (!matchesCalendarDateFilter(item.createdAt, dateFilter, now)) return false;
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        (item.description?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [items, searchQuery, dateFilter, kindFilter]);

  const clientFilterActive =
    searchQuery.trim().length > 0 || dateFilter !== "all" || kindFilter !== "all";
  const autoFetchedCursorRef = useRef<string | null>(null);

  useEffect(() => {
    autoFetchedCursorRef.current = null;
  }, [searchQuery, dateFilter, kindFilter, activeBotId]);

  // Search, date and type filters only see loaded pages, so keep paging until something matches.
  useEffect(() => {
    if (!clientFilterActive || !nextCursor || loadingMore || items === null) return;
    if (filteredItems && filteredItems.length > 0) return;
    if (autoFetchedCursorRef.current === nextCursor) return;
    autoFetchedCursorRef.current = nextCursor;
    void loadMore();
  }, [clientFilterActive, nextCursor, loadingMore, items, filteredItems]);

  function setMode(mode: ViewMode) {
    setViewMode(mode);
    writeViewMode(mode);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await rpc.artifacts.remove({ artifactId: pendingDelete.id });
      setItems((current) => current?.filter((item) => item.id !== pendingDelete.id) ?? current);
      if (artifactId === pendingDelete.id) navigate("/app/artifacts");
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(errorText(error, t`Could not delete this artifact.`));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-background text-foreground/90">
      <header className="app-drag border-b-[0.5px] border-border px-4 py-4 md:px-6">
        {/* Wraps so window controls and the way back stay on screen with Filters. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            {/* This route is the window's leading edge, so Electron window controls sit in the header. */}
            {desktopBridge() ? <WindowChrome /> : null}
            <Link
              to="/app"
              className="app-no-drag flex shrink-0 items-center gap-0.5 rounded-lg py-1 pe-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronLeft size={16} strokeWidth={1.9} aria-hidden="true" />
              <Trans>Bots</Trans>
            </Link>
            <h1 className="text-[17px] font-medium">
              <Trans>Artifacts</Trans>
            </h1>
          </div>
          <div className="app-no-drag flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className="aria-pressed:border-input-hover aria-pressed:bg-popover-accent"
            >
              <Filter size={14} strokeWidth={1.75} />
              <Trans>Filters</Trans>
            </Button>
            {!artifactId ? (
              <div className="flex items-center gap-0.5">
                <ViewModeButton
                  active={viewMode === "grid"}
                  label={t`Card view`}
                  onClick={() => setMode("grid")}
                >
                  <LayoutGrid size={15} strokeWidth={1.9} />
                </ViewModeButton>
                <ViewModeButton
                  active={viewMode === "list"}
                  label={t`List view`}
                  onClick={() => setMode("list")}
                >
                  <List size={15} strokeWidth={1.9} />
                </ViewModeButton>
              </div>
            ) : null}
          </div>
        </div>

        <fieldset className="app-no-drag mt-3 flex min-w-0 flex-wrap items-center gap-2">
          <legend className="sr-only">
            <Trans>Type</Trans>
          </legend>
          <FilterChip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            <Trans>All</Trans>
          </FilterChip>
          {ARTIFACT_KINDS.map((kind) => (
            <FilterChip key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
              {kindLabels[kind]}
            </FilterChip>
          ))}
        </fieldset>

        {filtersOpen ? (
          <div className="app-no-drag mt-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-[260px]">
              <Search
                size={14}
                strokeWidth={1.9}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t`Search artifacts…`}
                className="h-7 w-full rounded-full border-[0.5px] border-input bg-card ps-8 pe-3 text-[13px] outline-none placeholder:text-placeholder focus:border-input-focus"
              />
            </div>
            <NativeSelect
              aria-label={t`Filter by date`}
              size="sm"
              className="w-auto text-[13px]"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            >
              <NativeSelectOption value="all">{t`All time`}</NativeSelectOption>
              <NativeSelectOption value="today">{t`Today`}</NativeSelectOption>
              <NativeSelectOption value="week">{t`This week`}</NativeSelectOption>
              <NativeSelectOption value="month">{t`This month`}</NativeSelectOption>
            </NativeSelect>
            <FilterChip active={activeBotId === null} onClick={() => setActiveBotId(null)}>
              <Trans>All bots</Trans>
            </FilterChip>
            {bots.map((bot) => (
              <BotFilterChip
                key={bot.id}
                bot={bot}
                active={activeBotId === bot.id}
                onClick={() => setActiveBotId(bot.id)}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {artifactId ? (
          <>
            {!maximized ? (
              <IndexPane
                items={filteredItems}
                loadError={loadError}
                botsById={botsById}
                selectedId={artifactId}
                onRequestDelete={setPendingDelete}
                nextCursor={nextCursor}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMore()}
              />
            ) : null}
            <ArtifactPreviewPane
              key={artifactId}
              artifactId={artifactId}
              maximized={maximized}
              onToggleMaximize={() => setMaximized((value) => !value)}
              onClose={() => navigate("/app/artifacts")}
            />
          </>
        ) : (
          <BrowsingPane
            items={filteredItems}
            loadError={loadError}
            viewMode={viewMode}
            botsById={botsById}
            onRequestDelete={setPendingDelete}
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        )}
      </div>

      {pendingDelete ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !deleteBusy) setPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans>Delete "{pendingDelete.name}"?</Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete.versionCount > 1 ? (
                  <Trans>
                    This deletes all {pendingDelete.versionCount} versions of this artifact. This
                    can't be undone.
                  </Trans>
                ) : (
                  <Trans>This can't be undone.</Trans>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError ? <p className="text-[13.5px] text-destructive">{deleteError}</p> : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteBusy}>
                <Trans>Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function BrowsingPane({
  items,
  loadError,
  viewMode,
  botsById,
  onRequestDelete,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  items: ArtifactSummary[] | null;
  loadError: string | null;
  viewMode: ViewMode;
  botsById: Map<string, Bot>;
  onRequestDelete: (artifact: ArtifactSummary) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (items === null) {
    return (
      <div className="grid flex-1 place-items-center text-[13px] text-caption">
        {loadError ?? <Trans>Loading…</Trans>}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyArtifacts
        className="grid flex-1 place-items-center text-[13px] text-caption"
        nextCursor={nextCursor}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
      />
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
      {viewMode === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {items.map((item) => (
            <ArtifactCard
              key={item.id}
              artifact={item}
              bot={item.botId ? botsById.get(item.botId) : undefined}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col rounded-[14px] border-[0.5px] border-card-border bg-card p-1">
          {items.map((item) => (
            <ArtifactRow
              key={item.id}
              artifact={item}
              bot={item.botId ? botsById.get(item.botId) : undefined}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      )}
      {nextCursor ? <LoadMoreButton loading={loadingMore} onClick={onLoadMore} /> : null}
    </div>
  );
}

function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" size="sm" disabled={loading} onClick={onClick}>
        {loading ? <Trans>Loading…</Trans> : <Trans>Load more</Trans>}
      </Button>
    </div>
  );
}

function EmptyArtifacts({
  className,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  className: string;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!nextCursor) {
    return (
      <div className={className}>
        <Trans>No artifacts found.</Trans>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-3">
        <span>
          {loadingMore ? (
            <Trans>Loading…</Trans>
          ) : (
            <Trans>No matching artifacts on this page.</Trans>
          )}
        </span>
        <LoadMoreButton loading={loadingMore} onClick={onLoadMore} />
      </div>
    </div>
  );
}

function IndexPane({
  items,
  loadError,
  botsById,
  selectedId,
  onRequestDelete,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  items: ArtifactSummary[] | null;
  loadError: string | null;
  botsById: Map<string, Bot>;
  selectedId: string;
  onRequestDelete: (artifact: ArtifactSummary) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-e-[0.5px] border-border">
      {items === null ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-caption">
          {loadError ?? <Trans>Loading…</Trans>}
        </div>
      ) : items.length === 0 ? (
        <EmptyArtifacts
          className="grid flex-1 place-items-center p-6 text-center text-[13px] text-caption"
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        />
      ) : (
        <div className="flex flex-col p-2">
          {items.map((item) => (
            <ArtifactRow
              key={item.id}
              artifact={item}
              bot={item.botId ? botsById.get(item.botId) : undefined}
              active={item.id === selectedId}
              onRequestDelete={onRequestDelete}
            />
          ))}
          {nextCursor ? <LoadMoreButton loading={loadingMore} onClick={onLoadMore} /> : null}
        </div>
      )}
    </aside>
  );
}

const chipClass =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-control px-2.5 text-[13px] text-foreground transition-colors hover:bg-popover-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={chipClass}>
      {children}
    </button>
  );
}

function BotFilterChip({
  bot,
  active,
  onClick,
}: {
  bot: Bot;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(chipClass, "ps-1.5")}
    >
      <BotAvatar color={bot.color} identity={bot.id} size={18} status={bot.status} />
      <span className="max-w-[120px] truncate">{bot.name}</span>
    </button>
  );
}

function ViewModeButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <IconTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={`flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {children}
      </button>
    </IconTooltip>
  );
}

function DeleteArtifactButton({
  artifact,
  onRequestDelete,
  className,
}: {
  artifact: ArtifactSummary;
  onRequestDelete: (artifact: ArtifactSummary) => void;
  className: string;
}) {
  const { t } = useLingui();
  return (
    <IconTooltip label={t`Delete ${artifact.name}`}>
      <button
        type="button"
        aria-label={t`Delete ${artifact.name}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRequestDelete(artifact);
        }}
        className={cn(
          "absolute grid size-7 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100",
          className,
        )}
      >
        <Trash2 size={14} strokeWidth={1.75} />
      </button>
    </IconTooltip>
  );
}

function ArtifactCard({
  artifact,
  bot,
  onRequestDelete,
}: {
  artifact: ArtifactSummary;
  bot: Bot | undefined;
  onRequestDelete: (artifact: ArtifactSummary) => void;
}) {
  return (
    <div className="group relative">
      <Link
        to={`/app/artifacts/${artifact.id}`}
        className="flex h-full flex-col overflow-hidden rounded-[14px] border-[0.5px] border-card-border bg-card text-foreground transition-colors hover:bg-card-hover"
      >
        <ArtifactThumbnail
          artifact={artifact}
          iconSize={28}
          className="aspect-[16/10] w-full border-b-[0.5px] border-card-border bg-muted"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 pt-2.5 pb-3">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium" dir="auto">
              {artifact.name}
            </span>
            <VersionChip artifact={artifact} />
          </div>
          {artifact.description ? (
            <div className="truncate text-[12.5px] text-muted-foreground" dir="auto">
              {artifact.description}
            </div>
          ) : null}
          <ArtifactMeta artifact={artifact} bot={bot} className="mt-auto pt-0.5" />
        </div>
      </Link>
      <DeleteArtifactButton
        artifact={artifact}
        onRequestDelete={onRequestDelete}
        className="end-2 top-2 border-[0.5px] border-input bg-card"
      />
    </div>
  );
}

function ArtifactRow({
  artifact,
  bot,
  active,
  onRequestDelete,
}: {
  artifact: ArtifactSummary;
  bot: Bot | undefined;
  active?: boolean;
  onRequestDelete: (artifact: ArtifactSummary) => void;
}) {
  return (
    <div
      className={cn(
        "group relative rounded-[8px]",
        active ? "bg-card-hover" : "hover:bg-card-hover",
      )}
    >
      <Link
        to={`/app/artifacts/${artifact.id}`}
        aria-current={active ? "page" : undefined}
        className="flex items-center gap-3 p-2 pe-10"
      >
        <ArtifactThumbnail
          artifact={artifact}
          iconSize={16}
          className="size-9 rounded-[6px] border-[0.5px] border-card-border bg-muted"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] text-foreground" dir="auto">
              {artifact.name}
            </span>
            <VersionChip artifact={artifact} />
          </div>
          {artifact.description ? (
            <div className="line-clamp-2 text-[12.5px] text-muted-foreground" dir="auto">
              {artifact.description}
            </div>
          ) : null}
          <ArtifactMeta artifact={artifact} bot={bot} />
        </div>
      </Link>
      <DeleteArtifactButton
        artifact={artifact}
        onRequestDelete={onRequestDelete}
        className="end-2 top-1/2 -translate-y-1/2"
      />
    </div>
  );
}

function VersionChip({ artifact }: { artifact: ArtifactSummary }) {
  if (artifact.versionCount <= 1) return null;
  return (
    <span className="shrink-0 rounded-[4px] border-[0.5px] border-chip-border bg-chip px-1 text-[11px] text-muted-foreground">
      {`v${artifact.version}`}
    </span>
  );
}

function ArtifactMeta({
  artifact,
  bot,
  className,
}: {
  artifact: ArtifactSummary;
  bot: Bot | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      {bot ? (
        <>
          <BotAvatar color={bot.color} identity={bot.id} size={14} status={bot.status} />
          <span className="min-w-0 truncate">{bot.name}</span>
          <span aria-hidden="true">·</span>
        </>
      ) : null}
      <span className="shrink-0">{formatRelativeTime(artifact.createdAt)}</span>
      <span className="ms-auto shrink-0 text-[11px] tracking-wide">
        {mimeLabel(artifact.mimeType)}
      </span>
    </div>
  );
}

function mimeLabel(mimeType: string): string {
  if (mimeType === "text/html") return "HTML";
  if (mimeType === "text/markdown") return "MD";
  if (mimeType === "application/pdf") return "PDF";
  const slash = mimeType.indexOf("/");
  return (slash === -1 ? mimeType : mimeType.slice(slash + 1)).toUpperCase().slice(0, 6);
}
