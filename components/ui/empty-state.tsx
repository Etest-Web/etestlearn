import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * EmptyState — what a list shows when it has nothing in it.
 *
 * This exists because empty states are the most commonly skipped piece of UI
 * and the most visible when they are wrong. A bare "No results" string reads as
 * a broken screen; the stock alternative — a big rounded square with a grey
 * icon floating in the middle of a dashed box — reads as a template.
 *
 * The treatment here is closer to a printed colophon: the icon sits inline at
 * reduced opacity as a small mark, the title is set in the display face, and
 * the whole block is separated by rules above and below rather than being boxed
 * in a dashed border. It reads as an intentional part of the layout instead of
 * an apology for missing content.
 *
 * `tone` is for when an empty state means something went wrong rather than
 * simply "nothing yet" — that distinction is the difference between a calm page
 * and a page that feels broken.
 */

function EmptyState({
  className,
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  ...props
}: React.ComponentProps<"div"> & {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: "neutral" | "brand" | "warning"
}) {
  return (
    <div
      data-slot="empty-state"
      data-tone={tone}
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-14 text-center",
        // Rules instead of a box. Two hairlines and a lot of air read as
        // designed; a dashed border reads as "placeholder".
        "border-y border-rule",
        className
      )}
      {...props}
    >
      {Icon ? (
        <Icon
          aria-hidden
          className={cn(
            "size-6 text-muted-foreground/45",
            tone === "brand" && "text-brand/60",
            tone === "warning" && "text-warning/70"
          )}
        />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <h3
          data-slot="empty-state-title"
          className="display-subheading text-lg text-foreground"
        >
          {title}
        </h3>

        {description ? (
          <p
            data-slot="empty-state-description"
            className="max-w-[46ch] text-sm leading-[1.6] text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </div>

      {action ? (
        <div data-slot="empty-state-action" className="mt-2">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState }