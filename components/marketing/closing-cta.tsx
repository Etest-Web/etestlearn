"use client";

import { useUser } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

export function ClosingCta() {
    const { user } = useUser();

    return (
        <footer className="border-t border-rule bg-card">
            <section className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
                <Reveal>
                    <p className="flex items-center justify-center gap-3 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                        <span className="h-px w-8 bg-brand" aria-hidden="true" />
                        No better time
                        <span className="h-px w-8 bg-brand" aria-hidden="true" />
                    </p>
                    <h2 className="display-heading mx-auto mt-5 max-w-3xl text-5xl text-balance sm:text-6xl md:text-7xl">
                        The skill you learn today is the edge you have tomorrow.
                    </h2>
                    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            href={user ? "/dashboard" : "/courses"}
                            className="group inline-flex h-12 items-center justify-center gap-2 rounded-sm bg-brand px-7 text-sm font-semibold text-brand-foreground transition-transform duration-200 hover:-translate-y-0.5 hover:bg-brand/90 active:translate-y-0 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            {user ? "Continue learning" : "Browse courses — free to explore"}
                            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </Reveal>
            </section>

            <div className="border-t border-rule">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row">
                    <p className="text-xs text-muted-foreground">
                        © {new Date().getFullYear()} Glypha Learning. Learn skills that move you forward.
                    </p>
                    <nav
                        className="flex items-center gap-6 text-xs font-medium text-muted-foreground"
                        aria-label="Footer"
                    >
                        {/* `.link-quiet` rather than a colour swap alone, so the
                            links stay discoverable as links without relying on
                            the hover state. */}
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
