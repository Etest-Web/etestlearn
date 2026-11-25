import Link from "next/link";

/**
 * Concept footer for the chat-first homepage.
 *
 * The full sitemap has not been specced yet — the links below are the real,
 * existing public routes on the platform, laid into the brand-plane footer
 * the landing page already uses. Column labels and sections will change once
 * the final navigation is described; the structure (brand plane → link
 * columns → legal strip) is the keeper.
 */
const COLUMNS: Array<{ heading: string; links: Array<{ href: string; label: string }> }> = [
  {
    heading: "Platform",
    links: [
      { href: "/courses", label: "Browse courses" },
      { href: "/verify", label: "Verify a certificate" },
    ],
  },
  {
    heading: "For instructors",
    links: [
      { href: "/become-instructor", label: "Apply to teach" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
];

export function ConceptFooter() {
  return (
    <footer className="bg-brand text-brand-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] md:py-16">
        <div className="space-y-3">
          <p className="display-heading text-2xl">Glypha Learn</p>
          <p className="max-w-[38ch] text-pretty text-sm leading-body opacity-85">
            Hand-picked courses, quizzes, and verifiable certificates — learn a
            skill, then prove you have it.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
              {column.heading}
            </p>
            <ul className="space-y-2 text-sm font-medium">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="link-quiet">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-brand-foreground/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs opacity-80 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Glypha Learn. Learn skills that move you forward.</p>
          <p>Certificates verify publicly at /verify</p>
        </div>
      </div>
    </footer>
  );
}
