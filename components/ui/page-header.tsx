import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * PageHeader — the top of every dashboard page.
 *
 * Every page here was hand-writing the same four things: an eyebrow, a
 * `text-3xl font-bold` title, a muted subtitle, and an action slot. That is
 * how a codebase acquires four slightly different page titles. This makes it one
 * component so the voice is consistent by construction.
 *
 * The title uses the display face at a tight leading, which is the single
 * biggest difference between the app and the marketing site — the marketing
 * pages already spoke in this voice; the app was set entirely in body sans.
 *
 * `eyebrow` is optional because most pages have nothing meaningful to put
 * there, and a filler label ("OVERVIEW") is worse than none. When present it
 * takes a `tone` so a page can mark itself as an error or warning state
 * without swapping the whole header out.
 */

function PageHeader({
  className,
  eyebrow,
  eyebrowTone = "muted",
  title,
  description,
  actions,
  children,
  ...props
}: /* `title` is omitted from the native `<header>` props on purpose: the DOM
   attribute is `title?: string`, and intersecting that with `ReactNode` gives
   `title: ReactNode & string`, which rejects the JSX most callers want to pass
   (an icon beside the text, a highlighted word). Every other prop passes
   through. */
  Omit<React.ComponentProps<"header">, "title"> & {
  eyebrow?: React.ReactNode
  eyebrowTone?: "muted" | "brand" | "success" | "warning" | "destructive"
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned on desktop, stacked full-width on mobile. */
  actions?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8",
        className
      )}
      {...props}
    >
      {/*
        `flex-1` is load-bearing, not decoration. The header is a row on `sm+`
        and the actions slot is `shrink-0`, so without a growing title column
        the title is the *only* shrinkable item — a wide action row (a button
        plus a progress meter plus a certificate action) then squeezes it down
        to its min-content width, which for a heading is its longest word. That
        is how a page title ends up stacked one word per line.
      */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {eyebrow ? (
          <p
            data-slot="page-header-eyebrow"
            className={cn(
              "eyebrow",
              eyebrowTone === "brand" && "text-brand",
              eyebrowTone === "success" && "text-success",
              eyebrowTone === "warning" && "text-warning",
              eyebrowTone === "destructive" && "text-destructive"
            )}
          >
            {eyebrow}
          </p>
        ) : null}

        <h1
          data-slot="page-header-title"
          className="display-heading text-[clamp(1.75rem,4vw,2.5rem)] text-foreground"
        >
          {title}
        </h1>

        {description ? (
          <p
            data-slot="page-header-description"
            className="max-w-[62ch] text-[15px] leading-[1.6] text-muted-foreground"
          >
            {description}
          </p>
        ) : null}

        {children}
      </div>

      {actions ? (
        <div
          data-slot="page-header-actions"
          // Capped rather than free to grow: an uncapped `shrink-0` action row
          // takes whatever width it likes and leaves the title whatever is
          // left. At 55% the title always keeps at least a comfortable column
          // to wrap in, and the actions wrap among themselves instead.
          className="flex min-w-0 flex-wrap items-center gap-2 sm:max-w-[55%] sm:justify-end"
        >
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export { PageHeader }