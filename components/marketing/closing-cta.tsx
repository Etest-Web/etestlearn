"use client";

import { useUser } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

/**
 * Closing call to action and footer, on one brand plane.
 *
 * This is the page's only colour-block moment, and it is at the very end
 * rather than dropped mid-scroll. The previous version had the instructor band
 * inverted to `bg-foreground` halfway down a light page, which read as the
 * site changing hands. One end plane is a deliberate ending; an inversion in
 * the middle is a mistake.
 *
 * `bg-brand` / `text-brand-foreground` also resolve correctly in both themes:
 * the tokens invert together, so dark mode gets a light-purple plane with dark
 * text instead of a near-black panel with near-black copy.
 */
export function ClosingCta() {
  const { user } = useUser();

  const href = user ? "/dashboard" : "/courses";
  const label = user ? "Continue learning" : "Browse courses";

  return (
    <footer className="bg-brand text-brand-foreground">
      <section className="mx-auto max-w-6xl px-4 py-20 text-center md:py-24">
        <Reveal>
          <h2 className="display-heading mx-auto max-w-3xl text-4xl text-balance sm:text-5xl">
            Start with one course.
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-pretty text-base leading-body opacity-85">
            Finish it, pass the quiz, and the certificate is issued to you
            automatically.
          </p>

          {/* One action. The label matches the hero's primary exactly, so
              "browse courses" means one thing everywhere on this page. */}
          <div className="mt-9 flex justify-center">
            <Link
              href={href}
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-brand-foreground px-6 text-sm font-semibold text-brand transition-transform duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              {label}
              <ArrowRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Reveal>
      </section>

      <div className="border-t border-brand-foreground/20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row">
          <p className="text-xs opacity-75">
            © {new Date().getFullYear()} Glypha Learn. Learn skills that move
            you forward.
          </p>
          {/* `.link-quiet` rather than a colour swap alone, so the links stay
              discoverable as links without relying on the hover state. The
              underline colour comes from the utility, so it reads correctly on
              the brand plane without an override. */}
          <nav className="flex items-center gap-6 text-xs font-medium" aria-label="Footer">
            <Link href="/courses" className="link-quiet">
              Courses
            </Link>
            <Link href="/become-instructor" className="link-quiet">
              Teach
            </Link>
            <Link href="/sign-in" className="link-quiet">
              Sign in
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}