import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { generateCertificateSerial } from "../lib/certificates";
import type { NotificationType } from "./inbox";
import {
  canManageCourse,
  isStaff,
  requireUser,
  type Id,
  type UserDoc,
  type WriteCtx,
} from "./helpers/auth";
import { evaluateForLearner } from "./helpers/completion";
import { getInstalledTemplate } from "./helpers/certificateTemplate";
import { logAudit } from "./helpers/audit";

/**
 * `internal.inbox.internalNotification`, reached by wire name instead of through
 * `internal` from `./_generated/api`.
 *
 * `convex/_generated/*` is produced by `npx convex dev` and does not list the
 * `inbox` module yet, so importing it as `internal.inbox` does not compile until
 * codegen runs again. The wire name is exactly what codegen will emit
 * ("modulePath:exportName"), so this can become `internal.inbox.internalNotification`
 * with no other change — same workaround as `lib/durable-rate-limit.ts`.
 */
const enqueueNotification = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    type: NotificationType;
    title: string;
    body?: string;
    href?: string;
    actorId?: Id<"users">;
  },
  Id<"notifications">
>("inbox:internalNotification");

/** Fresh entropy for a serial. crypto.randomUUID is available in the runtime. */
function entropy(): string {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  return uuid;
}

/**
 * Issues a certificate if it doesn't exist yet, returns the existing one
 * otherwise. `override` lets an instructor or admin issue on a learner's
 * behalf without the completion bar (for manual awards).
 */
async function issueForUser(
  ctx: WriteCtx,
  user: UserDoc,
  courseId: Id<"courses">,
  opts: {
    issuedBy?: UserDoc;
    override?: boolean;
    templateId?: Id<"certificateTemplates"> | null;
  } = {},
) {
  const existing = await ctx.db
    .query("certificates")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", user._id).eq("courseId", courseId),
    )
    .unique();
  if (existing) return existing._id;

  if (!opts.override) {
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", courseId),
      )
      .unique();
    if (!enrollment) {
      throw new Error("You are not enrolled in this course");
    }

    const completion = await evaluateForLearner(
      ctx,
      courseId,
      user._id,
      enrollment.completedLessonIds,
    );
    if (!completion.eligible) {
      throw new Error(completion.blockers.join(" "));
    }
  }

  const [course, holder, issuer] = await Promise.all([
    ctx.db.get(courseId),
    ctx.db.get(user._id),
    opts.issuedBy ? ctx.db.get(opts.issuedBy._id) : Promise.resolve(null),
  ]);
  if (!course) throw new Error("Course not found");

  const holderName = holder?.name ?? holder?.email ?? "Unknown learner";
  // An admin award is attributed to whoever pressed the button; a self-serve
  // award to the course owner.
  const issuerName =
    issuer?.name ?? (await ctx.db.get(course.instructorId))?.name ?? "Glypha Learn";

  const issuedAt = Date.now();

  // Resolve the installed template at issuance time. Recorded on the certificate
  // so a later template swap cannot retroactively change what was issued.
  // Callers that pass an explicit id (including null to force plain artwork)
  // opt out of this lookup entirely.
  let templateId = opts.templateId;
  if (templateId === undefined) {
    const active = await getInstalledTemplate(ctx);
    templateId = active?._id ?? null;
  }

  // Serials are public identifiers, so collisions have to be impossible rather
  // than merely unlikely. 8 hex chars of UUID entropy makes a clash negligible,
  // but retry anyway — a duplicate serial would make a verify link ambiguous.
  let serial = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCertificateSerial(issuedAt, entropy());
    const clash = await ctx.db
      .query("certificates")
      .withIndex("by_serial", (q) => q.eq("serial", candidate))
      .unique();
    if (!clash) {
      serial = candidate;
      break;
    }
  }
  if (!serial) throw new Error("Could not allocate a certificate serial");

  const certificateId = await ctx.db.insert("certificates", {
    userId: user._id,
    courseId,
    issuedAt,
    serial,
    holderName,
    courseTitle: course.title,
    issuerName,
    templateId: templateId ?? undefined,
  });

  // Log certificate earned activity
  await ctx.db.insert("learningActivities", {
    userId: user._id,
    type: "certificate_earned",
    courseId,
    certificateId,
    metadata: {
      serial,
      courseTitle: course.title,
    },
    createdAt: issuedAt,
  });

  // Increment certificate goals
  await ctx.runMutation(internal.goals.incrementGoalProgress, {
    userId: user._id,
    type: "earn_certificates",
    amount: 1,
    date: issuedAt,
  });

  // Also increment course completion goal (earning a certificate means completing a course)
  await ctx.runMutation(internal.goals.incrementGoalProgress, {
    userId: user._id,
    type: "complete_courses",
    amount: 1,
    date: issuedAt,
  });

  // Increment study streak for certificate achievement
  await ctx.runMutation(internal.goals.incrementGoalProgress, {
    userId: user._id,
    type: "study_streak_days",
    amount: 1,
    date: issuedAt,
  });

  // PDF render + email are best-effort side effects: the certificate is valid
  // without them, so they are scheduled rather than run inline. Mutations
  // cannot call runAction (only queries and actions can), so this goes through
  // the scheduler to fire right after this transaction commits.
  await ctx.scheduler.runAfter(
    0,
    internal.certificateArtifacts.issueCertificateArtifacts,
    {
      certificateId,
      serial,
      holderName,
      holderEmail: holder?.email ?? undefined,
      courseTitle: course.title,
      issuerName,
      issuedAt,
      // Snapshot the design in use so the PDF matches what the admin had
      // installed at issuance, even if they swap it later.
      templateId: templateId ?? undefined,
    },
  );

  return certificateId;
}

/**
 * Learner-initiated issuance. Idempotent: clicking twice returns the same
 * certificate. The completion bar is every lesson done plus every quiz passed.
 */
export const issueCertificate = mutation({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await issueForUser(ctx, user, args.courseId);
  },
});

/**
 * Issues automatically once the learner crosses the completion bar. Called at
 * the end of lesson completion and quiz submission so a learner never has to
 * hunt for a "Get certificate" button. Silently does nothing until they are
 * actually eligible.
 */
export const issueIfEligible = internalMutation({
  args: {
    userId: v.id("users"),
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const existing = await ctx.db
      .query("certificates")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseId", args.courseId),
      )
      .unique();
    if (existing) return existing._id;

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseId", args.courseId),
      )
      .unique();
    if (!enrollment) return null;

    const completion = await evaluateForLearner(
      ctx,
      args.courseId,
      args.userId,
      enrollment.completedLessonIds,
    );
    if (!completion.eligible) return null;

    const certificateId = await issueForUser(ctx, user, args.courseId);

    // Only reachable on the path that actually issues — every early return above
    // is either "not eligible" or "already issued" — so this cannot double-notify.
    // A certificate arriving with no notification is a dead inbox, and this is
    // the one funnel every issuance passes through.
    const course = await ctx.db.get(args.courseId);
    await ctx.runMutation(enqueueNotification, {
      userId: args.userId,
      type: "certificate_earned",
      title: "Your certificate is ready",
      body: course?.title,
      href: "/dashboard/certificates",
    });

    return certificateId;
  },
});

/** One of the caller's own certificates, for the detail page. */
export const getMyCertificate = query({
  args: { certificateId: v.id("certificates") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const cert = await ctx.db.get(args.certificateId);
    if (!cert || cert.userId !== user._id) return null;

    const [course, pdfUrl] = await Promise.all([
      ctx.db.get(cert.courseId),
      cert.pdfStorageId ? ctx.storage.getUrl(cert.pdfStorageId) : null,
    ]);

    return {
      _id: cert._id,
      serial: cert.serial ?? null,
      courseId: cert.courseId,
      courseTitle: cert.courseTitle ?? course?.title ?? "Course",
      holderName: cert.holderName ?? user.name ?? "You",
      issuerName: cert.issuerName ?? null,
      issuedAt: cert.issuedAt,
      revokedAt: cert.revokedAt ?? null,
      revocationReason: cert.revocationReason ?? null,
      pdfUrl: typeof pdfUrl === "string" ? pdfUrl : null,
    };
  },
});

/** Completion status for a course, so the UI can show what's still missing. */
export const getCourseCertificateStatus = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    const certificate = await ctx.db
      .query("certificates")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();

    if (!enrollment) {
      return {
        enrolled: false,
        certificate: null,
        completion: null,
      };
    }

    const completion = await evaluateForLearner(
      ctx,
      args.courseId,
      user._id,
      enrollment.completedLessonIds,
    );

    return {
      enrolled: true,
      certificate: certificate ?? null,
      completion,
    };
  },
});

/**
 * Learner's certificates with course title and PDF URL joined in. The list page
 * previously fetched published courses separately and dropped any certificate
 * whose course was unpublished — this is the single source for that view.
 */
export const listMyCertificates = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const certificates = await ctx.db
      .query("certificates")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    return await Promise.all(
      certificates.map(async (cert) => {
        const [course, pdfUrl] = await Promise.all([
          ctx.db.get(cert.courseId),
          cert.pdfStorageId
            ? ctx.storage.getUrl(cert.pdfStorageId)
            : Promise.resolve(null),
        ]);
        return {
          _id: cert._id,
          serial: cert.serial ?? null,
          courseId: cert.courseId,
          courseTitle: cert.courseTitle ?? course?.title ?? "Course",
          holderName: cert.holderName ?? user.name ?? "You",
          issuerName: cert.issuerName ?? null,
          issuedAt: cert.issuedAt,
          revokedAt: cert.revokedAt ?? null,
          revocationReason: cert.revocationReason ?? null,
          pdfUrl,
        };
      }),
    );
  },
});

/**
 * Public, read-only certificate verification. Intentionally unauthenticated so
 * an employer can follow the link. Takes a serial (e.g. GL-2026-3F9A1C77)
 * rather than a document id so the URL does not leak a Convex id.
 */
export const getCertificateForVerification = query({
  args: { ref: v.string() },
  handler: async (ctx, args) => {
    const ref = args.ref.trim();

    // Serial-only, deliberately. The serial (GL-YYYY-XXXXXXXX) is the one
    // public identifier for a certificate; the old fallback that also
    // accepted a raw Convex document id meant two incompatible reference
    // formats for the same record, so what resolved depended on which page
    // built the link — and it let anyone holding an internal id harvested
    // from an authenticated response (getMyCertificate, dashboard URLs) query
    // this unauthenticated endpoint with it. One format, one lookup path.
    //
    // Known gap (frontend not editable from here): the dashboard detail page
    // still falls back to `/verify/${certificateId}` when a certificate has
    // no serial, so such a certificate now shows "not found". Every row
    // should have a serial — issuance always allocates one and
    // `backfillCertificateDetails` repairs older rows — but the backfill is
    // not scheduled anywhere yet; running it is the follow-up, not a reason
    // to keep id lookups on a public endpoint.
    const cert = await ctx.db
      .query("certificates")
      .withIndex("by_serial", (q) => q.eq("serial", ref))
      .unique();

    if (!cert) {
      return null;
    }

    const [holder, course] = await Promise.all([
      ctx.db.get(cert.userId),
      ctx.db.get(cert.courseId),
    ]);
    const issuer = course ? await ctx.db.get(course.instructorId) : null;

    const revoked = typeof cert.revokedAt === "number";

    return {
      serial: cert.serial ?? null,
      holderName: cert.holderName ?? holder?.name ?? "Unknown",
      courseTitle: cert.courseTitle ?? course?.title ?? "Unknown course",
      issuerName: cert.issuerName ?? issuer?.name ?? null,
      issuedAt: cert.issuedAt,
      valid: !revoked,
      revokedAt: cert.revokedAt ?? null,
      revocationReason: cert.revocationReason ?? null,
    };
  },
});

// ─── Instructor / admin management ─────────────────────────────────────────

/**
 * Manual issue on a learner's behalf. Instructors may only do this for their
 * own courses; admins may do it for any course. Bypasses the completion bar
 * because that is the point of a manual award.
 */
export const issueCertificateForLearner = mutation({
  args: {
    userId: v.id("users"),
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    if (!isStaff(actor)) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!(await canManageCourse(ctx, actor, course))) {
      throw new Error("Not authorized to issue certificates for this course");
    }

    const learner = await ctx.db.get(args.userId);
    if (!learner) throw new Error("Learner not found");

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseId", args.courseId),
      )
      .unique();
    if (!enrollment) {
      throw new Error("That learner is not enrolled in this course");
    }

    const certificateId = await issueForUser(ctx, learner, args.courseId, {
      issuedBy: actor,
      override: true,
    });

    // Manual awards are the one issuance path worth auditing: they bypass the
    // completion bar, so a staff member's discretion — not the learner's work —
    // is what put the certificate in existence, and the log is the only record
    // of who did it. The learner's own issueCertificate call is deliberately
    // left out: it is gated by the completion rules rather than by anyone's
    // judgment, and logging it would bury the interesting rows in routine ones.
    await logAudit(ctx, {
      actorId: actor._id,
      action: "certificate.issue_override",
      targetType: "certificate",
      targetId: certificateId,
      details: { learnerUserId: args.userId, courseId: args.courseId },
    });

    return certificateId;
  },
});

/** Certificates issued for one of the instructor's own courses. */
export const listCourseCertificates = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const course = await ctx.db.get(args.courseId);
    if (!(await canManageCourse(ctx, actor, course))) {
      throw new Error("Not authorized to view certificates for this course");
    }

    const certificates = await ctx.db
      .query("certificates")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .order("desc")
      .collect();

    return await Promise.all(
      certificates.map(async (cert) => {
        const holder = await ctx.db.get(cert.userId);
        return {
          _id: cert._id,
          serial: cert.serial ?? null,
          holderName: cert.holderName ?? holder?.name ?? holder?.email ?? "Unknown",
          holderEmail: holder?.email ?? null,
          courseTitle: cert.courseTitle ?? course?.title ?? "Course",
          issuedAt: cert.issuedAt,
          revokedAt: cert.revokedAt ?? null,
          revocationReason: cert.revocationReason ?? null,
        };
      }),
    );
  },
});

/** Every certificate on the platform. Admin only. */
export const listAllCertificates = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireUser(ctx);
    if (actor.role !== "admin") throw new Error("Not authorized");

    const certificates = await ctx.db
      .query("certificates")
      .order("desc")
      .take(200);

    return await Promise.all(
      certificates.map(async (cert) => {
        const [holder, course] = await Promise.all([
          ctx.db.get(cert.userId),
          ctx.db.get(cert.courseId),
        ]);
        return {
          _id: cert._id,
          serial: cert.serial ?? null,
          holderName: cert.holderName ?? holder?.name ?? holder?.email ?? "Unknown",
          holderEmail: holder?.email ?? null,
          courseTitle: cert.courseTitle ?? course?.title ?? "Course",
          issuedAt: cert.issuedAt,
          revokedAt: cert.revokedAt ?? null,
          revocationReason: cert.revocationReason ?? null,
        };
      }),
    );
  },
});

/**
 * Withdraw a certificate. The row is kept (it is an audit record) but public
 * verification reports it as revoked and the PDF is not served.
 */
export const revokeCertificate = mutation({
  args: {
    certificateId: v.id("certificates"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const cert = await ctx.db.get(args.certificateId);
    if (!cert) throw new Error("Certificate not found");

    const course = await ctx.db.get(cert.courseId);
    if (!(await canManageCourse(ctx, actor, course))) {
      throw new Error("Not authorized to revoke this certificate");
    }

    const reason = args.reason?.trim() || undefined;

    await ctx.db.patch(args.certificateId, {
      revokedAt: Date.now(),
      revokedBy: actor._id,
      revocationReason: reason,
    });

    // Revoking a credential is exactly the kind of privileged, discretionary
    // act an audit trail exists for: the row survives, but only this log says
    // who withdrew it and why. Written in the same transaction, so there is no
    // window where a certificate is revoked without a trace. The serial goes
    // in details because that is the identifier an investigator actually has.
    await logAudit(ctx, {
      actorId: actor._id,
      action: "certificate.revoke",
      targetType: "certificate",
      targetId: args.certificateId,
      details: { serial: cert.serial ?? null, reason: reason ?? null },
    });
  },
});

/** Undo a revocation, keeping the original issue date. */
export const reinstateCertificate = mutation({
  args: { certificateId: v.id("certificates") },
  handler: async (ctx, args) => {
    const actor = await requireUser(ctx);
    const cert = await ctx.db.get(args.certificateId);
    if (!cert) throw new Error("Certificate not found");

    const course = await ctx.db.get(cert.courseId);
    if (!(await canManageCourse(ctx, actor, course))) {
      throw new Error("Not authorized to reinstate this certificate");
    }

    await ctx.db.patch(args.certificateId, {
      revokedAt: undefined,
      revokedBy: undefined,
      revocationReason: undefined,
    });

    // Reinstatement is audited for the same reason revocation is: without it
    // a revoked-looking certificate quietly becoming valid again would leave
    // no explanation in the trail.
    await logAudit(ctx, {
      actorId: actor._id,
      action: "certificate.reinstate",
      targetType: "certificate",
      targetId: args.certificateId,
      details: { serial: cert.serial ?? null },
    });
  },
});

/** Attaches the rendered PDF. Called only by the artifact action. */
export const recordPdfArtifact = internalMutation({
  args: {
    certificateId: v.id("certificates"),
    pdfStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.certificateId, { pdfStorageId: args.pdfStorageId });
  },
});

/**
 * Backfills serial and snapshot fields on certificates issued before those
 * existed, so old rows keep verifying and rendering correctly.
 */
export const backfillCertificateDetails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const certificates = await ctx.db.query("certificates").collect();
    let patched = 0;

    for (const cert of certificates) {
      if (cert.serial && cert.holderName && cert.courseTitle) continue;

      const [holder, course] = await Promise.all([
        ctx.db.get(cert.userId),
        ctx.db.get(cert.courseId),
      ]);

      const serial =
        cert.serial ??
        generateCertificateSerial(
          cert.issuedAt,
          entropy().slice(0, 8) + String(patched),
        );

      await ctx.db.patch(cert._id, {
        serial,
        holderName: cert.holderName ?? holder?.name ?? holder?.email ?? "Unknown learner",
        courseTitle: cert.courseTitle ?? course?.title ?? "Course",
        issuerName: cert.issuerName ?? "Glypha Learn",
      });
      patched += 1;
    }

    return { patched, total: certificates.length };
  },
});