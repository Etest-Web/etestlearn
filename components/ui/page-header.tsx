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
}: React.ComponentProps<"header"> & {
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
      <div className="flex min-w-0 flex-col gap-2.5">
        {eyebrow ? (
          <p
            data-slot="page-header-eyebrow"
            className={cn(
              "eyebrow",
              eyebrowTone === "brand" && "text-brand",
              eyebrowTone === "success" && "text-success",
              eyebrowTone === "warning" && "text-warning-foreground",
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
          className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
        >
          {actions}
        </div>
      ) : null}
    </header>
  )
}

export { PageHeader }