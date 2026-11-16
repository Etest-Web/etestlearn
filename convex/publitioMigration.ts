import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canVideoTransition } from "../lib/videos";

/**
 * Internal helpers for the one-off Publit.io → B2 migration
 * (`scripts/migrate-publitio-to-b2.mjs`). These run via `npx convex run` with
 * deployment admin access, so they do not re-check the caller's session — they
 * must stay `internal` and are not safe to expose as public functions.
 *
 * The script owns the bytes (download from Publit.io, multipart upload to B2,
 * ffmpeg transcode); these helpers own the Convex records so the resulting
 * asset is indistinguishable from one produced by the normal B2 pipeline.
 */

function isPublitioHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "publit.io" || host.endsWith(".publit.io");
  } catch {
    return false;
  }
}

/** Lessons whose video still points at Publit.io and are not already migrated. */
export const listPublitioLessons = internalQuery({
  args: {
    courseId: v.optional(v.id("courses")),
    includeMigrated: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      lessonId: v.id("lessons"),
      courseId: v.id("courses"),
      title: v.string(),
      content: v.string(),
      videoFileName: v.optional(v.string()),
      videoAssetId: v.optional(v.id("videoAssets")),
      migratedReady: v.boolean(),
      assetStatus: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const lessons = args.courseId
      ? await ctx.db
          .query("lessons")
          .withIndex("by_course_order", (q) => q.eq("courseId", args.courseId!))
          .collect()
      : await ctx.db.query("lessons").collect();

    const out: Array<{
      lessonId: Id<"lessons">;
      courseId: Id<"courses">;
      title: string;
      content: string;
      videoFileName?: string;
      videoAssetId?: Id<"videoAssets">;
      migratedReady: boolean;
      assetStatus?: string;
    }> = [];

    for (const lesson of lessons) {
      if (lesson.contentType !== "video") continue;
      const content = lesson.content ?? "";
      if (!isPublitioHost(content)) continue;

      let migratedReady = false;
      let assetStatus: string | undefined;
      if (lesson.videoAssetId) {
        const asset = await ctx.db.get(lesson.videoAssetId);
        assetStatus = asset?.status;
        migratedReady =
          asset?.status === "ready" &&
          Boolean(asset.masterPlaylistKey || asset.masterManifestStorageId);
      }
      if (migratedReady && !args.includeMigrated) continue;

      out.push({
        lessonId: lesson._id,
        courseId: lesson.courseId,
        title: lesson.title,
        content,
        videoFileName: lesson.videoFileName,
        videoAssetId: lesson.videoAssetId,
        migratedReady,
        assetStatus,
      });
    }
    return out;
  },
});

/**
 * Create the draft `awaiting_upload` asset for a migration. Unlike the normal
 * path this does not enforce per-owner caps or a session, but it does enforce a
 * single in-flight upload per lesson so a re-run cannot stack duplicates.
 */
export const createMigrationDraft = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    sizeBytes: v.number(),
  },
  returns: v.object({ assetId: v.id("videoAssets"), rawKey: v.string() }),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (!Number.isSafeInteger(args.sizeBytes) || args.sizeBytes <= 0) {
      throw new Error("Invalid upload size");
    }

    const latest = await ctx.db
      .query("videoAssets")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .order("desc")
      .first();
    const inFlight = ["awaiting_upload", "queued", "processing", "pending"];
    if (latest && inFlight.includes(latest.status)) {
      throw new Error(`Lesson already has a video upload in progress (${latest.status})`);
    }

    const now = Date.now();
    const assetId = await ctx.db.insert("videoAssets", {
      lessonId: args.lessonId,
      sourceFileUrl: "",
      sourceFileKey: "",
      status: "awaiting_upload",
      sizeBytes: args.sizeBytes,
      replacesAssetId: lesson.videoAssetId,
      createdAt: now,
      updatedAt: now,
    });
    const rawKey = `raw/${assetId}/source`;
    return { assetId, rawKey };
  },
});

/** Record the B2 multipart upload handle on a migration draft. */
export const attachMigrationUpload = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    uploadId: v.string(),
    rawKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    if (asset.status !== "awaiting_upload") {
      throw new Error(`Asset is not awaiting upload (${asset.status})`);
    }
    await ctx.db.patch(args.assetId, {
      uploadId: args.uploadId,
      rawKey: args.rawKey,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Finalize a migration upload after the raw object is fully in B2 and verified:
 * store the per-asset AES key (once) and move the asset to `queued`, exactly as
 * the normal `completeUpload` action does so the transcode worker can claim it.
 */
export const finalizeMigrationUpload = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    keyB64: v.string(),
  },
  returns: v.object({ status: v.literal("queued") }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    if (asset.status === "queued") return { status: "queued" as const };
    if (!canVideoTransition(asset.status, "queued")) {
      throw new Error(`Cannot queue asset from status ${asset.status}`);
    }
    if (asset.rawKey === undefined || asset.sizeBytes === undefined) {
      throw new Error("Asset is missing raw upload metadata");
    }
    if (args.keyB64.length !== 24) throw new Error("Invalid video key");

    const existing = await ctx.db
      .query("videoKeys")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .first();
    if (!existing) {
      await ctx.db.insert("videoKeys", { assetId: args.assetId, keyB64: args.keyB64 });
    }

    await ctx.db.patch(args.assetId, {
      status: "queued",
      uploadId: undefined,
      updatedAt: Date.now(),
    });
    return { status: "queued" as const };
  },
});

/** Mark a migration draft as failed (best-effort cleanup path). */
export const failMigrationDraft = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    if (asset.status === "ready") return null;
    await ctx.db.patch(args.assetId, {
      status: "failed",
      uploadId: undefined,
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Recover from interrupted migration runs: fail any in-flight, non-ready video
 * assets on Publit.io lessons so they can be retried. `ready` assets are left
 * untouched. Used by the migration script to clear orphaned
 * awaiting_upload/queued/processing/pending drafts created by a crashed run.
 */
export const cleanupStaleMigrationAssets = internalMutation({
  args: {
    lessonId: v.optional(v.id("lessons")),
  },
  returns: v.object({ failed: v.number(), assetIds: v.array(v.id("videoAssets")) }),
  handler: async (ctx, args) => {
    const lessons = args.lessonId
      ? [await ctx.db.get(args.lessonId)].filter((l): l is NonNullable<typeof l> => l !== null)
      : await ctx.db.query("lessons").collect();

    const inFlight = new Set(["awaiting_upload", "queued", "processing", "pending"]);
    const failedIds: Id<"videoAssets">[] = [];
    for (const lesson of lessons) {
      if (lesson.contentType !== "video") continue;
      const content = lesson.content ?? "";
      if (!isPublitioHost(content)) continue;

      const assets = await ctx.db
        .query("videoAssets")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .collect();
      for (const asset of assets) {
        if (asset.status === "ready") continue;
        if (!inFlight.has(asset.status) && asset.status !== "failed") continue;
        await ctx.db.patch(asset._id, {
          status: "failed",
          uploadId: undefined,
          errorMessage: "Stale migration draft cleaned up for retry",
          updatedAt: Date.now(),
        });
        failedIds.push(asset._id);
      }
    }
    return { failed: failedIds.length, assetIds: failedIds };
  },
});
