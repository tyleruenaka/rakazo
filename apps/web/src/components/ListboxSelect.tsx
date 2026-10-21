import { Popover, PopoverContent, PopoverTrigger, ScrollArea } from "@rakazo/ui-web";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export type ListboxOption<T extends string> = {
  value: T;
  label: string;
  /** Muted text at the right of the row. */
  detail?: string;
  icon?: ReactNode;
  testId?: string;
};

/**
 * A compact single-choice dropdown in the settings style, with full keyboard support. The popup
 * sits in a portal, right-aligned to the trigger, and flips above it when there is no room below.
 */
export function ListboxSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  testId,
  className = "",
  disabled = false,
  search,
  renderDetail,
}: {
  options: readonly ListboxOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the trigger and its listbox. */
  label: string;
  testId?: string;
  className?: string;
  disabled?: boolean;
  /** Adds a search field above the list. */
  search?: { placeholder: string; clearLabel: string; className: string };
  /** Muted text at the right of an open row, computed only while the popup is open. */
  renderDetail?: (value: T) => string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [open, setOpen] = useState(false);
  // Rows stay until the close animation ends; long lists cost nothing while closed.
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) =>
        [option.label, option.detail, option.value].some((text) =>
          text?.toLowerCase().includes(needle),
        ),
      )
    : options;

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
    setOpen(false);
  }, [selectedIndex, value]);

  useEffect(() => {
    if (!open || search) return;
    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, open, search]);

  useEffect(() => {
    if (open && search)
      optionRefs.current[highlightedIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [highlightedIndex, open, search]);

  function openAt(index: number) {
    setQuery("");
    setHighlightedIndex(search ? -1 : index);
    setOpen(true);
    setMounted(true);
  }

  function choose(index: number) {
    const next = visible[index];
    if (!next) return;
    onChange(next.value);
    setOpen(false);
  }

  function moveHighlight(index: number) {
    if (visible.length) setHighlightedIndex((index + visible.length) % visible.length);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(options.length - 1);
    }
  }

  function onListKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(highlightedIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(highlightedIndex < 0 ? -1 : highlightedIndex - 1);
    } else if (event.key === "Home" && !search) {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End" && !search) {
      event.preventDefault();
      setHighlightedIndex(visible.length - 1);
    } else if (event.key === "Enter" || (event.key === " " && !search)) {
      event.preventDefault();
      choose(highlightedIndex);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) openAt(selectedIndex);
        else setOpen(false);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setMounted(false);
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        role="combobox"
        data-testid={testId}
        aria-label={label}
        aria-controls={open ? listboxId : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        className={`flex h-7 w-fit max-w-full shrink-0 items-center justify-between gap-[5.5px] rounded-[8px] border border-control bg-transparent ps-2 pe-1.5 text-start text-[12.5px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-expanded:border-control-open-border aria-expanded:bg-control ${className}`}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate">{options[selectedIndex]?.label}</span>
        <span className="shrink-0" aria-hidden="true">
          <ChevronDown size={12} strokeWidth={1.5} />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        collisionAvoidance={{ fallbackAxisSide: "none" }}
        initialFocus={() =>
          search ? searchRef.current : (optionRefs.current[highlightedIndex] ?? true)
        }
        // Search popups are at most 524 tall, like Grok's; every popup fits the room it opens into.
        style={search ? { maxHeight: "min(524px, var(--available-height))" } : undefined}
        className={`gap-0 overflow-hidden p-0 text-popover-foreground ${
          search
            ? `border ${search.className}`
            : "max-h-(--available-height) w-max max-w-[424px] min-w-[200px]"
        }`}
      >
        {search ? (
          <div className="flex h-[42.5px] shrink-0 items-center gap-2 border-b-[0.5px] border-control ps-4 pe-[15px]">
            <Search
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-placeholder"
              aria-hidden
            />
            <input
              ref={searchRef}
              role="combobox"
              aria-label={search.placeholder}
              aria-controls={listboxId}
              aria-expanded
              aria-activedescendant={
                highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined
              }
              value={query}
              placeholder={search.placeholder}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlightedIndex(-1);
              }}
              onKeyDown={onListKeyDown}
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-placeholder"
            />
            <button
              type="button"
              aria-label={search.clearLabel}
              onClick={() => {
                if (!query) {
                  setOpen(false);
                  return;
                }
                setQuery("");
                searchRef.current?.focus();
              }}
              className="grid size-5 shrink-0 place-items-center rounded-full text-placeholder outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X size={14} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        ) : null}
        <ScrollArea className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="flex flex-col gap-0.5 p-[5.5px]"
          >
            {(mounted ? visible : []).map((option, index) => {
              const detail = renderDetail ? renderDetail(option.value) : option.detail;
              return (
                <button
                  key={option.testId ?? option.value}
                  id={`${listboxId}-${index}`}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  data-testid={option.testId}
                  aria-selected={option.value === value}
                  tabIndex={search ? -1 : index === highlightedIndex ? 0 : -1}
                  data-highlighted={index === highlightedIndex ? "" : undefined}
                  className={`flex w-full shrink-0 items-center gap-2 rounded-[6px] ps-2 text-start outline-none focus:bg-control data-highlighted:bg-control ${
                    search ? "h-[30px] pe-[9px] text-[13px]" : "h-[30px] pe-[7.5px] text-[12.5px]"
                  }`}
                  onClick={() => choose(index)}
                  onMouseMove={() => setHighlightedIndex(index)}
                  onKeyDown={search ? undefined : onListKeyDown}
                >
                  {option.icon}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {detail ? (
                    <span className="shrink-0 text-placeholder" dir="auto">
                      {detail}
                    </span>
                  ) : null}
                  {option.value === value ? (
                    <Check size={13.25} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
