import { Trans, useLingui } from "@lingui/react/macro";
import type { ScratchpadItem } from "@rakazo/contracts";
import { Button, Checkbox, Input } from "@rakazo/ui-web";
import { Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SettingsGroup, settingsPillClass } from "../components/SettingsLayout";
import { rpc } from "../lib/rpc";

export function ScratchpadSection({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [items, setItems] = useState<ScratchpadItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listGeneration = useRef(0);

  async function refresh() {
    const generation = ++listGeneration.current;
    const list = await rpc.scratchpad.list({ botId });
    if (generation !== listGeneration.current) return;
    setItems(list);
  }

  useEffect(() => {
    const generation = ++listGeneration.current;
    void rpc.scratchpad
      .list({ botId })
      .then((list) => {
        if (generation !== listGeneration.current) return;
        setItems(list);
      })
      .catch(() => {
        if (generation !== listGeneration.current) return;
        setItems([]);
      });
    return () => {
      listGeneration.current += 1;
    };
  }, [botId]);

  async function addItem() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await rpc.scratchpad.create({ botId, title });
      setDraft("");
      setAdding(false);
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      try {
        await refresh();
      } catch {
        setError(t`Saved, but list refresh failed`);
      }
    } catch {
      setError(t`Could not add`);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(item: ScratchpadItem, status: ScratchpadItem["status"]) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rpc.scratchpad.update({ itemId: item.id, status });
      setItems((current) => {
        const next = current.map((entry) => (entry.id === updated.id ? updated : entry));
        return status === "done" ? next.filter((entry) => entry.status !== "done") : next;
      });
      try {
        await refresh();
      } catch {
        setError(t`Saved, but list refresh failed`);
      }
    } catch {
      setError(t`Could not update`);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: ScratchpadItem) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.scratchpad.remove({ itemId: item.id });
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      try {
        await refresh();
      } catch {
        setError(t`Removed, but list refresh failed`);
      }
    } catch {
      setError(t`Could not remove`);
    } finally {
      setBusy(false);
    }
  }

  // Nothing to show until the bot (or someone) records open work.
  if (!items.length && !error) return null;

  return (
    <SettingsGroup
      label={<Trans>Open work</Trans>}
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t`Add open work`}
          title={t`Add open work`}
          onClick={() => setAdding((value) => !value)}
          className="text-muted-foreground"
        >
          <Plus size={14} strokeWidth={1.6} />
        </Button>
      }
      testId="bot-scratchpad"
    >
      {(showAll ? items : items.slice(0, 5)).map((item) => (
        <div key={item.id} className="group flex items-start gap-2.5 px-3.5 py-2.5">
          <Checkbox
            aria-label={item.status === "done" ? t`Reopen` : t`Complete`}
            checked={item.status === "done"}
            disabled={busy}
            onCheckedChange={(checked) => void setStatus(item, checked ? "done" : "open")}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div
              className={`text-start text-[12.5px] leading-[19px] ${item.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
              dir="auto"
            >
              {item.title}
            </div>
            {item.notes ? <ClampedNotes text={item.notes} /> : null}
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t`Remove`}
            disabled={busy}
            onClick={() => void removeItem(item)}
            className="-my-0.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100"
          >
            <X />
          </Button>
        </div>
      ))}
      {items.length > 5 && !showAll ? (
        <div className="px-3.5 py-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            <Trans>Show more</Trans>
          </Button>
        </div>
      ) : null}
      {adding ? (
        <form
          className="flex items-center gap-2 px-3.5 py-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void addItem();
          }}
        >
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t`Add item`}
            aria-label={t`New open-work item`}
            maxLength={200}
            className="min-w-0 flex-1"
          />
          <Button
            variant="secondary"
            className={`rounded-full ${settingsPillClass}`}
            disabled={busy || !draft.trim()}
            onClick={() => void addItem()}
          >
            <Trans>Add</Trans>
          </Button>
        </form>
      ) : null}
      {error ? <div className="px-3.5 pb-2.5 text-[12.5px] text-destructive">{error}</div> : null}
    </SettingsGroup>
  );
}

/** Long notes show three lines until "Show more"; the full text stays in the DOM. */
function ClampedNotes({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded || typeof ResizeObserver === "undefined") return;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <>
      <div
        ref={ref}
        className={`mt-0.5 text-[12.5px] leading-[19px] text-description ${expanded ? "" : "line-clamp-3"}`}
        dir="auto"
      >
        {text}
      </div>
      {clamped && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[12px] leading-[19px] text-muted-foreground hover:text-foreground"
        >
          <Trans>Show more</Trans>
        </button>
      ) : null}
    </>
  );
}
