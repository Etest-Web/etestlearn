import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: v.union(
      v.literal("student"),
      v.literal("instructor"),
      v.literal("admin")
    ),
    createdAt: v.number(),
  }).index("by_clerk_id", ["clerkId"]),

  courses: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    instructorId: v.id("users"),
    category: v.optional(v.string()),
    level: v.optional(v.string()),
    published: v.boolean(),
    thumbnailUrl: v.optional(v.string()),
    // Pricing in kobo (1 Naira = 100 kobo). Absent or 0 = free course.
    price: v.optional(v.number()),
    currency: v.optional(v.string()), // e.g. "NGN"
    // Denormalized "title description category" for full-text search.
    searchText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"])
    .index("by_instructor", ["instructorId"])
    .index("by_published", ["published"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["published"],
    }),

  // An instructor cannot pull a course somebody has already paid for off sale
  // on their own — buyers would lose the listing they paid into. They ask here
  // instead and an admin decides. Free and paid-but-unsold courses never need a
  // request; `lib/publishing.ts` owns that rule.
  courseUnpublishRequests: defineTable({
    courseId: v.id("courses"),
    requestedBy: v.id("users"),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"])
    .index("by_course", ["courseId"])
    .index("by_createdAt", ["createdAt"]),

  lessons: defineTable({
    courseId: v.id("courses"),
    title: v.string(),
    contentType: v.union(
      v.literal("video"),
      v.literal("article"),
      v.literal("quiz")
    ),
    order: v.number(),
    durationMinutes: v.optional(v.number()),
    content: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_course_order", ["courseId", "order"]),

  enrollments: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    progressPercent: v.number(),
    // Lesson ids the learner has completed; source of truth for progressPercent.
    completedLessonIds: v.optional(v.array(v.id("lessons"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_course", ["userId", "courseId"])
    .index("by_user", ["userId"])
    .index("by_course", ["courseId"]),

  quizzes: defineTable({
    lessonId: v.id("lessons"),
    title: v.string(),
    passingScore: v.number(), // 0-100
    createdAt: v.number(),
  }).index("by_lesson", ["lessonId"]),

  quizQuestions: defineTable({
    quizId: v.id("quizzes"),
    prompt: v.string(),
    order: v.number(),
  }).index("by_quiz_order", ["quizId", "order"]),

  quizOptions: defineTable({
    questionId: v.id("quizQuestions"),
    text: v.string(),
    isCorrect: v.boolean(),
  }).index("by_question", ["questionId"]),

  quizAttempts: defineTable({
    userId: v.id("users"),
    quizId: v.id("quizzes"),
    score: v.number(),
    maxScore: v.number(),
    passed: v.boolean(),
    createdAt: v.number(),
  }).index("by_user_quiz", ["userId", "quizId"])
    .index("by_quiz", ["quizId"])
    .index("by_user", ["userId"]),

  // Admin-uploaded certificate backgrounds. Certificates are rendered by
  // stamping the learner's data onto page 1 of the active template, so the
  // template owns the design and we only own the text. At most one template is
  // active at a time (enforced in convex/certificateTemplates.ts).
  certificateTemplates: defineTable({
    name: v.string(),
    pdfStorageId: v.id("_storage"),
    // Page 1 dimensions, captured at upload so text anchors can be stored as
    // fractions of the page and stay correct if the template is re-uploaded.
    pageWidth: v.number(),
    pageHeight: v.number(),
    active: v.optional(v.boolean()),
    // Per-field text placement as fractions of page width/height. A field
    // omitted uses the built-in default; set to null to keep it off the
    // certificate entirely (for a template that already prints its own title).
    layout: v.optional(
      v.object({
        heading: v.optional(v.union(v.null(), v.object({ x: v.number(), y: v.number(), size: v.optional(v.number()) }))),
        recipient: v.optional(v.union(v.null(), v.object({ x: v.number(), y: v.number(), size: v.optional(v.number()) }))),
        course: v.optional(v.union(v.null(), v.object({ x: v.number(), y: v.number(), size: v.optional(v.number()) }))),
        issuedOn: v.optional(v.union(v.null(), v.object({ x: v.number(), y: v.number(), size: v.optional(v.number()) }))),
        issuer: v.optional(v.union(v.null(), v.object({ x: v.number(), y: v.number(), size: v.optional(v.number()) }))),
        serial: v.optional(v.union(v.null(), v.object({ x: v.number(), y: v.number(), size: v.optional(v.number()) }))),
      }),
    ),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
  }).index("by_active", ["active"]),

  certificates: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    issuedAt: v.number(),
    // Public-facing serial shown on the certificate, the PDF and the verify
    // page (e.g. "GL-2026-3F9A1C77"). Unique in practice — issuance retries on
    // collision. Optional so certificates issued before the serial existed
    // still validate; `backfillCertificateDetails` fills them in.
    serial: v.optional(v.string()),
    // Names are snapshotted at issuance so a later profile or course rename
    // cannot retroactively change what an already-issued certificate says.
    holderName: v.optional(v.string()),
    courseTitle: v.optional(v.string()),
    issuerName: v.optional(v.string()),
    // Set when an instructor or admin withdraws the certificate. A revoked
    // certificate stays readable for audit but fails public verification.
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    revocationReason: v.optional(v.string()),
    // PDF rendered at issuance, stored in Convex file storage.
    pdfStorageId: v.optional(v.id("_storage")),
    // Template the PDF was rendered from, snapshotted at issuance so a later
    // template swap does not change an already-issued certificate.
    templateId: v.optional(v.id("certificateTemplates")),
  }).index("by_user", ["userId"])
    .index("by_course", ["courseId"])
    .index("by_user_course", ["userId", "courseId"])
    .index("by_serial", ["serial"]),

  purchases: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    paystackReference: v.string(),
    amount: v.number(), // kobo
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
    ),
    paidAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_reference", ["paystackReference"])
    .index("by_user", ["userId"])
    .index("by_user_course", ["userId", "courseId"])
    .index("by_course", ["courseId"])
    // Serves the unpublish gate: "does this course already have a buyer?" is a
    // single range read that stops at the first paid row.
    .index("by_course_status", ["courseId", "status"]),

  discussionThreads: defineTable({
    courseId: v.id("courses"),
    title: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_course", ["courseId"]),

  discussionMessages: defineTable({
    threadId: v.id("discussionThreads"),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_thread", ["threadId"]),

  instructorApplications: defineTable({
    userId: v.id("users"),
    fullName: v.string(),
    email: v.string(),
    expertise: v.string(),
    bio: v.string(),
    portfolioUrl: v.optional(v.string()),
    motivation: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // ─── Security infrastructure ──────────────────────────────────────────

  // Fixed-window rate limiter buckets, keyed by a caller-chosen string such
  // as "submitQuizAttempt:<userId>". Database-backed so limits survive
  // serverless cold starts — an in-memory Map resets on every cold start and
  // is trivially bypassed by forcing new instances. Expired rows are
  // overwritten in place on next use, so the table stays small.
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  }).index("by_key", ["key"])
    .index("by_reset", ["resetAt"]),

  // Immutable trail of privileged actions: role changes, certificate
  // revocations, instructor-application reviews, admin template operations.
  // Append-only by convention — rows are never patched or deleted so the log
  // stays trustworthy as an audit record.
  auditLogs: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    // JSON-encoded payload for action-specific context (old/new role, reason).
    // Stored as a string so any shape fits without schema migrations.
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"])
    .index("by_actor", ["actorId"])
    .index("by_action", ["action"]),

  // User learning goals for achievement tracking.
  // Supports multiple goal types with progress tracking towards targets.
  userGoals: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("complete_courses"),
      v.literal("complete_lessons"),
      v.literal("watch_hours"),
      v.literal("earn_certificates"),
      v.literal("pass_quizzes"),
      v.literal("study_streak_days"),
    ),
    target: v.number(), // Target value (e.g., 5 courses, 50 lessons, 100 hours)
    current: v.number(), // Current progress
    period: v.union(
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("yearly"),
      v.literal("all_time"),
    ),
    startDate: v.number(), // Unix timestamp
    endDate: v.optional(v.number()), // Unix timestamp, optional for all_time
    isActive: v.boolean(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_user_type_period", ["userId", "type", "period"]),

  // Learning activity log for streak calculation and detailed analytics
  learningActivities: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("lesson_completed"),
      v.literal("quiz_passed"),
      v.literal("quiz_attempted"),
      v.literal("certificate_earned"),
      v.literal("course_enrolled"),
      v.literal("course_completed"),
    ),
    courseId: v.optional(v.id("courses")),
    lessonId: v.optional(v.id("lessons")),
    quizId: v.optional(v.id("quizzes")),
    certificateId: v.optional(v.id("certificates")),
    metadata: v.optional(v.any()), // Additional data (e.g., duration minutes, score)
    createdAt: v.number(),
  }).index("by_user_created", ["userId", "createdAt"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_course", ["userId", "courseId"]),

  // ═══════════════════════════════════════════════════════════════════════
  // BEGIN friends block — mutual-approval social graph
  //
  // One row per relationship with a `status` field, and NO `pairKey` sort trick:
  // the directed pair (requester → addressee) is stored as sent, because
  // Convex indexes cannot express "either column equals me" in one range.
  // Reading your friends is therefore two range reads (everything you sent that
  // was accepted, everything sent to you that was accepted) merged in memory —
  // still index-driven, and no full table scan.
  //
  // A duplicate guard belongs in the mutation (check by_requester_addressee
  // before inserting) rather than in a unique index, which Convex does not
  // offer; the test suite asserts the second request is rejected.
  //
  // Activity visibility is enforced at read time in `friends.getFriendsActivity`:
  // it may only read the certificates/goals of users who share an accepted
  // friendship with the caller. That is the reason activity is not stored here
  // and duplicated per friend.
  // ═══════════════════════════════════════════════════════════════════════

  friendships: defineTable({
    requesterId: v.id("users"),
    addresseeId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_requester_status", ["requesterId", "status"])
    .index("by_addressee_status", ["addresseeId", "status"])
    .index("by_requester_addressee", ["requesterId", "addresseeId"]),

  // ═══════════════════════════════════════════════════════════════════════
  // END friends block
});

