import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 border px-1.5 font-display text-[10px] uppercase leading-none tracking-editorial whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:pointer-events-none [&>svg]:size-2.5!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "border-rule bg-surface-sunken text-secondary-foreground [a]:hover:bg-secondary",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive [a]:hover:bg-destructive/15",
        outline:
          "border-rule-strong text-foreground [a]:hover:bg-surface-sunken",
        ghost: "text-muted-foreground [a]:hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Tinted plate plus a hairline. The border is load-bearing here: a tint
        // at 8–10% is invisible on white, which is why tint-only badges so
        // often read as floating text rather than as a chip.
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/40 bg-warning/12 text-warning",
        info: "border-info/30 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
