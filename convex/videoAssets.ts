import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import { canManageCourse, getCurrentUser, isStaff, requireUser } from "./helpers/auth";
import { signPlaybackToken } from "../lib/video-playback-token";
import { assertUploadthingFileUrl } from "../lib/video-source";

/** Raw instructor upload cap: 1 GB. The ladder output is what students stream. */
const MAX_SOURCE_BYTES = 1024 * 1024 * 1024;

/** Playback tokens live 2 hours — long enough for a lesson, short enough to share poorly. */
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

async function requireManager(ctx: GenericMutationCtx<DataModel>, lessonId: Id<"lessons">) {
  const user = await requireUser(ctx);
  if (!isStaff(user)) throw new Error("Not authorized");
  const lesson = await ctx.db.get(lessonId);
  if (!lesson) throw new Error("Lesson not found");
  const course = await ctx.db.get(lesson.courseId);
  if (!(await canManageCourse(ctx, user, course))) {
    throw new Error("Not authorized to manage this course");
  }
  return { user, lesson, course };
}

async function hasEnrollment(
  ctx: GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>,
  userId: Id<"users">,
  courseId: Id<"courses">,
): Promise<boolean> {
  const enrollment = await ctx.db
    .query("enrollments")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId))
    .unique();
  return !!enrollment;
}

/**
 * UploadThing middleware gate: is this caller allowed to attach an upload to
 * this lesson? Boolean, never throws — the uploader maps false to Forbidden.
 */
export const canUploadToLesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user || !isStaff(user)) return false;
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) return false;
    const course = await ctx.db.get(lesson.courseId);
    return canManageCourse(ctx, user, course);
  },
});

/**
 * Attach an UploadThing upload to the lesson and kick off the transcode.
 * Re-uploads create a fresh asset; the previous ladder keeps serving until the
 * new one is ready, then its blobs are deleted and its source file removed
 * from UploadThing.
 */
export const registerSource = mutation({
  args: {
    lessonId: v.id("lessons"),
    sourceFileUrl: v.string(),
    sourceFileKey: v.string(),
    sizeBytes: v.number(),
  },
  handler: async (ctx, args) => {
    const { lesson } = await requireManager(ctx, args.lessonId);

    // Belt and suspenders: the file route already caps video at 1 GB, and the
    // URL must be an UploadThing file URL or the worker would fetch anywhere.
    assertUploadthingFileUrl(args.sourceFileUrl);
    if (!Number.isFinite(args.sizeBytes) || args.sizeBytes <= 0) {
      throw new Error("Invalid upload size");
    }
    if (args.sizeBytes > MAX_SOURCE_BYTES) {
      throw new Error("Video exceeds the 1 GB upload limit");
    }
    if (args.sourceFileKey.length === 0 || args.sourceFileKey.length > 256) {
      throw new Error("Invalid upload reference");
    }

    const now = Date.now();
    const assetId = await ctx.db.insert("videoAssets", {
      lessonId: args.lessonId,
      status: "pending",
      sourceFileUrl: args.sourceFileUrl,
      sourceFileKey: args.sourceFileKey,
      replacesAssetId: lesson.videoAssetId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.lessonId, { videoAssetId: assetId, contentType: "video" });
    await ctx.scheduler.runAfter(0, internal.videoTranscode.transcode, { assetId });
    return { assetId };
  },
});

/**
 * Lesson video state. Managers see everything including transcode errors;
 * students see only ready ladders for courses they are enrolled in — and never
 * storage ids or key material.
 */
export const getAssetStatus = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson?.videoAssetId) return null;
    const asset = await ctx.db.get(lesson.videoAssetId);
    if (!asset) return null;
    const course = await ctx.db.get(lesson.courseId);

    if (isStaff(user) && (await canManageCourse(ctx, user, course))) {
      return { role: "manager" as const, asset };
    }
    if (asset.status !== "ready") return null;
    if (!(await hasEnrollment(ctx, user._id, lesson.courseId))) return null;
    return {
      role: "student" as const,
      asset: {
        _id: asset._id,
        status: asset.status,
        variants: asset.variants ?? [],
        durationSeconds: asset.durationSeconds ?? 0,
      },
    };
  },
});

/** Step 3: mint a short-lived playback token for an enrolled student (or manager preview). */
export const issuePlaybackToken = mutation({
  args: { assetId: v.id("videoAssets") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== "ready") throw new Error("Video is not ready");
    const lesson = await ctx.db.get(asset.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const course = await ctx.db.get(lesson.courseId);
    const manager = isStaff(user) && (await canManageCourse(ctx, user, course));
    if (!manager && !(await hasEnrollment(ctx, user._id, lesson.courseId))) {
      throw new Error("Not enrolled in this course");
    }
    const exp = Date.now() + TOKEN_TTL_MS;
    const token = await signPlaybackToken({ a: asset._id, u: user._id, exp });
    return { token, exp };
  },
});

/** Internal: transcode worker reads. Never exposed to clients. */
export const getAssetForWorker = internalQuery({
  args: { assetId: v.id("videoAssets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");
    return asset;
  },
});

/** Internal: transcode worker state transitions. */
export const setAssetProcessing = internalMutation({
  args: { assetId: v.id("videoAssets") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.assetId, { status: "processing", updatedAt: Date.now() });
  },
});

export const completeAsset = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    masterManifestStorageId: v.id("_storage"),
    variantManifestStorageIds: v.array(v.id("_storage")),
    segments: v.array(v.object({ variant: v.number(), name: v.string(), storageId: v.id("_storage") })),
    keyStorageId: v.id("_storage"),
    ivHex: v.string(),
    variants: v.array(v.object({ label: v.string(), height: v.number(), bitrate: v.number(), bandwidth: v.number() })),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const { assetId, ...rest } = args;
    const asset = await ctx.db.get(assetId);
    if (!asset) throw new Error("Asset not found");
    await ctx.db.patch(assetId, { ...rest, status: "ready", updatedAt: Date.now() });
    // Swap complete: retire the ladder this upload replaced. Convex blobs go
    // now; the UploadThing source is deleted by a node action (SDK needs the
    // secret server-side, and isolates must never see it used raw).
    if (asset.replacesAssetId) {
      const old = await ctx.db.get(asset.replacesAssetId);
      if (old) {
        const blobs = [
          old.masterManifestStorageId,
          ...(old.variantManifestStorageIds ?? []),
          ...(old.segments ?? []).map((s) => s.storageId),
          old.keyStorageId,
        ];
        for (const id of blobs) {
          if (id) await ctx.storage.delete(id).catch(() => {});
        }
        await ctx.scheduler.runAfter(0, internal.videoTranscode.deleteUploadthingFiles, {
          fileKeys: [old.sourceFileKey],
        });
        await ctx.db.delete(old._id);
      }
    }
  },
});

export const failAsset = internalMutation({
  args: { assetId: v.id("videoAssets"), errorMessage: v.string() },
  handler: async (ctx, args) => {
    // Tolerant of a missing row: a re-upload may have retired this asset
    // while its worker was still running.
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return;
    await ctx.db.patch(args.assetId, {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal: the playback route's access check. Returns true only when the
 * asset is ready and the user is unsuspended plus a course manager or an
 * enrolled student. The route verifies the token signature itself first.
 */
export const checkPlaybackAccess = internalQuery({
  args: { assetId: v.id("videoAssets"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.suspendedAt !== undefined) return false;
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== "ready") return false;
    const lesson = await ctx.db.get(asset.lessonId);
    if (!lesson) return false;
    const course = await ctx.db.get(lesson.courseId);
    if (isStaff(user) && (await canManageCourse(ctx, user, course))) return true;
    return hasEnrollment(ctx, user._id, lesson.courseId);
  },
});
