"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "Are the certificates actually verifiable?",
    a: "Yes. Every certificate is issued with a unique ID and its own public verification page — anyone (an employer, a client, a school) can confirm it's real in seconds, without contacting us.",
  },
  {
    q: "How much do courses cost?",
    a: "It varies by course. Many are free; paid courses are priced in Naira and processed securely through Paystack. The price is always shown before you enroll — no hidden fees.",
  },
  {
    q: "What exactly is the preference star?",
    a: "When you complete a course, a preference star appears next to your name across the EtestWeb platform. It tells partners and clients on that platform that your skills are verified — permanently.",
  },
  {
    q: "Who can become an instructor?",
    a: "Anyone with real expertise can apply through the instructor form. Every application — including your portfolio and bio — is reviewed by our team before publishing access is granted, which is how the catalog stays curated.",
  },
  {
    q: "Do I need an account to browse?",
    a: "No — you can explore the entire catalog freely. You only need to sign in to enroll, track progress, take quizzes, and earn certificates.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-6 py-5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className={cn("text-base font-medium transition-colors", open && "text-brand")}>
          {q}
        </span>
        <Plus
          aria-hidden="true"
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
            open && "rotate-45 text-brand",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-5 text-sm leading-relaxed text-pretty text-muted-foreground">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <SectionHeading
          index="04"
          kicker="Questions"
          title={
            <>
              Asked,
              <br />
              answered.
            </>
          }
          description="Everything learners usually want to know before their first enrollment."
        />
        <Reveal>
          <div className="border-t border-border">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
