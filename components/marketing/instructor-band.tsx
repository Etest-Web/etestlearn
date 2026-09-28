import { ArrowRight, LineChart, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

const PERKS = [
    { icon: Wallet, label: "Set your own pricing in Naira" },
    { icon: LineChart, label: "Enrollment & quiz analytics built in" },
    { icon: ShieldCheck, label: "Every application is human-reviewed" },
];

export function InstructorBand() {
    return (
        <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
            <Reveal>
                <div className="grid gap-10 rounded-3xl bg-foreground p-8 text-background sm:p-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:p-16">
                    <div className="space-y-5">
                        <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.24em] opacity-60">
                            <span className="h-px w-8 bg-current opacity-40" aria-hidden="true" />
                            For instructors
                        </p>
                        <h2 className="font-display text-4xl leading-[0.95] tracking-wide text-balance sm:text-5xl">
                            You know the craft.
                            <br />
                            We handle everything else.
                        </h2>
                        <p className="max-w-lg text-sm leading-relaxed text-pretty opacity-70 md:text-base">
                            Publishing on Glypha Learning means structured lessons, quizzes, payments, and analytics are
                            already wired for you. You bring the expertise — we bring the learners.
                        </p>
                        <Link
                            href="/become-instructor"
                            className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-brand-foreground transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            Apply to teach
                            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </Link>
                    </div>

                    <ul className="space-y-4 self-center">
                        {PERKS.map(({ icon: Icon, label }) => (
                            <li
                                key={label}
                                className="flex items-center gap-4 rounded-xl border border-background/15 px-5 py-4"
                            >
                                <Icon className="h-5 w-5 shrink-0 text-primary" />
                                <span className="text-sm font-medium">{label}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </Reveal>
        </section>
    );
}
