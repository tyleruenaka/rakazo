"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "@rakazo/ui-web/lib/utils";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("flex scroll-my-1 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default" | "xl";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-[5.5px] rounded-[8px] border border-control bg-transparent py-2 pr-1.5 pl-2 text-[12.5px] whitespace-nowrap text-foreground transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-placeholder data-popup-open:border-control-open-border data-popup-open:bg-control data-[size=default]:h-7 data-[size=sm]:h-6 data-[size=xl]:h-12 data-[size=xl]:rounded-xl data-[size=xl]:pr-3 data-[size=xl]:pl-4 data-[size=xl]:text-base *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {/* As a child, not render: Base UI would otherwise put its default "▼" into the trigger's text. */}
      <SelectPrimitive.Icon className="pointer-events-none flex">
        <ChevronDownIcon className="size-3" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-[200px] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[14px] border-[0.5px] border-popover-border bg-popover text-popover-foreground shadow-popover duration-100 dark:shadow-none data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="flex flex-col gap-0.5 p-[5.5px]">
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-[30px] w-full cursor-default items-center gap-[5px] rounded-[6px] py-1 pr-8 pl-[9px] text-[12.5px] outline-hidden select-none focus:bg-control data-highlighted:bg-control data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-[7.5px] flex items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none size-[13.25px]" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

/** One choice in an {@link OptionSelect}. */
type SelectOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
};

/**
 * A dropdown over a fixed list of options: the app's menu, never the browser's own, so every
 * dropdown looks and behaves the same. Give it an `id` to pair it with a `FieldLabel`.
 */
function OptionSelect<T extends string>({
  id,
  value,
  options,
  onValueChange,
  disabled = false,
  size = "default",
  className,
  "aria-label": ariaLabel,
  "data-testid": testId,
}: {
  id?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  disabled?: boolean;
  size?: "sm" | "default" | "xl";
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  return (
    <Select
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((entry) => entry.value === next);
        if (option) onValueChange(option.value);
      }}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={ariaLabel}
        data-testid={testId}
        className={cn("w-full", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type { SelectOption };
export {
  OptionSelect,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
