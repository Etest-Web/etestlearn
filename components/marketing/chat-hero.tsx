"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUp, RotateCcw, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import TextLoop from "@/components/TextLoop";
import { useQuery } from "convex/react";
import { useReducedMotion } from "motion/react";
import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react";
import { api } from "@/convex/_generated/api";

// dotlottie-web compiles a WASM engine; its default URL is a CDN this site's
// CSP deliberately refuses. Ship the binary as a static asset instead and
// point the player at it once, at module load.
setWasmUrl("/assets/dotlottie-player.wasm");
import { GlowingShadow } from "@/components/ui/glowing-shadow";
import { averageRating, formatRating } from "@/lib/reviews";
import { formatCurrency } from "@/lib/currency";
import { findDigitalSkillInText, matchDigitalSkills } from "@/lib/digital-skills";

/**
 * Concept hero: the homepage as a chatbot screen instead of a landing page.
 *
 * The Glypha wave keeps its job from HeroPoster but loses the split layout —
 * it now spans the full width of a full-height plane, blurred into a backdrop,
 * and the conversation floats directly on it — no panel, no chrome. No
 * headline, no CTA rail: the input is the call to action.
 *
 * The assistant is deliberately canned (local state, keyword replies). This
 * page exists to judge the shape of the idea; wiring a real model is a
 * separate decision. The suggestion chips send real messages so the flow can
 * be felt, not just seen.
 */

type CourseRow = {
  _id: string;
  slug: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  category?: string;
  level?: string;
  price?: number;
  currency?: string;
  ratingSum?: number;
  ratingCount?: number;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text?: string;
  /** Set on assistant course-result messages: the canonical skill searched. */
  skillLabel?: string;
  /** The published courses matching that skill, best first. */
  courses?: CourseRow[];
};

/** Four canonical digital skills from lib/digital-skills — each one resolves
 *  to the course-search path, so the suggestion itself demonstrates the
 *  feature the page is built around. */
const SUGGESTIONS = [
  "Data Analysis",
  "Web Development",
  "UI/UX Design",
  "Digital Marketing",
] as const;

/** How many courses an assistant answer lists before deferring to the catalog. */
const MAX_COURSES_IN_CHAT = 5;

/** The four animation variants, picked per visitor tab at random. */
const LOTTIE_VARIANTS = [
  "/assets/funny-brain.lottie",
  "/assets/book-loading.lottie",
  "/assets/learning.lottie",
  "/assets/student.lottie",
] as const;
type LottieVariant = (typeof LOTTIE_VARIANTS)[number];

function cannedReply(prompt: string): string {
  const q = prompt.toLowerCase();
  if (q.includes("certificate")) {
    return "Every Glypha course ends with a quiz, and passing it issues a verifiable certificate automatically — each one carries its own public verification page anyone can check.";
  }
  if (q.includes("teach") || q.includes("instructor")) {
    return "Instructors hand-pick their course lineup, earn from every enrollment, and get paid out to a Nigerian bank account. Tap “Become an Instructor” in the menu to apply.";
  }
  if (q.includes("course") || q.includes("learn")) {
    return "Glypha runs hand-picked courses across design, tech, business and more — each with quizzes and a certificate at the end. Head to Browse Courses and I can narrow it down once I’m wired up.";
  }
  return "This concept only speaks digital skills and a few canned answers — try “Data Analysis”, “Web Development” or “Digital Marketing”. The real assistant will live here once the concept is approved.";
}

/** The assistant's answer to a digital-skill query: the published catalog,
 *  inline in the thread, capped, with the full result one tap away. */
function CourseAnswer({
  skillLabel,
  courses,
}: {
  skillLabel: string;
  courses: CourseRow[];
}) {
  const catalogHref = `/courses?q=${encodeURIComponent(skillLabel)}`;
  const empty = courses.length === 0;

  return (
    <div className="flex w-full justify-start">
      <div className="w-full max-w-[96%] space-y-3 rounded-2xl rounded-bl-md border border-rule bg-card/85 p-4 text-sm backdrop-blur-md">
        <p className="leading-body text-foreground">
          {empty ? (
            <>
              Nothing in the catalog carries{" "}
              <span className="font-semibold">{skillLabel}</span> yet — try a
              broader keyword.
            </>
          ) : (
            <>
              Here’s what the catalog has for{" "}
              <span className="font-semibold">{skillLabel}</span>:
            </>
          )}
        </p>

        {!empty && (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule">
            {courses.map((course) => {
              const average = averageRating(course.ratingSum, course.ratingCount);
              return (
                <li key={course._id}>
                  <Link
                    href={`/courses/${course.slug}`}
                    className="flex items-center gap-3 bg-background/60 px-3 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {course.thumbnailUrl ? (
                      <Image
                        src={course.thumbnailUrl}
                        alt=""
                        width={56}
                        height={56}
                        className="size-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-lg font-bold text-brand"
                      >
                        {course.title.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium leading-snug">
                        {course.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {course.category ? <span>{course.category}</span> : null}
                        {course.level ? <span>{course.level}</span> : null}
                        {average !== null ? (
                          <span className="inline-flex items-center gap-1">
                            <Star
                              aria-hidden="true"
                              className="size-3 fill-current text-amber-500"
                            />
                            {formatRating(average)}
                            {course.ratingCount ? ` (${course.ratingCount})` : ""}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">
                      {course.price && course.price > 0
                        ? formatCurrency(course.price / 100, course.currency ?? "NGN")
                        : "Free"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href={catalogHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
        >
          {empty ? "Browse the full catalog" : "See all matches in the catalog"}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function ChatHero() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<{ skill: string } | null>(null);
  const [lottieSrc, setLottieSrc] = useState<LottieVariant | null>(null);
  const reduceMotion = useReducedMotion();
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // As-you-type skill hints. Pure client-side matching against
  // lib/digital-skills — no Convex round trip per keystroke.
  const draftMatches = useMemo(
    () => (draft.trim().length >= 2 ? matchDigitalSkills(draft, 3) : []),
    [draft],
  );

  // The same public full-text query the /courses catalog uses (search index
  // over title/description/category, published only). Skipped until a send
  // resolves to a digital skill.
  const pendingResults = useQuery(
    api.courses.searchCourses,
    pendingSearch ? { query: pendingSearch.skill } : "skip",
  );

  // Pick the empty-state animation on mount, not at render: a random pick
  // during SSR would disagree with the client on hydration. Fresh random
  // every mount — refresh shuffles the variant, by design.
  useEffect(() => {
    setLottieSrc(LOTTIE_VARIANTS[Math.floor(Math.random() * LOTTIE_VARIANTS.length)]);
  }, []);

  // Keep the latest message in view as the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  // When the pending catalog query resolves, post it as the assistant's
  // answer. `pendingResults === undefined` means still loading — Convex
  // pushes again when the result settles.
  useEffect(() => {
    if (!pendingSearch || pendingResults === undefined) return;
    const rows: CourseRow[] = pendingResults
      .slice(0, MAX_COURSES_IN_CHAT)
      .map((course) => ({
        _id: course._id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        category: course.category,
        level: course.level,
        price: course.price,
        currency: course.currency,
        ratingSum: course.ratingSum,
        ratingCount: course.ratingCount,
      }));
    idRef.current += 1;
    setMessages((prev) => [
      ...prev,
      { id: idRef.current, role: "assistant", skillLabel: pendingSearch.skill, courses: rows },
    ]);
    setPendingSearch(null);
    setTyping(false);
  }, [pendingSearch, pendingResults]);

  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    [],
  );

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;

    // Any message mentioning a digital skill searches the published catalog —
    // inside the chat — instead of producing a canned reply.
    const skill = findDigitalSkillInText(text);
    idRef.current += 1;
    setMessages((prev) => [...prev, { id: idRef.current, role: "user", text }]);
    setDraft("");

    if (skill) {
      setPendingSearch({ skill: skill.label });
      setTyping(true);
      return;
    }

    setTyping(true);
    replyTimer.current = setTimeout(() => {
      idRef.current += 1;
      setMessages((prev) => [
        ...prev,
        { id: idRef.current, role: "assistant", text: cannedReply(text) },
      ]);
      setTyping(false);
    }, 750);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(draft);
  };

  const reset = () => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setMessages([]);
    setTyping(false);
    setDraft("");
  };

  const empty = messages.length === 0;

  return (
    <section className="relative flex min-h-[calc(100svh-4.5rem)] items-center justify-center overflow-hidden border-b border-rule">
      {/* The wave, full-bleed. Same props as the landing hero with one change:
          it now covers the whole plane instead of sitting beside a headline,
          and it renders on mobile too because the panel carrying the copy is
          a separate layer above it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex select-none items-center justify-center overflow-hidden text-brand/25 blur-lg dark:text-brand/30"
      >
        <TextLoop
          text="Glypha"
          shape="wave"
          speed={55}
          path=""
          direction="forward"
          separator="✦"
          curviness={48}
          fontSize={46}
          fontWeight={800}
          letterSpacing={8}
          uppercase
          color="currentColor"
          ribbon={false}
          className="w-full"
          pauseOnHover={false}
        />
      </div>

      {/* Colour wash so the plane is not a flat value under the panel. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-48 -top-56 h-152 w-152 rounded-full bg-brand/6 blur-3xl" />
        <div className="absolute -bottom-64 -right-40 h-[30rem] w-[30rem] rounded-full bg-brand/5 blur-3xl" />
      </div>

      <h1 className="sr-only">Glypha Learn — ask the assistant, or browse hand-picked courses</h1>

      {/* No panel, no bar: the conversation floats on the blurred wave. Only
          the bubbles and the composer carry their own fill, so the type stays
          legible while the animation stays visible behind them. */}
      <div className="relative flex w-full max-w-3xl flex-col">
        {!empty && (
          <div className="flex justify-end pb-2 pr-1">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              New chat
            </button>
          </div>
        )}

        {/* Thread */}
        <div
          ref={scrollRef}
          className="flex h-[26rem] flex-col overflow-y-auto py-4 sm:h-[29rem]"
          aria-live="polite"
        >
          {empty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              {/* Four variants, one per visitor, picked on mount — see the
                  lottieSrc effect. The box keeps its footprint either way. */}
              <div
                data-slot="lottie"
                className="size-48 sm:size-56"
              >
                {lottieSrc && (
                  <DotLottieReact
                    src={lottieSrc}
                    loop
                    autoplay={!reduceMotion}
                    aria-label="A decorative animation introducing the Glypha assistant"
                    className="h-full w-full"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                  What do you want to learn today?
                </p>
                <p className="mx-auto max-w-[48ch] text-pretty text-base leading-body text-muted-foreground">
                  Type a digital skill — I’ll pull the matching courses from the catalog.
                  Or ask about certificates and teaching on Glypha.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-rule-strong bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const mine = message.role === "user";
                if (mine) {
                  return (
                    <div key={message.id} className="flex w-full justify-end">
                      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm leading-body text-brand-foreground">
                        {message.text}
                      </div>
                    </div>
                  );
                }
                if (message.courses) {
                  return (
                    <CourseAnswer
                      key={message.id}
                      skillLabel={message.skillLabel ?? ""}
                      courses={message.courses}
                    />
                  );
                }
                return (
                  <div key={message.id} className="flex w-full justify-start">
                    <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-rule bg-card/85 px-4 py-2.5 text-sm leading-body text-foreground backdrop-blur-md">
                      {message.text}
                    </div>
                  </div>
                );
              })}
              {typing && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-rule bg-card/85 px-4 py-3 backdrop-blur-md">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: `${dot * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Live skill hints: what the draft is recognized as, one tap away. */}
        {draftMatches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Sparkles aria-hidden="true" className="size-3" />
              Digital skill
            </span>
            {draftMatches.map(({ skill }) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => send(skill.label)}
                className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand transition-colors hover:bg-brand hover:text-brand-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {skill.label}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <form onSubmit={onSubmit} className="pb-2 pt-2">
          <div className="relative h-[70px]">
            <GlowingShadow>
              <div className="relative flex h-full w-full items-center gap-3 rounded-full border border-brand/25 bg-card/90 py-2.5 pl-6 pr-2 backdrop-blur-xl transition-colors focus-within:border-brand/60">
            <label htmlFor="concept-chat-input" className="sr-only">
              Message Glypha AI
            </label>
            <input
              id="concept-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask anything about learning on Glypha…"
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!draft.trim() || typing}
              aria-label="Send message"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-all hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowUp aria-hidden="true" className="size-6" />
            </button>
              </div>
            </GlowingShadow>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/80">
            Concept preview — course answers come from the live published catalog; the assistant itself is not connected to a model yet.
          </p>
        </form>
      </div>
    </section>
  );
}
