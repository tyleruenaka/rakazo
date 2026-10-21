import { Trans, useLingui } from "@lingui/react/macro";
import type { ScratchpadItem } from "@rakazo/contracts";
import { Button, Checkbox, Input } from "@rakazo/ui-web";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SettingsGroup, settingsPillClass } from "../components/SettingsLayout";
import { rpc } from "../lib/rpc";

export function ScratchpadSection({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [items, setItems] = useState<ScratchpadItem[]>([]);
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

  return (
    <SettingsGroup label={<Trans>Open work</Trans>} testId="bot-scratchpad">
      {items.length === 0 ? (
        <div className="px-3.5 py-2.5 text-[12.5px] leading-[19px] text-description">
          <Trans>None yet</Trans>
        </div>
      ) : (
        items.map((item) => (
          <div key={item.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
            <Checkbox
              aria-label={item.status === "done" ? t`Reopen` : t`Complete`}
              checked={item.status === "done"}
              disabled={busy}
              onCheckedChange={(checked) => void setStatus(item, checked ? "done" : "open")}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1">
                <div
                  className={`min-w-0 flex-1 text-start text-[12.5px] leading-[19px] ${item.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                  dir="auto"
                >
                  {item.title}
                </div>
                <span className="shrink-0 text-[12px] leading-[19px] text-muted-foreground">
                  {item.status}
                </span>
                {item.status === "open" ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={t`Park`}
                    disabled={busy}
                    onClick={() => void setStatus(item, "parked")}
                    className="-my-0.5 shrink-0 text-muted-foreground"
                  >
                    <Trans>Park</Trans>
                  </Button>
                ) : item.status === "parked" ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={t`Reopen`}
                    disabled={busy}
                    onClick={() => void setStatus(item, "open")}
                    className="-my-0.5 shrink-0 text-muted-foreground"
                  >
                    <Trans>Open</Trans>
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t`Remove`}
                  disabled={busy}
                  onClick={() => void removeItem(item)}
                  className="-my-0.5 shrink-0 text-muted-foreground"
                >
                  <X />
                </Button>
              </div>
              {item.notes ? <ClampedNotes text={item.notes} /> : null}
            </div>
          </div>
        ))
      )}
      <form
        className="flex items-center gap-2 px-3.5 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          void addItem();
        }}
      >
        <Input
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
