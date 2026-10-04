import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Card, rebuilt for the editorial system.
 *
 * The stock version is `rounded-xl shadow-xs ring-1 ring-foreground/10`, which
 * is the single most recognisable "assembled dashboard" surface. This one is a
 * hairline-bordered plane with no shadow at all: separation comes from a rule,
 * which is cheaper vertically than a stack of rounded boxes and easier to scan
 * a page by.
 *
 * The stock version also *floated* content — `has-[>img:first-child]:pt-0` and
 * the matching image radii. That is why card bodies had to reach for
 * `rounded-[24px]` overrides to line their imagery up with a rounded shell.
 * With square corners the image is flush by default and that entire category
 * of override disappears.
 *
 * `interactive` is a separate variant rather than a hover class, because an
 * interactive card is a link or a button and needs the focus ring, the
 * cursor, and a keyboard-visible state to come with it.
 */

type CardVariant = "plain" | "interactive" | "sunken"

const cardVariants = {
  plain: "bg-card border border-rule",
  sunken: "bg-surface-sunken border border-rule",
  interactive:
    "bg-card border border-rule transition-colors hover:border-rule-strong focus-within:border-brand cursor-pointer",
} as const

function Card({
  className,
  size = "default",
  variant = "plain",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: keyof typeof cardVariants
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card relative flex flex-col text-card-foreground",
        cardVariants[variant],
        "gap-5 p-6 data-[size=sm]:gap-4 data-[size=sm]:p-4",
        // A card that is itself a link, rather than one containing links.
        // `outline` over `ring` so the indicator sits outside the border and
        // is never clipped by an ancestor's overflow.
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "[.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1.5",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        // Editorial title: tight leading and a slight negative tracking so the
        // line holds together instead of reading as loose body copy.
        "text-[17px] leading-[1.25] font-semibold tracking-[-0.01em] group-data-[size=sm]/card:text-[15px]",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm leading-[1.6] text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("group-data-[size=sm]/card:text-sm", className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-3",
        // The footer is separated by a rule, not by extra padding alone — that
        // is what makes a dense card read as two fields rather than one block.
        "border-t border-rule pt-4 group-data-[size=sm]/card:pt-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
