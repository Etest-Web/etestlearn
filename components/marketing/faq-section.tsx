"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Reveal } from "./reveal";
import ScriptOrg from "@/components/seo/script-org";
import type { SchemaOrg } from "@/components/seo/types";

const FAQS = [
  {
    q: "Are the certificates actually verifiable?",
    a: "Yes. Each certificate is issued with a unique ID and a public verification page of its own. An employer, a client or a school can confirm it in seconds without contacting us.",
  },
  {
    q: "How much do courses cost?",
    a: "It depends on the course. Many are free, and paid ones are priced in naira and settled through Paystack. The price is always on the listing before you enroll, and there are no added fees at checkout.",
  },
  {
    q: "What exactly is the preference star?",
    a: "It appears next to your name across the GlyphaWeb platform once you complete a course. It marks you as someone whose skills have been verified, and it stays there.",
  },
  {
    q: "Who can become an instructor?",
    a: "Anyone with real expertise. You apply with your portfolio and bio, and a person reads it before publishing access is granted. That review is how the catalog stays curated.",
  },
  {
    q: "Do I need an account to browse?",
    a: "No. The whole catalog is open. You only need to sign in to enroll, track your progress, take quizzes and earn certificates.",
  },
];

function buildFaqSchema(faqs: Array<{ q: string; a: string }>): SchemaOrg {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-rule">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-6 py-5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span
          className={cn(
            "text-base font-medium transition-colors",
            open && "text-primary",
          )}
        >
          {q}
        </span>
        <Plus
          aria-hidden="true"
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
            open && "rotate-45 text-primary",
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
          <p className="max-w-2xl pb-5 text-pretty text-sm leading-body text-muted-foreground">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection() {
  const schema = buildFaqSchema(FAQS);
  return (
    <>
      <ScriptOrg organization={schema} />
      <section className="mx-auto max-w-3xl px-4 pb-20 md:pb-28">
        <Reveal>
          <p className="rule-heading eyebrow pb-4">Before you enroll</p>
          <h2 className="display-heading text-3xl text-balance sm:text-4xl md:text-5xl">
            What people ask first.
          </h2>
        </Reveal>

        <Reveal delay={90}>
          <div className="mt-10 border-t border-rule">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </Reveal>
      </section>
    </>
  );
}