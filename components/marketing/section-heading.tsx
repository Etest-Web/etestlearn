import { cn } from "@/lib/utils";

export function SectionHeading({
  index,
  kicker,
  title,
  description,
  align = "left",
  className,
}: {
  index: string;
  kicker: string;
  title: React.ReactNode;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="tabular text-xs text-primary">{index}</span>
        <span className="h-px w-10 bg-rule" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {kicker}
        </span>
      </div>
      <h2 className="display-heading text-4xl text-balance sm:text-5xl md:text-6xl">
        {title}
      </h2>
      {description ? (
        <p className={cn("max-w-xl text-sm text-pretty text-muted-foreground md:text-base", align === "center" && "mx-auto")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
