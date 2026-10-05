import { Check } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

const PERKS = [
    "A visible star next to your name across the GlyphaWeb platform",
    "A certificate with its own public verification page anyone can check",
    "Proof you passed real assessments — not just watched videos",
];

export function StarFeature() {
    return (
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
            <Reveal>
                <div className="relative overflow-hidden rounded-sm border border-brand/30 bg-gradient-to-br from-brand/15 via-card to-card p-8 sm:p-12 lg:p-16">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand/20 blur-3xl"
                    />
                    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                        <div className="space-y-6">
                            <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
                                <span className="h-px w-8 bg-brand" aria-hidden="true" />
                                Only on Glypha
                            </p>
                            <h2 className="display-heading text-4xl text-balance sm:text-5xl">
                                Finish a course.
                                <br />
                                Earn your <span className="text-primary">preference star.</span>
                            </h2>
                            <p className="max-w-xl text-sm text-pretty text-muted-foreground md:text-base">
                                Most platforms hand you a PDF and wish you luck. Glypha Learning graduates get a
                                preference star — a permanent, visible marker of verified skill wherever your profile
                                appears on the GlyphaWeb platform.
                            </p>
                            <Link
                                href="/courses"
                                className="inline-flex h-11 items-center justify-center rounded-sm bg-foreground px-6 text-sm font-medium text-background transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            >
                                Start earning yours
                            </Link>
                        </div>

                        <ul className="space-y-4 rounded-sm border border-rule bg-card p-6 sm:p-8">
                            {PERKS.map(perk => (
                                <li key={perk} className="flex items-start gap-3 text-sm leading-body">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                                        <Check className="h-3 w-3" strokeWidth={3} />
                                    </span>
                                    {perk}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
