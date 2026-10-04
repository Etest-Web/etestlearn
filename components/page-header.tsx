import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps extends Omit<React.ComponentPropsWithoutRef<"header">, "title"> {
  title: React.ReactNode
  description?: string
  subheading?: string
  action?: React.ReactNode
  align?: "left" | "center"
}

export function PageHeader({
  title,
  description,
  subheading,
  action,
  align = "left",
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        align === "center" && "items-center text-center sm:flex-col sm:text-center",
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        {subheading && (
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {subheading}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  )
}
