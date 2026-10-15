/**
 * Who sees which announcement, and what a valid one looks like.
 *
 * Two kinds of announcement share the word:
 *
 * · **Platform announcements** (`convex/announcements.ts`) are admin-authored
 *   and rendered as a dismissible banner. They used to be broadcast to everyone;
 *   now each one carries an `audience`, which is how an instructor-only notice
 *   reaches teaching staff without also landing on every learner's dashboard.
 * · **Course announcements** (`convex/courseAnnouncements.ts`) belong to a
 *   single course and its owner. Their audience is the enrollment, so they have
 *   no `audience` field — being in the course *is* the audience.
 *
 * This file is the single source for the audience rule and the text limits, the
 * same shape as `lib/publishing.ts`: the Convex functions enforce it and
 * `lib/announcements.test.ts` pins the edges, so the browser never re-derives
 * who should see what.
 */

/** Storage ceilings, checked server-side. Shared with the authoring UIs. */
export const ANNOUNCEMENT_LIMITS = {
  title: 120,
  body: 2000,
} as const;

export type AnnouncementAudience = "everyone" | "instructors" | "students";

export const ANNOUNCEMENT_AUDIENCES: ReadonlyArray<{
  value: AnnouncementAudience;
  label: string;
  description: string;
}> = [
  {
    value: "everyone",
    label: "Everyone",
    description: "Learners and teaching staff.",
  },
  {
    value: "instructors",
    label: "Instructors only",
    description: "Teaching staff only — learners never see it.",
  },
  {
    value: "students",
    label: "Learners only",
    description: "Learners only — staff never see it.",
  },
];

/**
 * Reads an audience off a stored row or a request.
 *
 * Rows written before audiences existed have no field, and those notices were
 * shown to everybody, so an absent or unrecognised value means `everyone`.
 * That default is also what makes the field safe to add without a migration.
 */
export function normalizeAudience(
  value: string | undefined | null,
): AnnouncementAudience {
  return value === "instructors" || value === "students"
    ? value
    : "everyone";
}

export function audienceLabel(audience: string | undefined | null): string {
  const normalized = normalizeAudience(audience);
  return (
    ANNOUNCEMENT_AUDIENCES.find((option) => option.value === normalized)?.label ??
    "Everyone"
  );
}

/**
 * Whether an announcement addressed to `audience` should be shown to `role`.
 *
 * `admin` counts as teaching staff, matching `isStaff` in
 * `convex/helpers/auth.ts` — an admin's console is a staff console, so hiding
 * instructor notices from them would only make the audience harder to reason
 * about.
 */
export function audienceMatchesRole(
  audience: string | undefined | null,
  role: "student" | "instructor" | "admin",
): boolean {
  switch (normalizeAudience(audience)) {
    case "instructors":
      return role === "instructor" || role === "admin";
    case "students":
      return role === "student";
    default:
      return true;
  }
}

export interface AnnouncementText {
  title: string;
  body: string;
}

export interface CleanAnnouncementText extends AnnouncementText {
  /** A human-readable reason the input was rejected, or null when it is fine. */
  error: string | null;
}

/**
 * Trims and bounds an announcement's text.
 *
 * Returns the cleaned pair plus an error rather than throwing, so the same
 * function serves a Convex mutation (which throws the message) and a client
 * form (which can show it inline). Both messages name the field, because
 * "invalid input" tells an author nothing about which box to fix.
 */
export function cleanAnnouncementText(input: {
  title: string;
  body: string;
}): CleanAnnouncementText {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title || title.length > ANNOUNCEMENT_LIMITS.title) {
    return {
      title,
      body,
      error: `Title is required and must be at most ${ANNOUNCEMENT_LIMITS.title} characters`,
    };
  }
  if (!body || body.length > ANNOUNCEMENT_LIMITS.body) {
    return {
      title,
      body,
      error: `Body is required and must be at most ${ANNOUNCEMENT_LIMITS.body} characters`,
    };
  }
  return { title, body, error: null };
}
