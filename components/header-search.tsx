"use client";

import { useEffect, useId, useState, type FocusEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Search as SearchIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Input } from "@/components/ui";
import { roleLabel } from "@/lib/friends";
import { MIN_SEARCH_LENGTH, type SearchResults } from "@/lib/search";
import { searchApi } from "@/lib/search-api";
import { cn } from "@/lib/utils";

/**
 * The dashboard header's search field.
 *
 * A plain GET form only answered on submit, so somebody had to guess a word
 * before the page would say whether anything matched. This keeps that form as
 * the no-javascript path, but also runs the same query the search page uses as
 * they type and offers the three kinds of result underneath — courses,
 * instructors and people — each linking straight to its destination.
 *
 * The query is server-owned (`lib/search-api.ts`), so the section sizes are a
 * product decision here, not a client-supplied read size. Typing is debounced:
 * Convex caches and dedupes subscriptions, but there is no reason to ask the
 * same question for every intermediate letter of a name.
 */
const DEBOUNCE_MS = 200;
const CAPS = { courses: 4, instructors: 3, people: 3 } as const;

type Suggestion = {
  key: string;
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
};

type Group = { title: string; items: Suggestion[] };

function groupsFrom(results: SearchResults | undefined): Group[] {
  if (!results) return [];
  return [
    {
      title: "Courses",
      items: results.courses.slice(0, CAPS.courses).map((course) => ({
        key: `course:${course._id}`,
        label: course.title,
        sub: course.category ?? "Course",
        href: `/dashboard/courses/${course.slug}`,
        icon: BookOpen,
      })),
    },
    {
      title: "Instructors",
      items: results.instructors.slice(0, CAPS.instructors).map((instructor) => ({
        key: `instructor:${instructor._id}`,
        label: instructor.name,
        sub: instructor.location ?? "Instructor",
        href: `/instructors/${instructor._id}`,
        icon: GraduationCap,
      })),
    },
    {
      title: "People",
      items: results.people.slice(0, CAPS.people).map((person) => ({
        key: `person:${person._id}`,
        label: person.name,
        sub: roleLabel(person.role),
        // No public profile exists for a learner, so the useful destination is
        // the full result for that name, where the request button lives.
        href: `/dashboard/search?q=${encodeURIComponent(person.name)}`,
        icon: Users,
      })),
    },
  ].filter((group) => group.items.length > 0);
}

export function HeaderSearch() {
  const router = useRouter();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(draft.trim());
      setActiveIndex(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const results = useQuery(
    searchApi.search,
    term.length >= MIN_SEARCH_LENGTH ? { query: term } : "skip",
  );
  // The debounce is also the gate on showing anything: an empty `term` used to
  // flash a "See all results for ''" row for the first 200ms of typing.
  const showDropdown = open && term.length >= MIN_SEARCH_LENGTH;

  const groups = groupsFrom(results);
  const quick = groups.flatMap((group) => group.items);
  const indexByKey = new Map(quick.map((item, index) => [item.key, index]));
  const seeAll: Suggestion = {
    key: "see-all",
    label: `See all results for “${term}”`,
    sub: "",
    href: `/dashboard/search?q=${encodeURIComponent(term)}`,
    icon: SearchIcon,
  };
  const options = [...quick, seeAll];

  function select() {
    setOpen(false);
    setActiveIndex(-1);
    // The dashboard layout survives navigation, so the field would otherwise
    // keep a stale term after jumping to a suggestion.
    setDraft("");
    setTerm("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) {
        select();
        router.push(option.href);
      }
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    // A mouse press on a suggestion moves focus to the link *inside* this
    // wrapper; that is not a click-away. Only a focus outside closes it.
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative w-full max-w-md min-w-0" onBlur={onBlur}>
      {/* Kept a real GET form: Enter submits to the full results page without
          JavaScript, so the dropdown is an enhancement, not the only path. */}
      <form
        action="/dashboard/search"
        method="get"
        role="search"
        data-tour="search"
        className="relative w-full"
      >
        <SearchIcon
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={18}
          aria-hidden
        />
        <Input
          name="q"
          type="search"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search courses, instructors, people..."
          aria-label="Search courses, instructors and people"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
          }
          className="h-12 rounded-sm border-rule pl-11 text-[15px]"
        />
      </form>

      {showDropdown ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(24rem,60vh)] overflow-y-auto rounded-sm border border-rule bg-card p-1.5 shadow-xl"
        >
          {results === undefined ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Searching…
            </div>
          ) : quick.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No quick matches yet — keep typing.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.title} role="group" aria-label={group.title}>
                <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const index = indexByKey.get(item.key) ?? -1;
                  return (
                    <SuggestionRow
                      key={item.key}
                      item={item}
                      id={`${listId}-opt-${index}`}
                      active={index === activeIndex}
                      onHover={() => setActiveIndex(index)}
                      onSelect={select}
                    />
                  );
                })}
              </div>
            ))
          )}

          <div className="my-1 border-t border-rule" role="presentation" />
          <SuggestionRow
            item={seeAll}
            id={`${listId}-opt-${quick.length}`}
            active={activeIndex === quick.length}
            onHover={() => setActiveIndex(quick.length)}
            onSelect={select}
          />
        </div>
      ) : null}
    </div>
  );
}

function SuggestionRow({
  item,
  id,
  active,
  onHover,
  onSelect,
}: {
  item: Suggestion;
  id: string;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      id={id}
      role="option"
      aria-selected={active}
      href={item.href}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-sm px-3 py-2 text-sm text-foreground outline-none transition-colors",
        active ? "bg-brand/10" : "hover:bg-surface-sunken",
      )}
    >
      <Icon size={16} className="shrink-0 text-brand-ink" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.sub ? (
        <span className="shrink-0 text-xs text-muted-foreground">{item.sub}</span>
      ) : null}
    </Link>
  );
}
