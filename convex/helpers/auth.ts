import type {
  GenericDatabaseReader,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";

export type { Doc, Id };
export type UserDoc = Doc<"users">;

/**
 * Any Convex context that can read the database. Certificates need this from
 * queries, mutations and tests alike.
 */
export type ReadCtx = {
  db: GenericDatabaseReader<DataModel>;
};

/** Context that can also write — what issuance and revocation need. */
export type WriteCtx = GenericMutationCtx<DataModel>;

/** Query or mutation context; both can resolve the current identity. */
export type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

/**
 * Resolves the Convex user record for the current Clerk identity.
 *
 * Most modules previously inlined this lookup; certificates need it in a dozen
 * places (eligibility, issuance, revocation, PDF rendering), so it lives here.
 * Returns null when unauthenticated, when the Clerk webhook has not yet
 * created the Convex user, or when the account is suspended (`suspendedAt`
 * set by `admin.suspendUser`). Suspended == unauthenticated is the single
 * enforcement point: every caller that resolves identity through this helper
 * — queries and mutations alike — treats a suspended account as signed out,
 * so suspension needs no per-function checks and unsuspension is instant.
 * The Clerk account itself is not disabled; that stays a manual step because
 * it requires the Clerk Backend API and a support decision.
 */
export async function getCurrentUser(ctx: AnyCtx): Promise<UserDoc | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (user?.suspendedAt !== undefined) return null;
  return user;
}

/** Like {@link getCurrentUser} but throws instead of returning null. */
export async function requireUser(ctx: AnyCtx): Promise<UserDoc> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** True for instructors and admins. */
export function isStaff(user: UserDoc): boolean {
  return user.role === "instructor" || user.role === "admin";
}

/**
 * Throws unless the caller is an admin.
 *
 * Promoted here for the same reason `getCurrentUser` was: this existed as a
 * private copy in at least two modules (`certificateTemplates.ts`,
 * `categories.ts`), and they had already drifted — one threw "Not authorized",
 * the other "Not authorized — admin access required". One definition means the
 * message and the shape of the check are identical platform-wide.
 *
 * This is an identity check, not a capability check. Ownership rules still
 * belong in the calling function (`canManageCourse`).
 */
export async function requireAdmin(ctx: AnyCtx): Promise<UserDoc> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new Error("Not authorized — admin access required");
  }
  return user;
}

/**
 * Owner-or-admin check for a course. Returns false when the course is missing
 * so callers must also handle a null course.
 */
export async function canManageCourse(
  ctx: ReadCtx,
  user: UserDoc,
  course: Doc<"courses"> | null,
): Promise<boolean> {
  if (!course) return false;
  return course.instructorId === user._id || user.role === "admin";
}