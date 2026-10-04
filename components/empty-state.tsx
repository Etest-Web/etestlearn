import * as React from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps extends React.ComponentPropsWithoutRef<"div"> {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  variant?: "default" | "card"
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "default",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center",
        variant === "card" ? "bg-card py-12" : "bg-muted/30 py-16",
        className
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mt-2 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
