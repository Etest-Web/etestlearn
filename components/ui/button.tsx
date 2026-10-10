"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Sharp, and flat until it is interacted with. The stock version carried a
  // permanent `border border-transparent`, which drew a 1px seam that had to be
  // hidden — on a coloured button it produced a visible darker rim at some
  // zoom levels. No border by default; variants that want one declare it.
  // One base string, not several: `cva` is `(base, config)`, so extra string
  // arguments are silently bound as configs and the variant types collapse.
  "group/button inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,border-color,opacity] outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Solid brand, no gradient and no shadow. Hover darkens rather than
        // lightening, which keeps the perceived weight constant.
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        // Hairline outline. This is the default for secondary actions in an
        // editorial layout because a bordered rectangle sits on the page like a
        // printed box rather than like a floating chip.
        outline:
          "border border-rule-strong bg-transparent text-foreground hover:bg-surface-sunken",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-foreground/70 hover:bg-surface-sunken hover:text-foreground",
        // Destructive is a tinted plate, not a solid red fill: on a page that
        // already uses one accent colour, a second solid fill competes for the
        // eye away from the thing actually being asked for.
        destructive:
          "border border-destructive/30 bg-destructive/8 text-destructive hover:bg-destructive/15 focus-visible:outline-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 36px is the stock default and reads cramped for an editorial layout
        // that already sits on a roomy baseline; 38px keeps density without
        // the generic "pill button" proportion.
        default:
          "h-9.5 gap-1.5 px-3.5 rounded-[var(--radius-md)] text-sm in-data-[slot=button-group]:rounded-[var(--radius-md)] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6.5 gap-1 rounded-[var(--radius-sm)] px-2 text-xs in-data-[slot=button-group]:rounded-[var(--radius-sm)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 rounded-[var(--radius-md)] px-3 text-[13px] in-data-[slot=button-group]:rounded-[var(--radius-md)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        lg: "h-11 gap-2 px-5 rounded-[var(--radius-lg)] text-[15px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9.5 rounded-[var(--radius-md)]",
        "icon-xs":
          "size-6.5 rounded-[var(--radius-sm)] in-data-[slot=button-group]:rounded-[var(--radius-sm)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[var(--radius-md)] in-data-[slot=button-group]:rounded-[var(--radius-md)]",
        "icon-lg": "size-11 rounded-[var(--radius-lg)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
