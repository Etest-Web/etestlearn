"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Tabs, rebuilt for the editorial system.
 *
 * Two variants, because the stock single pill does not survive contact with
 * this design:
 *
 * · `rule` (default) — a hairline under the strip with a brand-coloured bar
 *   marking the selected tab. This is the one to reach for. Selection is shown
 *   by position and weight rather than by a filled lozenge, which is what
 *   makes a tab strip read as a table of contents instead of a toolbar.
 * · `segmented` — for switching between peer views of the same data (All /
 *   In progress / Completed) where a border around the whole group helps
 *   communicate "these are alternatives".
 *
 * The selected state is `data-active`, NOT Radix's `data-state="active"`.
 * These primitives are Base UI. The Radix spelling is a valid Tailwind class
 * that silently matches nothing, so a selected tab renders with no active
 * styling and the console stays quiet. If you copy an active class out of an
 * older page here, check which spelling it uses.
 */

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  // The strip carries the rule, not each trigger: one hairline under the whole
  // group with no gaps, which is why `w-max` and the gap live here rather than
  // on the triggers. Vertical orientation moves the rule to the inline-start
  // edge so the same component works as a sidebar section nav.
  "group/tabs-list relative inline-flex w-max items-center text-muted-foreground",
  {
    variants: {
      variant: {
        rule: "gap-5 border-b border-rule group-data-horizontal/tabs:w-full group-data-horizontal/tabs:justify-start sm:gap-7",
        segmented:
          "gap-0 rounded-sm border border-rule bg-surface-sunken p-0.5 group-data-vertical/tabs:h-full",
      },
    },
    defaultVariants: {
      variant: "rule",
    },
  }
)

function TabsList({
  className,
  variant = "rule",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Baseline: position, colour and weight only. No background, no
        // shadow, no border — the selected state is a weight change plus a
        // 2px bar, and everything else would compete with that.
        "relative inline-flex items-center gap-2 whitespace-nowrap font-medium text-foreground/55 transition-colors",
        "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",

        // ── rule variant ────────────────────────────────────────────────
        // 15px semibold with an underline bar. The bar is 2px and inset to the
        // trigger's own padding so it aligns with the label rather than
        // floating to the edge of the hit area.
        "group-data-[variant=rule]/tabs-list:px-0.5 group-data-[variant=rule]/tabs-list:py-2.5 group-data-[variant=rule]/tabs-list:text-[15px] group-data-[variant=rule]/tabs-list:data-active:font-semibold group-data-[variant=rule]/tabs-list:data-active:text-foreground",
        "group-data-[variant=rule]/tabs-list:after:absolute group-data-[variant=rule]/tabs-list:after:bg-brand group-data-[variant=rule]/tabs-list:after:transition-transform group-data-[variant=rule]/tabs-list:data-active:after:scale-x-100",
        "group-data-[variant=rule]/tabs-list:after:inset-x-0.5 group-data-[variant=rule]/tabs-list:after:-bottom-px group-data-[variant=rule]/tabs-list:after:h-0.5 group-data-[variant=rule]/tabs-list:after:origin-left group-data-[variant=rule]/tabs-list:after:scale-x-0",
        "group-data-[variant=rule]/tabs-list:data-vertical/tabs:after:inset-y-1 group-data-[variant=rule]/tabs-list:data-vertical/tabs:after:-left-px group-data-[variant=rule]/tabs-list:data-vertical/tabs:after:right-auto group-data-[variant=rule]/tabs-list:data-vertical/tabs:after:h-auto group-data-[variant=rule]/tabs-list:data-vertical/tabs:after:w-0.5 group-data-[variant=rule]/tabs-list:data-vertical/tabs:after:origin-top",

        // ── segmented variant ────────────────────────────────────────────
        // Selected is an inverted plate — the one place in this system where a
        // filled background is right, because the group already reads as one
        // control and the fill is what shows which alternative is live.
        "group-data-[variant=segmented]/tabs-list:rounded-sm group-data-[variant=segmented]/tabs-list:px-3.5 group-data-[variant=segmented]/tabs-list:py-1.5 group-data-[variant=segmented]/tabs-list:text-sm",
        "group-data-[variant=segmented]/tabs-list:data-active:bg-card group-data-[variant=segmented]/tabs-list:data-active:text-foreground group-data-[variant=segmented]/tabs-list:data-active:font-semibold group-data-[variant=segmented]/tabs-list:data-active:shadow-elevation-raised",
        "group-data-[variant=segmented]/tabs-list:data-vertical/tabs:w-full",

        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }