import type { Doc } from "../_generated/dataModel";
import type { ReadCtx } from "./auth";

/**
 * Reading accounts for a people search.
 *
 * There is exactly one way to look for a person on this platform, and both
 * surfaces that do it — the search page and the friends Discover tab — go
 * through this module. Two directories that answered "who is on Glypha?"
 * differently would be a bug waiting to be reported: the same name returning
 * different people depending on which box you typed it in.
 */

/**
 * How many accounts one role range may contribute to a search.
 *
 * `users` has no search index, and a substring match could not use one
 * anyway — so the people half of a search is a bounded read. The `by_role`
 * index makes it an *index range* rather than a table scan, which is strictly
 * better than the whole-table scan this replaces: staff rows are never read
 * while looking for students, and the three roles are read separately rather
 * than interleaved.
 *
 * The cost is honest and worth stating plainly: **a match beyond the window
 * is invisible, not merely unranked.** The window is taken **newest first**,
 * because the person somebody is looking for is usually the one who just
 * signed up — and a newest-first window is the one that fails least
 * surprisingly.
 *
 * **At scale, replace this with a `searchIndex` on a normalised `searchText`
 * field on `users`**, exactly as `courses` already has — the course half of
 * the search does precisely that. That is a schema change plus a backfill of
 * the existing accounts, so it is deliberately not done in the same breath as
 * the feature.
 */
export const USER_SEARCH_SCAN_CAP = 500;

/**
 * The rows of one role, newest first.
 *
 * `.order("desc")` reverses the index range. Every Convex index carries an
 * implicit `_creationTime` as its last component, so a role range is already
 * ordered by creation time and this is "newest first" — not "highest id
 * first", which would be a different (and undocumented) order.
 */
export async function readUsersByRole(
  ctx: ReadCtx,
  role: "student" | "instructor" | "admin",
): Promise<Doc<"users">[]> {
  return ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", role))
    .order("desc")
    .take(USER_SEARCH_SCAN_CAP);
}

/**
 * Every account, from the three role ranges, newest first.
 *
 * The three ranges are the whole `users` table — there are only three roles —
 * so this is a full account list by another route, and it is capped the same
 * way. Merged and re-sorted by creation time so the window is "the newest
 * accounts on the platform" rather than "the newest students, then the newest
 * instructors", which would silently favour one role.
 */
export async function readSearchableUsers(
  ctx: ReadCtx,
): Promise<Doc<"users">[]> {
  const [students, instructors, admins] = await Promise.all([
    readUsersByRole(ctx, "student"),
    readUsersByRole(ctx, "instructor"),
    readUsersByRole(ctx, "admin"),
  ]);

  return [...students, ...instructors, ...admins].sort(
    (a, b) => b._creationTime - a._creationTime,
  );
}
