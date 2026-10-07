const TOPICS = [
  "Graphic Design",
  "UI/UX",
  "Web Development",
  "Data Analysis",
  "Video Editing",
  "Digital Marketing",
  "Product Design",
  "Branding",
  "Illustration",
  "Motion Design",
  "Copywriting",
  "Photography",
];

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {TOPICS.map((topic) => (
        <span key={topic} className="flex items-center">
          <span className="display-subheading px-6 text-xl text-muted-foreground sm:text-2xl">
            {topic}
          </span>
          {/* Was a hand-drawn `<path>` star, which is the one thing a project
              must never draw itself. This stays a CSS shape rather than an
              icon-library glyph on purpose: this is the only marketing file
              that renders as a Server Component, and lucide-react calls
              `createContext`, so importing it here fails the server build.
              Marking the file `"use client"` would work but would ship a
              client bundle for a decorative scroll that CSS already drives. */}
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rotate-45 bg-primary"
          />
        </span>
      ))}
    </div>
  );
}

/**
 * The page's only marquee. Two of these would read as filler, so the rest of
 * the page gets its rhythm from layout instead.
 *
 * A server component: the scroll is pure CSS on `.marquee-track`, which
 * globals.css already stops under `prefers-reduced-motion`. Nothing here needs
 * to run on the client.
 */
export function CategoryMarquee() {
  return (
    <div className="marquee overflow-hidden border-b border-rule bg-card py-4">
      <div className="marquee-track flex w-max">
        <Row />
        <Row hidden />
      </div>
    </div>
  );
}