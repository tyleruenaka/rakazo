"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cn } from "@rakazo/ui-web/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-full text-[13px] font-normal whitespace-nowrap text-muted-foreground outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-ring aria-pressed:text-foreground data-[state=on]:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-muted data-[state=on]:bg-muted dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "rounded-lg border border-input bg-transparent hover:bg-muted",
      },
      size: {
        default:
          "h-[26px] min-w-[26px] px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        sm: "h-6 min-w-6 px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
