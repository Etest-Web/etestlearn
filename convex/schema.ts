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

  certificates: defineTable({
    userId: v.id("users"),
    courseId: v.id("courses"),
    issuedAt: v.number(),
  }).index("by_user", ["userId"])
    .index("by_course", ["courseId"])
    .index("by_user_course", ["userId", "courseId"]),

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
    .index("by_course", ["courseId"]),

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
});

