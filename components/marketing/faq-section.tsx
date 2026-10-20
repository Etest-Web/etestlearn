"use client";

import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Reveal } from "./reveal";
import { FAQS } from "./faq-data";

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
  return (
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
  );
}