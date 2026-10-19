import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { ReadCtx } from "./helpers/auth";

/**
 * The public face of an instructor.
 *
 * Deliberately a small, hand-written projection rather than the user document:
 * `users` also holds an email, a phone number, a birthday and an encrypted bank
 * account, and the safest way to keep those out of a public page is for the
 * page to never be handed them in the first place. A read that returns `Doc<"users">`
 * would leak all four the day someone spreads it into a card.
 */

/**
 * Read bound for one instructor's listings. An instructor with more published
 * courses than this has a profile that needs reorganising, not a bigger number.
 */
const MAX_PROFILE_COURSES = 60;

/** The fields of a user that may be shown to anybody signed out. */
export interface PublicInstructor {
  _id: Id<"users">;
  name: string;
  imageUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  pronouns?: string;
  /** When the account was created — rendered as "Instructor since …". */
  joinedAt: number;
  /**
   * The running total behind the profile's star average.
   *
   * Carried on the card as well as the full profile so the header stars and the
   * review block cannot disagree — they are the same two numbers read once. The
   * comment on each field is on `users` in `schema.ts`; nothing outside this file
   * needs to know how the pair is maintained.
   */
  instructorRatingSum?: number;
  instructorRatingCount?: number;
}

/** A listing as the profile shows it: enough for a card, nothing internal. */
export interface PublicProfileCourse {
  _id: Id<"courses">;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl?: string;
  category?: string;
  level?: string;
  price?: number;
  currency?: string;
  featured?: boolean;
  createdAt: number;
  /**
   * The course's own rating total, so a profile card can print stars without a
   * per-course read. Same sum/count pair as `users`, maintained by
   * `convex/reviews.ts`.
   */
  ratingSum?: number;
  ratingCount?: number;
}

/**
 * Resolves a user id to a person who is allowed to have a public profile, or
 * `null`.
 *
 * The role gate is the important one. `users` carries profile fields for
 * everyone — a learner fills in a bio, a location and a website on the same
 * Settings page an instructor does. Serving those at `/instructors/<id>` would
 * turn a personal profile into a public directory of every account, one guessed
 * id at a time. Only instructors and admins teach, so only they are published.
 *
 * A suspended account resolves to `null` for the same reason
 * `helpers/auth.getCurrentUser` treats one as signed out: a suspension that
 * leaves the profile live would not be a suspension.
 */
async function loadPublicInstructor(
  ctx: ReadCtx,
  instructorId: Id<"users">,
): Promise<Doc<"users"> | null> {
  const user = await ctx.db.get(instructorId);
  if (!user) return null;
  if (user.suspendedAt !== undefined) return null;
  if (user.role !== "instructor" && user.role !== "admin") return null;
  return user;
}

/**
 * Narrows a user document to the public subset, trimming empty strings away.
 *
 * Exported because the search page draws the same person from the same
 * fields: a card that named somebody "Glypha Instructor" while their profile
 * page said "Ada Lovelace" would be two truths about one row, and the search
 * result is the one a learner meets first.
 */
export function toPublicInstructor(user: Doc<"users">): PublicInstructor {
  return {
    _id: user._id,
    // A name is the one field the page cannot do without; Clerk always
    // populates it, but a hand-seeded row may not have.
    name: user.name?.trim() || "Glypha Instructor",
    imageUrl: user.imageUrl || undefined,
    bio: user.bio?.trim() || undefined,
    location: user.location?.trim() || undefined,
    website: user.website?.trim() || undefined,
    pronouns: user.pronouns?.trim() || undefined,
    joinedAt: user.createdAt,
    instructorRatingSum: user.instructorRatingSum,
    instructorRatingCount: user.instructorRatingCount,
  };
}

/**
 * The "taught by" line on a course page.
 *
 * Split out from {@link getPublicProfile} so a course page does not pay for a
 * read of every other course the instructor has listed just to print a name.
 */
export const getInstructorCard = query({
  args: { instructorId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await loadPublicInstructor(ctx, args.instructorId);
    if (!user) return null;
    return toPublicInstructor(user);
  },
});

/**
 * A full public profile: the person, and the courses they currently sell.
 *
 * Public by design — this is the page an instructor shares — so it returns only
 * published listings and only the fields in {@link PublicInstructor}. Nothing
 * here is scoped to a caller, which is also why there is no `requireUser`.
 */
export const getPublicProfile = query({
  args: { instructorId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await loadPublicInstructor(ctx, args.instructorId);
    if (!user) return null;

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_instructor_published", (q) =>
        q.eq("instructorId", args.instructorId).eq("published", true),
      )
      // Descending so the cap keeps the *newest* sixty rather than the oldest.
      .order("desc")
      .take(MAX_PROFILE_COURSES);

    // Then ordered the way the public catalog orders itself — featured first,
    // newest next — so an instructor's best listing leads their profile the same
    // way it leads `/courses`. Done in memory because the list is already capped
    // at sixty and a two-key sort cannot be expressed as an index walk here.
    courses.sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    return {
      instructor: toPublicInstructor(user),
      courses: courses.map(
        (course): PublicProfileCourse => ({
          _id: course._id,
          title: course.title,
          slug: course.slug,
          description: course.description,
          thumbnailUrl: course.thumbnailUrl,
          category: course.category,
          level: course.level,
          price: course.price,
          currency: course.currency,
          featured: course.featured,
          createdAt: course.createdAt,
          ratingSum: course.ratingSum,
          ratingCount: course.ratingCount,
        }),
      ),
      // The count the page prints. Equal to `courses.length` today; named so a
      // future "load more" can report the real total from the same response.
      courseCount: courses.length,
    };
  },
});
