import { ScrollArea } from "@rakazo/ui-web";
import { Check, ChevronDown } from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

/** A compact single-choice dropdown in the settings style, with full keyboard support. */
export function ListboxSelect<T extends string>({
  options,
  value,
  onChange,
  label,
  testId,
  className = "",
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the trigger and its listbox. */
  label: string;
  testId?: string;
  className?: string;
  disabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
    setOpen(false);
  }, [selectedIndex, value]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function choose(index: number) {
    const next = options[index];
    if (!next) return;
    onChange(next.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(index: number) {
    setHighlightedIndex((index + options.length) % options.length);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex(options.length - 1);
    }
  }

  function onOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        data-testid={testId}
        aria-label={label}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className="flex h-7 w-fit max-w-full items-center justify-between gap-[5.5px] rounded-[8px] border border-control bg-transparent ps-2 pe-1.5 text-start text-[12.5px] text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-expanded:border-control-open-border aria-expanded:bg-control"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate">{options[selectedIndex]?.label}</span>
        <span className="shrink-0" aria-hidden="true">
          <ChevronDown size={12} strokeWidth={1.5} />
        </span>
      </button>
      {open ? (
        <ScrollArea className="absolute start-0 top-full z-20 mt-1 flex max-h-[min(18rem,40vh)] w-[200px] flex-col overflow-hidden rounded-[14px] border-[0.5px] border-popover-border bg-popover text-popover-foreground shadow-popover dark:shadow-none">
          <div
            id={listboxId}
            role="listbox"
            aria-label={label}
            className="flex flex-col gap-0.5 p-[5.5px]"
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={index === highlightedIndex ? 0 : -1}
                className="flex h-[30px] w-full shrink-0 items-center justify-between gap-2 rounded-[6px] ps-2 pe-[7.5px] text-start text-[12.5px] outline-none focus:bg-control"
                onClick={() => choose(index)}
                onMouseMove={() => setHighlightedIndex(index)}
                onKeyDown={(event) => onOptionKeyDown(event, index)}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {option.value === value ? (
                  <Check size={13.25} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
}
