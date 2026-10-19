"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  PlayCircle,
  Search as SearchIcon,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { StarRating } from "@/components/star-rating";
import { friendsApi } from "@/lib/friends-api";
import { searchApi } from "@/lib/search-api";
import { initialsFor, relationshipLabel, roleLabel } from "@/lib/friends";
import { formatNaira } from "@/lib/instructor-earnings";
import { averageRating, formatRating } from "@/lib/reviews";
import {
  matchExcerpt,
  toCourseHit,
  type CourseHit,
  type InstructorHit,
  type PersonHit,
  type SearchResults,
} from "@/lib/search";

/**
 * The dashboard search.
 *
 * One box, three kinds of answer: a **course** to take, an **instructor** who
 * teaches, and a **person** to learn alongside. Those used to be three
 * separate surfaces — the search box knew only about courses, the friends page
 * had its own people directory, and an instructor could not be found by name at
 * all — so "is there anything here for me?" had no single place to be asked.
 *
 * The three are separate sections rather than one interleaved list because a
 * course and a person are not comparable: one has a price and a syllabus, the
 * other has an avatar and a request button. Each is ranked against its own
 * kind, on the server, in one query — so one keystroke is one round trip and
 * one consistent snapshot.
 *
 * The query is server-owned (`lib/search-api.ts`): the section sizes are a
 * product decision, and a client-supplied limit would be a client-supplied
 * read size across three collections at once.
 *
 * The one list this page caps itself is the *browse* list — the whole catalog,
 * shown when there is no query. That one is not a search result, it is
 * everything, and it can be hundreds of cards.
 */
const BROWSE_LIMIT = 24;

function SearchView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q")?.trim() ?? "";

  // The dashboard header's search form is `hidden md:block`, and below `md` the
  // only affordance is an icon linking here. Without a field on the page itself,
  // a phone user arrived at a page that could not be searched — so this is a
  // real input, not a decorative echo of the header.
  const [draft, setDraft] = useState(query);

  // Keep the field in step with the URL, so the back button (and a link to
  // somebody else's search) fills the box in rather than leaving the old words
  // behind. Only the URL changes this — typing alone never rewrites it.
  useEffect(() => {
    setDraft(query);
  }, [query]);

  const results = useQuery(searchApi.search, query ? { query } : "skip");
  // With no query the page shows the whole catalog rather than an empty state.
  // That is what makes the field on this page necessary: a bare visit used to
  // be a dead end on mobile.
  const allCourses = useQuery(api.courses.listPublishedCourses);

  const sendRequest = useMutation(friendsApi.sendRequest);
  // One in-flight action at a time, keyed so the right control shows its
  // spinner while every other control is disabled — a double-tap cannot create
  // two friendship rows.
  const [busy, setBusy] = useState<string | null>(null);
  // Mirrored into a live region: a toast is visual only, so the outcome of a
  // mutation also has to reach a screen reader.
  const [announcement, setAnnouncement] = useState("");

  const loading = query ? results === undefined : allCourses === undefined;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    // Pushing rather than replacing keeps the previous search reachable with the
    // back button, which is what someone who mis-spelled a word wants.
    router.push(next ? `/dashboard/search?q=${encodeURIComponent(next)}` : "/dashboard/search");
  }

  function clear() {
    setDraft("");
    router.push("/dashboard/search");
  }

  async function requestFriendship(person: PersonHit) {
    setBusy(`send:${person._id}`);
    try {
      await sendRequest({ userId: person._id });
      const message = `Friend request sent to ${person.name}.`;
      setAnnouncement(message);
      toast.success(message);
    } catch (error: unknown) {
      // `friends.sendRequest` throws a sentence, not a code — it already knows
      // how to say "you already asked them" in a way a person can act on.
      const text =
        error instanceof Error ? error.message : "Something went wrong — try again.";
      setAnnouncement(text);
      toast.error(text);
    } finally {
      setBusy(null);
    }
  }

  const browseCourses = allCourses?.map(toCourseHit);
  const courses = query ? results?.courses : browseCourses;

  return (
    <PageShell>
      {/* ── The spotlight ──────────────────────────────────────────────────
          The whole page hangs off this one control, so it is the page's
          hero: centred, larger than anything around it, and lit.

          The light is three layers rather than one. A wide wash behind the
          whole block, a soft halo under the field, and a tighter core inside
          it. One layer reads as a coloured box; three read as light falling
          on the field.

          The two close layers brighten on focus by changing **opacity only**.
          Animating their colour would repaint a blurred region on every
          frame of the transition, which is the one thing on this page that
          could cost a frame; an opacity change is a compositor operation and
          costs nothing. The blur is static for the same reason — it is
          painted once, when the page settles, and never repainted.

          `isolate` matters: the layers sit at `-z-10`, and without a stacking
          context of their own they would fall behind the page background
          rather than behind the field. */}
      <section className="relative isolate flex flex-col items-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_55%,var(--brand)_0%,transparent_72%)] opacity-[0.09]"
        />

        <PageHeader
          className="hero-enter-1 w-full max-w-2xl sm:justify-center text-center"
          // Kept in plain quotes rather than a template with typographic quotes:
          // the header's display face already carries the voice, and a template
          // literal here was the source of a parse error that no editor flagged.
          title={query ? `Search results for "${query}"` : "Search"}
          description={resultSummary(query, results, browseCourses?.length)}
        />

        <form
          onSubmit={submit}
          role="search"
          className="hero-enter-2 group relative mt-2 w-full max-w-2xl"
        >
          {/* The halo. Two radii rather than one: a wide soft spread and a
              tighter core, so the light has depth instead of reading as a
              single blurred rectangle behind a field. Opacity is the only
              thing that changes when the field takes focus.

              Both sit on the field's own box, so the blur spreads the light
              evenly on every side. A layer that hung below the field would
              read as a stain under it, not as light around it.

              Dimmer on a phone, where the field runs edge to edge and only
              the top and bottom of the aura are on screen — at full strength
              the underside reads as a shadow rather than as light. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-brand/25 opacity-50 blur-2xl transition-opacity duration-500 group-focus-within:opacity-100 sm:opacity-70"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-lg bg-brand/45 opacity-30 blur-md transition-opacity duration-500 group-focus-within:opacity-100 sm:opacity-40"
          />

          <SearchIcon
            className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors duration-300 group-focus-within:text-brand"
            size={20}
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search courses, instructors and people…"
            aria-label="Search courses, instructors and people"
            // Opaque in both themes: the halo behind the field is meant to be
            // seen around its edges, not through the middle of it.
            className="h-14 rounded-sm border-rule bg-background pl-14 pr-24 text-base group-focus-within:border-brand/60 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/20 sm:pr-32 dark:bg-background"
          />
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clear}
              aria-label="Clear search"
              className="absolute right-14 top-1/2 -translate-y-1/2 sm:right-20"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {/* Icon-only on a phone, where the field is already narrow. A
                `type="search"` input puts a Search key on the soft keyboard
                that submits the form, so the button is a convenience there,
                not the only way through — and the label is still read out. */}
            <SearchIcon className="sm:hidden" size={16} aria-hidden />
            <span className="hidden sm:inline">Search</span>
            <span className="sr-only sm:hidden">Search</span>
          </Button>
        </form>
      </section>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {loading ? (
        // A skeleton in the same grid as the settled state, so results do not
        // reflow the page when they land. The previous fallback here was a bare
        // "Searching..." string, the only one in the dashboard.
        <div className="flex flex-col gap-10">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
          <RowSkeleton count={3} height="h-24" />
          <RowSkeleton count={3} height="h-24" />
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <CourseSection
            courses={courses ?? []}
            more={results?.moreCourses ?? false}
            browsing={!query}
          />
          <InstructorSection
            instructors={results?.instructors ?? []}
            more={results?.moreInstructors ?? false}
            searching={Boolean(query)}
            term={query}
          />
          <PeopleSection
            people={results?.people ?? []}
            more={results?.morePeople ?? false}
            searching={Boolean(query)}
            busy={busy}
            onSend={requestFriendship}
          />
        </div>
      )}
    </PageShell>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────

function CourseSection({
  courses,
  more,
  browsing,
}: {
  courses: CourseHit[];
  more: boolean;
  browsing: boolean;
}) {
  // A bare visit shows the catalog, and the catalog can be hundreds of cards.
  // The search results are capped by the server; the browse list is capped
  // here, and says so — a list that ends with no explanation reads as "that
  // was everything".
  const shown = browsing ? courses.slice(0, BROWSE_LIMIT) : courses;
  const hidden = browsing ? courses.length - shown.length : 0;

  return (
    <ResultSection
      id="search-courses"
      title="Courses"
      icon={BookOpen}
      count={shown.length}
      description={
        browsing
          ? "Every published course on Glypha."
          : "Published courses matching your search."
      }
      more={more}
    >
      {shown.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No courses found"
          description="Nothing in the catalog matches that search. Try fewer or different keywords."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((course) => (
            <CourseResultCard key={course._id} course={course} />
          ))}
        </div>
      )}

      {hidden > 0 ? (
        <p className="text-sm text-muted-foreground">
          Showing {shown.length} of {courses.length}.{" "}
          <span className="text-foreground">
            Add a keyword to narrow the list.
          </span>
        </p>
      ) : null}
    </ResultSection>
  );
}

function InstructorSection({
  instructors,
  more,
  searching,
  term,
}: {
  instructors: InstructorHit[];
  more: boolean;
  searching: boolean;
  term: string;
}) {
  return (
    <ResultSection
      id="search-instructors"
      title="Instructors"
      icon={GraduationCap}
      count={searching ? instructors.length : undefined}
      description={
        searching
          ? "Teachers whose name, bio or location matches your search."
          : "Search by name to find who teaches here."
      }
      more={more}
    >
      {instructors.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={searching ? "No instructors found" : "Find an instructor"}
          description={
            searching
              ? "No teacher on Glypha matches that name yet. Try their first name."
              : "Type a name in the box above and the teachers who match will appear here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {instructors.map((instructor) => (
            <InstructorResult
              key={instructor._id}
              instructor={instructor}
              term={term}
            />
          ))}
        </ul>
      )}
    </ResultSection>
  );
}

function PeopleSection({
  people,
  more,
  searching,
  busy,
  onSend,
}: {
  people: PersonHit[];
  more: boolean;
  searching: boolean;
  busy: string | null;
  onSend: (person: PersonHit) => void;
}) {
  return (
    <ResultSection
      id="search-people"
      title="People"
      icon={Users}
      count={searching ? people.length : undefined}
      description={
        searching
          ? "Other learners on Glypha, by name or by the address they signed up with."
          : "Search by name to find somebody to learn alongside."
      }
      more={more}
    >
      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searching ? "Nobody found" : "Find your study people"}
          description={
            searching
              ? "No account matches that. Check the spelling, or try part of an email address."
              : "Type a name in the box above and the learners who match will appear here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {people.map((person) => (
            <PersonResult
              key={person._id}
              person={person}
              busy={busy}
              onSend={() => onSend(person)}
            />
          ))}
        </ul>
      )}
    </ResultSection>
  );
}

/**
 * One section's heading and body.
 *
 * The count sits next to the title rather than in the description, so a
 * glance says "3 courses, 1 instructor, 8 people" without reading a sentence.
 */
function ResultSection({
  id,
  title,
  icon: Icon,
  count,
  description,
  more,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  count?: number;
  description: string;
  more: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-rule pb-2">
        <h2
          id={`${id}-heading`}
          className="display-subheading flex flex-wrap items-center gap-2 text-xl text-foreground"
        >
          <Icon size={18} className="shrink-0 text-brand-ink" aria-hidden />
          <span className="shrink-0">{title}</span>
          {count !== undefined ? (
            <span className="tabular inline-flex items-center rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {children}

      {/* Saying how many are hidden beats silently truncating: a result list
          that ends with no explanation reads as "that was everything". */}
      {more ? (
        <p className="text-sm text-muted-foreground">
          More matched than are shown.{" "}
          <span className="text-foreground">Add a keyword to narrow the list.</span>
        </p>
      ) : null}
    </section>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────

function CourseResultCard({ course }: { course: CourseHit }) {
  return (
    // The Card carries the surface — a hairline, no shadow — and the
    // thumbnail sits flush against it.
    <Card className="group gap-0 overflow-hidden p-0">
      <div className="relative h-44 overflow-hidden bg-surface-sunken">
        <img
          src={course.thumbnailUrl || "/hero-backdrop.jpg"}
          alt={course.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        {course.category ? (
          <Badge
            variant="outline"
            className="absolute left-4 top-4 border-0 bg-background/80 backdrop-blur-sm"
          >
            {course.category}
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="mb-4 line-clamp-2 text-xl font-semibold leading-snug text-foreground">
          {course.title}
        </h3>
        <p className="mb-6 line-clamp-2 text-sm leading-[1.6] text-muted-foreground">
          {course.description}
        </p>
        <div className="mt-auto flex items-center justify-between border-t border-rule pt-4">
          <Badge className="gap-1">
            <PlayCircle />
            {course.price ? formatNaira(course.price) : "Free"}
          </Badge>
          {/* Goes to the enrolled-course route, which is also where an
              unenrolled learner is sent to enrol. */}
          <Button
            variant="outline"
            size="icon"
            render={<Link href={`/dashboard/courses/${course.slug}`} />}
            aria-label={`View ${course.title}`}
            className="hover:border-brand hover:bg-brand hover:text-brand-foreground"
          >
            <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function InstructorResult({
  instructor,
  term,
}: {
  instructor: InstructorHit;
  term: string;
}) {
  // Hidden entirely when unrated: "0.0 stars" from nobody is a worse first
  // impression than no number at all.
  const rating = averageRating(instructor.ratingSum, instructor.ratingCount);
  const reviewCount = instructor.ratingCount ?? 0;

  return (
    <li className="flex flex-col gap-4 border border-rule bg-card p-4 transition-colors hover:border-rule-strong sm:flex-row sm:items-start">
      <PersonAvatar name={instructor.name} imageUrl={instructor.imageUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-foreground break-words">{instructor.name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RolePill role={instructor.role} />
          {rating !== null ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <StarRating value={rating} size="xs" />
              <span className="font-semibold text-foreground">
                {formatRating(rating)}
              </span>
              <span>
                ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
              </span>
            </span>
          ) : null}
          {instructor.location ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={14} aria-hidden />
              {instructor.location}
            </span>
          ) : null}
        </div>
        {instructor.bio ? (
          <p className="mt-3 text-sm leading-[1.6] text-muted-foreground">
            <Excerpt text={instructor.bio} term={term} />
          </p>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        render={<Link href={`/instructors/${instructor._id}`} />}
        className="shrink-0 self-start"
      >
        View profile
        <ArrowRight size={16} aria-hidden />
      </Button>
    </li>
  );
}

function PersonResult({
  person,
  busy,
  onSend,
}: {
  person: PersonHit;
  busy: string | null;
  onSend: () => void;
}) {
  const relationship = person.relationship;

  return (
    <li className="flex flex-col gap-4 border border-rule bg-card p-4 transition-colors hover:border-rule-strong sm:flex-row sm:items-center">
      <PersonAvatar name={person.name} imageUrl={person.imageUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-foreground break-words">{person.name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RolePill role={person.role} />
          {relationship.kind !== "none" ? (
            <span className="inline-flex items-center gap-1 rounded-sm border border-rule bg-surface-sunken px-2 py-1 text-xs font-bold text-muted-foreground">
              {relationshipLabel(relationship)}
            </span>
          ) : null}
          {person.email ? (
            <span className="truncate text-xs text-muted-foreground">
              {person.email}
            </span>
          ) : null}
        </div>
      </div>
      <PersonAction
        person={person}
        busy={busy}
        onSend={onSend}
      />
    </li>
  );
}

/**
 * What the page may offer this person.
 *
 * The four states are the four things that can be true between two accounts,
 * and each one gets the action that is actually useful — not one button that
 * fails with an error message for three of the four.
 */
function PersonAction({
  person,
  busy,
  onSend,
}: {
  person: PersonHit;
  busy: string | null;
  onSend: () => void;
}) {
  const relationship = person.relationship;

  if (relationship.kind === "accepted") {
    return (
      <Button
        variant="outline"
        size="sm"
        render={<Link href="/dashboard/friends" />}
        className="shrink-0"
      >
        <Check size={16} aria-hidden />
        Friends
      </Button>
    );
  }

  if (relationship.kind === "pending") {
    return relationship.direction === "incoming" ? (
      // They asked first, so the useful thing is to answer it — not to open a
      // second request and leave both dangling.
      <Button
        variant="outline"
        size="sm"
        render={<Link href="/dashboard/friends?tab=requests" />}
        className="shrink-0"
      >
        <Mail size={16} aria-hidden />
        Request received
      </Button>
    ) : (
      <Button variant="outline" size="sm" disabled className="shrink-0">
        <Clock size={16} aria-hidden />
        Request sent
      </Button>
    );
  }

  if (relationship.kind === "declined" && relationship.direction === "incoming") {
    // They asked, and you turned them down. The platform does not re-offer
    // somebody you turned down — the same rule the Discover tab follows — so
    // there is no button here, only the state. A request you sent and they
    // declined is different: that one may be re-asked, and
    // `friends.sendRequest` re-opens it.
    return (
      <span className="shrink-0 text-xs text-muted-foreground">
        You declined this request
      </span>
    );
  }

  return (
    <Button
      size="sm"
      disabled={busy !== null}
      onClick={onSend}
      aria-label={`Send a friend request to ${person.name}`}
      className="shrink-0"
    >
      {busy === `send:${person._id}` ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <UserPlus className="h-4 w-4" aria-hidden />
      )}
      Send request
    </Button>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────

/**
 * Renders initials when there is no picture and **never** renders an `<img>`
 * without a real `src` — no broken image, and no `pravatar.cc` placeholder.
 *
 * `alt=""` is deliberate: the person's name is always rendered as text beside
 * the avatar, so announcing the image too would read their name twice. The
 * fallback initials are hidden from assistive tech for the same reason.
 */
function PersonAvatar({
  name,
  imageUrl,
  size = "lg",
}: {
  name: string;
  imageUrl: string | null;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar size={size}>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback aria-hidden>{initialsFor(name)}</AvatarFallback>
    </Avatar>
  );
}

/** Role as a tinted pill — colour plus a word, never colour alone. */
function RolePill({ role }: { role: PersonHit["role"] }) {
  const Icon = role === "student" ? BookOpen : role === "instructor" ? Award : Sparkles;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-bold text-brand-ink">
      <Icon size={14} aria-hidden />
      {roleLabel(role)}
    </span>
  );
}

/**
 * A snippet of matched text, with the match marked.
 *
 * The match is highlighted here rather than in the result list because the
 * term is only known on the page, and it is a `<mark>` around plain text
 * rather than injected HTML — a bio is user input.
 */
function Excerpt({ text, term }: { text: string; term: string }) {
  const parts = matchExcerpt(text, term);
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark
            key={index}
            className="rounded-sm bg-brand/15 px-0.5 text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** A few rows of skeleton, matching the settled row height. */
function RowSkeleton({ count = 3, height = "h-20" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={`${height} w-full rounded-sm`} />
      ))}
    </div>
  );
}

// ─── Copy ─────────────────────────────────────────────────────────────────

/** "3 courses, 1 instructor and 8 people matched." — the count is the sentence. */
function resultSummary(
  query: string,
  results: SearchResults | undefined,
  browseCount: number | undefined,
): string {
  if (!query) {
    return browseCount === undefined
      ? "Search every published course, every instructor, and every learner on Glypha by name."
      : `Search every published course, every instructor, and every learner on Glypha by name. ${browseCount} courses are live right now.`;
  }
  if (!results) return "Searching…";

  const { courses, instructors, people } = results;
  if (courses.length + instructors.length + people.length === 0) {
    return `Nothing on Glypha matches “${query}”.`;
  }
  return `${courses.length} course${plural(courses.length)}, ${instructors.length} instructor${plural(instructors.length)} and ${people.length} ${people.length === 1 ? "person" : "people"} matched.`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

export default function DashboardSearchPage() {
  return (
    <PageShell aria-busy>
      <Suspense
        fallback={
          <div className="flex flex-col gap-8">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-12 w-full max-w-xl rounded-sm" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-80 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        }
      >
        <SearchView />
      </Suspense>
    </PageShell>
  );
}
