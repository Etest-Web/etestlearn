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
    // Set when an admin suspends the account. `helpers/auth.getCurrentUser`
    // treats a suspended user as unauthenticated, so every function that
    // resolves identity through the shared helper refuses them platform-wide
    // without any data being deleted — unsuspending restores everything.
    suspendedAt: v.optional(v.number()),
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
    // Admin-curated "featured" flag; featured courses sort first on the
    // public catalog. Optional so every pre-existing course reads as false.
    featured: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"])
    .index("by_instructor", ["instructorId"])
    .index("by_published", ["published"])
    // Serves the admin featured picker and the catalog's featured-first sort.
    .index("by_featured", ["featured"])
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
    .index("by_createdAt", ["createdAt"])
    .index("by_course_status", ["courseId", "status"]),

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
    // Optional video asset. `content` stays the legacy free URL field
    // (YouTube/Vimeo/direct) for lessons authored before this feature; when
    // `videoAssetId` is set the lesson plays from the encrypted HLS ladder
    // served through `videoAssets` and `content` is ignored by the player.
    videoAssetId: v.optional(v.id("videoAssets")),
    createdAt: v.number(),
  }).index("by_course_order", ["courseId", "order"])
    .index("by_video_asset", ["videoAssetId"]),

  /**
   * A transcoded, AES-128-encrypted HLS ladder for a lesson video.
   *
   * Why this is a separate table rather than a column on `lessons`: the asset
   * outlives the lesson it was attached to (an instructor re-uploads and the
   * old ladder must stay retrievable for cleanup), and it carries a lot of
   * metadata the lesson does not need to re-read on every page load.
   *
   * Encryption is our own, applied in `lib/video-encode.ts` after ffmpeg
   * produces the ladder: every `.m4s` segment is CBC-encrypted with a
   * per-asset key, and `keyStorageId` points at the blob holding that key. The key
   * never ships to the browser in a static file — it is handed out by an
   * auth-gated route, one time-limited session at a time. Raw segments on
   * storage are therefore ciphertext to anyone who lacks that token.
   */
  videoAssets: defineTable({
    lessonId: v.id("lessons"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    // Raw instructor upload on UploadThing. The ladder output stays in Convex
    // storage; only these capability URLs leave the platform, and only the
    // transcode worker ever fetches them (host-allowlisted).
    sourceFileUrl: v.string(),
    sourceFileKey: v.string(),
    // Master playlist plus one media playlist per ladder variant; segments are
    // per-variant ciphertext blobs. All are served only through tokenized routes.
    // These stay unset until the transcode completes (`status === "ready"`).
    masterManifestStorageId: v.optional(v.id("_storage")),
    variantManifestStorageIds: v.optional(v.array(v.id("_storage"))),
    segments: v.optional(
      v.array(
        v.object({
          variant: v.number(),
          name: v.string(),
          storageId: v.id("_storage"),
        }),
      ),
    ),
    // Blob holding the 16-byte AES key. Read by the auth-gated route, never
    // exposed as a URL.
    keyStorageId: v.optional(v.id("_storage")),
    // 16-byte IV as hex, published in `#EXT-X-KEY` at serve time.
    ivHex: v.optional(v.string()),
    // Resolution ladder: { label, height, bitrate, bandwidth }.
    variants: v.optional(
      v.array(
        v.object({
          label: v.string(),
          height: v.number(),
          bitrate: v.number(),
          bandwidth: v.number(),
        }),
      ),
    ),
    // Total source duration in seconds, probed after transcode.
    durationSeconds: v.optional(v.number()),
    // Previous asset this upload replaces. Its blobs are deleted once the new
    // ladder is ready, so in-flight viewers keep working until the swap.
    replacesAssetId: v.optional(v.id("videoAssets")),
    // Time-limited playback token minted per student session.
    activeToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    // ffmpeg exit / error message when status === "failed".
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_lesson", ["lessonId"])
    .index("by_status", ["status"]),

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

  // The one certificate design. Certificates are rendered by stamping the
  // learner's data onto page 1 of this template, so it owns the artwork and we
  // only own the text. It is a table rather than a settings document because a
  // file in Convex storage is referenced by id, and that id is snapshotted onto
  // each certificate at issuance. `active` is vestigial but load-bearing for
  // existing rows — see convex/helpers/certificateTemplate.ts.
  certificateTemplates: defineTable({
    name: v.string(),
    pdfStorageId: v.id("_storage"),
    // Page 1 dimensions, captured at upload so text anchors can be stored as
    // fractions of the page and stay correct if the template is re-uploaded.
    pageWidth: v.number(),
    pageHeight: v.number(),
    // Always true on the installed template. A row that predates the
    // single-template rule may still carry `false`, which is why readers go
    // through getInstalledTemplate() instead of assuming the newest row wins.
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
    // Refund annotation written by `payments.markRefunded`. Access is NOT
    // revoked automatically: an admin reviews each case, and revocation is a
    // separate decision (delete the enrollment) so a mistaken refund annotation
    // never silently removes someone's course.
    refundedAt: v.optional(v.number()),
    refundReason: v.optional(v.string()),
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
    // Moderation lock: set by an admin, refuses new messages in
    // `discussions.postMessage` while leaving history readable.
    locked: v.optional(v.boolean()),
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
  // BEGIN inbox block — direct messages + notifications
  //
  // DM threads store their two participants denormalized as userA/userB in
  // sorted Id order rather than an array, because Convex indexes cannot
  // filter on array membership. Listing "my threads newest first" is then two
  // range scans (by_user_a / by_user_b) merged in memory, instead of a full
  // table scan with an `includes()` predicate.
  //
  // Unread state is a per-(user, thread) read marker rather than a flag on
  // each message: one row per thread instead of one write per message read,
  // and an unread badge is a single count over by_user instead of a scan of
  // every message in every thread.
  // ═══════════════════════════════════════════════════════════════════════

  dmThreads: defineTable({
    userA: v.id("users"), // sorted ascending; always the smaller Id
    userB: v.id("users"), // always the larger Id
    lastMessageAt: v.optional(v.number()), // undefined until the first send
    lastMessagePreview: v.optional(v.string()), // truncated for the list view
    createdAt: v.number(),
  })
    .index("by_user_a", ["userA", "lastMessageAt"])
    .index("by_user_b", ["userB", "lastMessageAt"]),

  dmMessages: defineTable({
    threadId: v.id("dmThreads"),
    senderId: v.id("users"),
    body: v.string(),
    // Only the recipient's copy is meaningful; the sender has implicitly read
    // what they just wrote.
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_thread_created", ["threadId", "createdAt"]),

  // High-water mark per user per thread. Anything created after it is unread.
  dmReadMarkers: defineTable({
    userId: v.id("users"),
    threadId: v.id("dmThreads"),
    lastReadAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_user_thread", ["userId", "threadId"]),

  // In-app event feed. Rows are written by other modules' mutations (or by an
  // internal helper) rather than by the client, so `type` is a closed union the
  // UI can switch on exhaustively.
  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("certificate_earned"),
      v.literal("course_completed"),
      v.literal("quiz_graded"),
      v.literal("streak_milestone"),
      v.literal("discussion_reply"),
      v.literal("task_assigned"),
      v.literal("task_graded"),
      v.literal("group_invite"),
      v.literal("friend_request"),
      v.literal("friend_accepted"),
      v.literal("course_purchased"),
      v.literal("course_reminder"),
      v.literal("direct_message"),
      v.literal("instructor_application_reviewed"),
    ),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()), // in-app deep link, never an external URL
    actorId: v.optional(v.id("users")),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_unread", ["userId", "readAt"]),

  // ═══════════════════════════════════════════════════════════════════════
  // END inbox block
  // BEGIN task block — graded assignments + personal study tasks
  //
  // Two distinct things share one "Task" page, so they get two tables rather
  // than one table with a nullable owner: `assignments` is instructor-authored
  // and course-scoped with graded submissions, `studyTasks` is a private
  // self-authored checklist. Merging them would make every access check a
  // three-way branch and would let a "no course" row leak across users.
  // ═══════════════════════════════════════════════════════════════════════

  assignments: defineTable({
    courseId: v.id("courses"),
    lessonId: v.optional(v.id("lessons")),
    title: v.string(),
    instructions: v.optional(v.string()),
    createdBy: v.id("users"),
    dueAt: v.optional(v.number()),
    maxPoints: v.optional(v.number()),
    // draft → only the author sees it; open → students see and submit;
    // closed → visible but no further submissions accepted.
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_course", ["courseId"])
    .index("by_course_status", ["courseId", "status"])
    .index("by_creator", ["createdBy"]),

  assignmentSubmissions: defineTable({
    assignmentId: v.id("assignments"),
    userId: v.id("users"),
    content: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("graded"),
    ),
    submittedAt: v.optional(v.number()),
    score: v.optional(v.number()),
    feedback: v.optional(v.string()),
    gradedBy: v.optional(v.id("users")),
    gradedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assignment", ["assignmentId"])
    .index("by_assignment_submitted", ["assignmentId", "submittedAt"])
    .index("by_user", ["userId"])
    .index("by_assignment_user", ["assignmentId", "userId"]),

  studyTasks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    notes: v.optional(v.string()),
    courseId: v.optional(v.id("courses")),
    dueAt: v.optional(v.number()),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    completedAt: v.optional(v.number()), // undefined means outstanding
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    // Serves both "my open tasks" and "what did I finish this month".
    .index("by_user_completed", ["userId", "completedAt"])
    .index("by_user_due", ["userId", "dueAt"]),

  // ═══════════════════════════════════════════════════════════════════════
  // END task block
  // BEGIN group block — course-scoped study groups
  //
  // Groups hang off a course, so admission reuses the existing course-access
  // branch (admin → course instructor → enrolled). Both students and
  // instructors may create groups; only the course instructor (or an admin) may
  // archive one, which is why `isArchived` exists instead of a hard delete —
  // members' posts must not vanish with the group.
  //
  // Join requests are a separate table from membership so that "pending for me"
  // and "this user's groups" are both single index reads, and so that declining
  // leaves an auditable trail rather than a no-op insert/delete pair.
  // ═══════════════════════════════════════════════════════════════════════

  studyGroups: defineTable({
    courseId: v.id("courses"),
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    // Public groups are joinable by any enrolled student; private groups
    // require a request to be approved.
    isPrivate: v.boolean(),
    isArchived: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_course", ["courseId"]),

  studyGroupMembers: defineTable({
    groupId: v.id("studyGroups"),
    userId: v.id("users"),
    // A moderator is a member promoted by the course instructor; they can pin
    // and delete messages in their own group but cannot archive the group.
    role: v.union(v.literal("member"), v.literal("moderator")),
    joinedAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_user", ["userId"])
    .index("by_group_user", ["groupId", "userId"]),

  studyGroupJoinRequests: defineTable({
    groupId: v.id("studyGroups"),
    userId: v.id("users"),
    message: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id("users")),
  })
    .index("by_group", ["groupId"])
    // Serves the moderator's approval queue.
    .index("by_group_status", ["groupId", "status"])
    .index("by_user", ["userId"]),

  studyGroupMessages: defineTable({
    groupId: v.id("studyGroups"),
    userId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_group_created", ["groupId", "createdAt"]),

  // ═══════════════════════════════════════════════════════════════════════
  // END group block
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
  // BEGIN admin console block
  //
  // Support surfaces the admin console added: platform announcements,
  // a curated category list, and an opt-in pre-publication review queue.
  // The review queue is deliberately opt-in: `courses.publishCourse` stays
  // ungated (see the publishing block comment there and AGENTS.md rule 9) —
  // an instructor who wants admin sign-off before going live asks for it
  // here instead of the platform silently holding every listing hostage.
  // ═══════════════════════════════════════════════════════════════════════

  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    active: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  categories: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  courseReviewRequests: defineTable({
    courseId: v.id("courses"),
    requestedBy: v.id("users"),
    note: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    reviewedBy: v.optional(v.id("users")),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"])
    .index("by_course", ["courseId"]),

  // ═══════════════════════════════════════════════════════════════════════
  // END admin console block
});

