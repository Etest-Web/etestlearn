import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logAudit } from "./helpers/audit";
import { getCurrentUser, canManageCourse, requireUser } from "./helpers/auth";

export const listLessonAttachments = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return [];

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", lesson.courseId)
      )
      .unique();

    const canManage = await canManageCourse(ctx, user, await ctx.db.get(lesson.courseId));

    // Learners see their course's attachments; staff see every lesson's.
    if (!enrollment && !canManage) {
      return [];
    }

    return await ctx.db
      .query("lessonAttachments")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .collect();
  },
});

export const registerLessonAttachment = mutation({
  args: {
    lessonId: v.id("lessons"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const canManage = await canManageCourse(ctx, user, await ctx.db.get(lesson.courseId));
    if (!canManage) throw new Error("Not authorized to add attachments to this lesson");

    const attachments = await ctx.db
      .query("lessonAttachments")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .collect();

    const attachment = await ctx.db.insert("lessonAttachments", {
      lessonId: args.lessonId,
      storageId: args.storageId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      order: attachments.reduce((max, a) => Math.max(max, a.order), 0) + 1,
      createdAt: Date.now(),
    });

    await logAudit(ctx, {
      actorId: user._id,
      action: "lesson_attachment.register",
      targetType: "lessonAttachment",
      targetId: attachment,
      details: {
        lessonId: args.lessonId,
        fileName: args.fileName,
        sizeBytes: args.sizeBytes,
      },
    });

    return attachment;
  },
});

export const deleteLessonAttachment = mutation({
  args: { attachmentId: v.id("lessonAttachments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) throw new Error("Attachment not found");

    const lesson = await ctx.db.get(attachment.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const canManage = await canManageCourse(ctx, user, await ctx.db.get(lesson.courseId));
    if (!canManage) throw new Error("Not authorized to delete attachments from this lesson");

    await ctx.db.delete(args.attachmentId);

    await logAudit(ctx, {
      actorId: user._id,
      action: "lesson_attachment.delete",
      targetType: "lessonAttachment",
      targetId: args.attachmentId,
      details: {
        lessonId: attachment.lessonId,
        fileName: attachment.fileName,
      },
    });

    return { success: true };
  },
});

export const generateLessonAttachmentUrl = mutation({
  args: { attachmentId: v.id("lessonAttachments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) throw new Error("Attachment not found");

    const lesson = await ctx.db.get(attachment.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", lesson.courseId)
      )
      .unique();

    const canManage = await canManageCourse(ctx, user, await ctx.db.get(lesson.courseId));

    if (!enrollment && !canManage) {
      throw new Error("Not authorized to download this attachment");
    }

    return await ctx.storage.getUrl(attachment.storageId);
  },
});
