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
          <span className="px-6 font-display text-xl tracking-editorial text-muted-foreground sm:text-2xl">
            {topic.toUpperCase()}
          </span>
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-primary" fill="currentColor">
            <path d="M12 1l2.394 7.364H22l-6.264 4.55 2.394 7.365L12 15.73l-6.13 4.549 2.394-7.365L2 8.364h7.606z" />
          </svg>
        </span>
      ))}
    </div>
  );
}

export function CategoryMarquee() {
  return (
    <div className="marquee overflow-hidden border-y border-rule bg-card py-4">
      <div className="marquee-track flex w-max">
        <Row />
        <Row hidden />
      </div>
    </div>
  );
}
