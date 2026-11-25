import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  canManageCourse,
  getCurrentUser,
  hasEnrollment,
  isPreviewLesson,
  isStaff,
  requireUser,
} from "./helpers/auth";
import { signScormToken } from "../lib/scorm/token";

// ─────────────────────────────────────────────────────────────────────────────
// Permissions & Auth Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Internal query to check if caller can manage course from an action context. */
export const canManageCourseInternal = internalQuery({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return { canManage: false };
    const course = await ctx.db.get(args.courseId);
    if (!course) return { canManage: false };
    const allowed = await canManageCourse(ctx, user, course);
    return { canManage: allowed, courseTitle: course.title, instructorId: course.instructorId };
  },
});

/**
 * Checks whether the given user (or anonymous visitor for preview lessons)
 * is allowed to view/load the SCORM package assets.
 */
export const verifyScormAssetAccess = internalQuery({
  args: {
    packageId: v.id("scormPackages"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) return { allowed: false, reason: "Package not found" };

    const course = await ctx.db.get(pkg.courseId);
    if (!course) return { allowed: false, reason: "Course not found" };

    // Check preview lesson exemption if linked to a lesson
    if (pkg.lessonId) {
      const lesson = await ctx.db.get(pkg.lessonId);
      if (lesson && isPreviewLesson(lesson)) {
        return { allowed: true, courseId: pkg.courseId };
      }
    }

    if (!args.userId) {
      return { allowed: false, reason: "Authentication required" };
    }

    const user = await ctx.db.get(args.userId);
    if (!user) return { allowed: false, reason: "User not found" };

    // Instructor/Admin manager override
    if (isStaff(user) && (await canManageCourse(ctx, user, course))) {
      return { allowed: true, courseId: pkg.courseId };
    }

    // Active enrollment check
    const enrolled = await hasEnrollment(ctx, args.userId, pkg.courseId);
    if (!enrolled) {
      return { allowed: false, reason: "Not enrolled in this course" };
    }

    return { allowed: true, courseId: pkg.courseId };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/** Retrieve SCORM package metadata. */
export const getScormPackage = query({
  args: { packageId: v.id("scormPackages") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) return null;

    const course = await ctx.db.get(pkg.courseId);
    if (!course) return null;

    // Check if user is enrolled or can manage
    let allowed = false;
    if (pkg.lessonId) {
      const lesson = await ctx.db.get(pkg.lessonId);
      if (lesson && isPreviewLesson(lesson)) allowed = true;
    }
    if (!allowed && user) {
      if (isStaff(user) && (await canManageCourse(ctx, user, course))) {
        allowed = true;
      } else {
        allowed = await hasEnrollment(ctx, user._id, pkg.courseId);
      }
    }

    if (!allowed) return null;

    return {
      _id: pkg._id,
      courseId: pkg.courseId,
      lessonId: pkg.lessonId,
      title: pkg.title,
      version: pkg.version,
      entryPoint: pkg.entryPoint,
      packageSize: pkg.packageSize,
      masteryScore: pkg.masteryScore,
      createdAt: pkg.createdAt,
    };
  },
});

/** Retrieve SCORM package for a given lesson. */
export const getScormPackageForLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson || !lesson.scormPackageId) return null;

    const pkg = await ctx.db.get(lesson.scormPackageId);
    if (!pkg) return null;

    return {
      _id: pkg._id,
      courseId: pkg.courseId,
      lessonId: pkg.lessonId,
      title: pkg.title,
      version: pkg.version,
      entryPoint: pkg.entryPoint,
      packageSize: pkg.packageSize,
      masteryScore: pkg.masteryScore,
      createdAt: pkg.createdAt,
    };
  },
});

/** Lookup single file asset from package by normalized path (for HTTP delivery). */
export const getPackageFile = internalQuery({
  args: {
    packageId: v.id("scormPackages"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scormPackageFiles")
      .withIndex("by_package_path", (q) =>
        q.eq("packageId", args.packageId).eq("path", args.path)
      )
      .unique();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issues a signed asset-playback token for loading the SCORM package in an iframe.
 * Valid for 2 hours.
 */
export const issueScormToken = mutation({
  args: { packageId: v.id("scormPackages") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("SCORM package not found");

    const course = await ctx.db.get(pkg.courseId);
    if (!course) throw new Error("Course not found");

    const canManage = isStaff(user) && (await canManageCourse(ctx, user, course));
    const enrolled = await hasEnrollment(ctx, user._id, pkg.courseId);

    let isPreview = false;
    if (pkg.lessonId) {
      const lesson = await ctx.db.get(pkg.lessonId);
      if (lesson && isPreviewLesson(lesson)) isPreview = true;
    }

    if (!canManage && !enrolled && !isPreview) {
      throw new Error("Not authorized to access this SCORM module");
    }

    const token = await signScormToken({
      p: args.packageId,
      u: user._id,
      exp: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
    });

    return { token, entryPoint: pkg.entryPoint };
  },
});

/** Link an already unpacked SCORM package to a lesson. */
export const linkScormPackageToLesson = mutation({
  args: {
    packageId: v.id("scormPackages"),
    lessonId: v.id("lessons"),
    durationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const course = await ctx.db.get(lesson.courseId);
    if (!course || !(await canManageCourse(ctx, user, course))) {
      throw new Error("Not authorized to edit lessons for this course");
    }

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("SCORM package not found");

    if (pkg.courseId !== course._id) {
      throw new Error("Package does not belong to this course");
    }

    // If lesson already had a different package attached, clean up old package
    if (lesson.scormPackageId && lesson.scormPackageId !== args.packageId) {
      await deletePackageAndFiles(ctx, lesson.scormPackageId);
    }

    await ctx.db.patch(args.packageId, { lessonId: args.lessonId });

    const updates: {
      scormPackageId: typeof args.packageId;
      contentType: "scorm";
      durationMinutes?: number;
    } = {
      scormPackageId: args.packageId,
      contentType: "scorm",
    };
    if (args.durationMinutes !== undefined && args.durationMinutes > 0) {
      updates.durationMinutes = args.durationMinutes;
    }

    await ctx.db.patch(args.lessonId, updates);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Internal Mutations (Used by Actions and Cascades)
// ─────────────────────────────────────────────────────────────────────────────

/** Inserts the main scormPackages record. */
export const createPackageRecord = internalMutation({
  args: {
    courseId: v.id("courses"),
    lessonId: v.optional(v.id("lessons")),
    title: v.string(),
    version: v.union(
      v.literal("1.2"),
      v.literal("2004_2nd"),
      v.literal("2004_3rd"),
      v.literal("2004_4th")
    ),
    entryPoint: v.string(),
    storagePrefix: v.string(),
    packageSize: v.number(),
    masteryScore: v.optional(v.number()),
    manifestData: v.optional(v.string()),
    zipStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("scormPackages", {
      courseId: args.courseId,
      lessonId: args.lessonId,
      title: args.title,
      version: args.version,
      entryPoint: args.entryPoint,
      storagePrefix: args.storagePrefix,
      packageSize: args.packageSize,
      masteryScore: args.masteryScore,
      manifestData: args.manifestData,
      zipStorageId: args.zipStorageId,
      createdAt: Date.now(),
    });
  },
});

/** Batch inserts scormPackageFiles records. */
export const savePackageFileBatch = internalMutation({
  args: {
    packageId: v.id("scormPackages"),
    files: v.array(
      v.object({
        path: v.string(),
        storageId: v.id("_storage"),
        contentType: v.string(),
        sizeBytes: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const f of args.files) {
      await ctx.db.insert("scormPackageFiles", {
        packageId: args.packageId,
        path: f.path,
        storageId: f.storageId,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
        createdAt: now,
      });
    }
  },
});

/** Link newly created package to lesson. */
export const linkPackageToLessonInternal = internalMutation({
  args: {
    packageId: v.id("scormPackages"),
    lessonId: v.id("lessons"),
    durationMinutes: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return;

    // Clean up old package if different
    if (lesson.scormPackageId && lesson.scormPackageId !== args.packageId) {
      await deletePackageAndFiles(ctx, lesson.scormPackageId);
    }

    await ctx.db.patch(args.packageId, { lessonId: args.lessonId });

    const updates: Record<string, unknown> = {
      scormPackageId: args.packageId,
      contentType: "scorm",
    };
    if (args.durationMinutes !== undefined && args.durationMinutes > 0) {
      updates.durationMinutes = args.durationMinutes;
    }

    await ctx.db.patch(args.lessonId, updates);
  },
});

/** Clean up old package for a lesson if present. */
export const cleanupLessonExistingPackage = internalMutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (lesson && lesson.scormPackageId) {
      await deletePackageAndFiles(ctx, lesson.scormPackageId);
      await ctx.db.patch(args.lessonId, { scormPackageId: undefined });
    }
  },
});

/** Delete package, all its files, and storage blobs. */
export const deleteScormPackageInternal = internalMutation({
  args: { packageId: v.id("scormPackages") },
  handler: async (ctx, args) => {
    await deletePackageAndFiles(ctx, args.packageId);
  },
});

/** Helper to delete a SCORM package row, all file rows, and associated storage blobs. */
async function deletePackageAndFiles(
  ctx: { db: any; storage: any },
  packageId: any
) {
  const pkg = await ctx.db.get(packageId);
  if (!pkg) return;

  // Delete all extracted file records and storage blobs
  const files = await ctx.db
    .query("scormPackageFiles")
    .withIndex("by_package", (q: any) => q.eq("packageId", packageId))
    .collect();

  for (const f of files) {
    try {
      await ctx.storage.delete(f.storageId);
    } catch {
      // Ignore if storage blob already deleted
    }
    await ctx.db.delete(f._id);
  }

  // Delete zip file if stored
  if (pkg.zipStorageId) {
    try {
      await ctx.storage.delete(pkg.zipStorageId);
    } catch {
      // Ignore
    }
  }

  // Delete tracking data for this package
  const trackingRows = await ctx.db
    .query("scormTracking")
    .withIndex("by_package", (q: any) => q.eq("scormPackageId", packageId))
    .collect();

  for (const t of trackingRows) {
    await ctx.db.delete(t._id);
  }

  await ctx.db.delete(packageId);
}
