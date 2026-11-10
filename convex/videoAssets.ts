import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import {
  canManageCourse,
  getCurrentUser,
  hasEnrollment,
  isPreviewLesson,
  isStaff,
  requireUser,
} from "./helpers/auth";
import { signPlaybackToken } from "../lib/video-playback-token";
import { assertUploadthingFileUrl } from "../lib/video-source";
import {
  canVideoTransition,
  inFlightUploadError,
  presignBudget,
  presignBudgetError,
  rawPartCount,
} from "../lib/videos";

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
    // Sanitize URL
    try {
      const url = new URL(args.sourceFileUrl);
      if (url.protocol !== "https:") throw new Error("Invalid upload source");
    } catch {
      throw new Error("Invalid upload source");
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
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson?.videoAssetId) return null;
    const asset = await ctx.db.get(lesson.videoAssetId);
    if (!asset) return null;
    const course = await ctx.db.get(lesson.courseId);

    if (user && isStaff(user) && (await canManageCourse(ctx, user, course))) {
      return { role: "manager" as const, asset };
    }
    if (asset.status !== "ready") return null;

    // Public preview — see isPreviewLesson for why the rule lives in one place.
    if (isPreviewLesson(lesson)) {
      return {
        role: "preview" as const,
        asset: {
          _id: asset._id,
          status: asset.status,
          variants: asset.variants ?? [],
          durationSeconds: asset.durationSeconds ?? 0,
        },
      };
    }

    if (!user || !(await hasEnrollment(ctx, user._id, lesson.courseId))) return null;
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

/** Step 3: mint a short-lived playback token for an enrolled student (or manager/free preview). */
export const issuePlaybackToken = mutation({
  args: { assetId: v.id("videoAssets") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== "ready") throw new Error("Video is not ready");
    const lesson = await ctx.db.get(asset.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const course = await ctx.db.get(lesson.courseId);
    const manager = user && isStaff(user) && (await canManageCourse(ctx, user, course));
    const isEnrolled = user ? await hasEnrollment(ctx, user._id, lesson.courseId) : false;
    const isPreview = isPreviewLesson(lesson);

    if (!manager && !isEnrolled && !isPreview) {
      throw new Error("Not enrolled in this course");
    }
    const exp = Date.now() + TOKEN_TTL_MS;
    const userId = user ? user._id : "anonymous";
    const token = await signPlaybackToken({ a: asset._id, u: userId, exp });
    return { token, exp };
  },
});

/** Internal: read the per-asset AES-128 key (base64). Used by the playback gate. */
export const getVideoKey = internalQuery({
  args: { assetId: v.id("videoAssets") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("videoKeys")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .first();
    return row?.keyB64 ?? null;
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
    // now; the UploadThing source is deleted if present.
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
        if (old.sourceFileKey) {
          await ctx.scheduler.runAfter(0, internal.videoTranscode.deleteUploadthingFiles, {
            fileKeys: [old.sourceFileKey],
          });
        }
        await ctx.db.delete(old._id);
      }
    }
  },
});

/**
 * Client-side transcode initiation and completion.
 * Allows client to transcode video in-browser and save directly to storage.
 */
export const initClientTranscode = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, args) => {
    const { lesson } = await requireManager(ctx, args.lessonId);
    const now = Date.now();
    const assetId = await ctx.db.insert("videoAssets", {
      lessonId: args.lessonId,
      status: "processing",
      sourceFileUrl: "",
      sourceFileKey: "",
      replacesAssetId: lesson.videoAssetId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.lessonId, { videoAssetId: assetId, contentType: "video" });
    return { assetId };
  },
});

export const completeClientTranscode = mutation({
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
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");
    await requireManager(ctx, asset.lessonId);

    const { assetId, ...rest } = args;
    await ctx.db.patch(assetId, { ...rest, status: "ready", updatedAt: Date.now() });

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
        if (old.sourceFileKey) {
          await ctx.scheduler.runAfter(0, internal.videoTranscode.deleteUploadthingFiles, {
            fileKeys: [old.sourceFileKey],
          });
        }
        await ctx.db.delete(old._id);
      }
    }
  },
});

export const failClientTranscode = mutation({
  args: {
    assetId: v.id("videoAssets"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return;
    await requireManager(ctx, asset.lessonId);
    await ctx.db.patch(args.assetId, {
      status: "failed",
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: Date.now(),
    });
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
  args: {
    assetId: v.id("videoAssets"),
    userId: v.union(v.id("users"), v.literal("anonymous")),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== "ready") return false;
    const lesson = await ctx.db.get(asset.lessonId);
    if (!lesson) return false;
    // Public preview — same rule as the content gate in courses.getCourseBySlug.
    if (isPreviewLesson(lesson)) return true;
    if (args.userId === "anonymous") return false;

    const user = await ctx.db.get(args.userId);
    if (!user || user.suspendedAt !== undefined) return false;
    const course = await ctx.db.get(lesson.courseId);
    if (isStaff(user) && (await canManageCourse(ctx, user, course))) return true;
    return hasEnrollment(ctx, user._id, lesson.courseId);
  },
});

/** Every `videoAssets.status` literal — shared by the staged-upload actions. */
const videoStatusUnion = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("awaiting_upload"),
  v.literal("queued"),
);

/**
 * Query-side twin of `requireManager`: the staged-upload actions are user
 * invoked, so their identity propagates through `ctx.runQuery` and the same
 * owner-or-admin rule must be re-checked here — client role checks are UX only.
 */
async function requireManagerQuery(ctx: GenericQueryCtx<DataModel>, lessonId: Id<"lessons">) {
  const user = await requireUser(ctx);
  if (!isStaff(user)) throw new Error("Not authorized");
  const lesson = await ctx.db.get(lessonId);
  if (!lesson) throw new Error("Lesson not found");
  const course = await ctx.db.get(lesson.courseId);
  if (!(await canManageCourse(ctx, user, course))) {
    throw new Error("Not authorized to manage this course");
  }
  return { user, lesson };
}

/**
 * Internal: the authorization probe `initUpload` runs before it drafts a row.
 * Returns only the caller's id — enough to prove the gate ran, nothing the
 * action needs to echo back to the browser.
 */
export const resolveUploadInitiator = internalQuery({
  args: { lessonId: v.id("lessons") },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args) => {
    const { user } = await requireManagerQuery(ctx, args.lessonId);
    return { userId: user._id };
  },
});

/**
 * Internal: the action-side authorization plus payload read. Status and the
 * multipart handle travel together so `signParts`/`completeUpload` can refuse
 * early without a second round trip.
 */
export const resolveUploadAccess = internalQuery({
  args: { assetId: v.id("videoAssets") },
  returns: v.object({
    lessonId: v.id("lessons"),
    status: videoStatusUnion,
    uploadId: v.optional(v.string()),
    rawKey: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    fingerprintLastModified: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    await requireManagerQuery(ctx, asset.lessonId);
    return {
      lessonId: asset.lessonId,
      status: asset.status,
      uploadId: asset.uploadId,
      rawKey: asset.rawKey,
      sizeBytes: asset.sizeBytes,
      fingerprintLastModified: asset.fingerprintLastModified,
    };
  },
});

/**
 * The instructor-facing resume read: is there a multipart upload waiting for
 * *this* lesson? It exposes the fingerprint so the uploader can refuse a
 * different file before it re-signs anything, and nothing else about the row.
 */
export const getUploadDraft = query({
  args: { lessonId: v.id("lessons") },
  returns: v.union(
    v.object({
      assetId: v.id("videoAssets"),
      sizeBytes: v.number(),
      lastModified: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireManagerQuery(ctx, args.lessonId);
    const latest = await ctx.db
      .query("videoAssets")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .order("desc")
      .first();
    if (
      !latest ||
      latest.status !== "awaiting_upload" ||
      latest.uploadId === undefined ||
      latest.rawKey === undefined ||
      latest.sizeBytes === undefined ||
      latest.fingerprintLastModified === undefined
    ) {
      return null;
    }
    return {
      assetId: latest._id,
      sizeBytes: latest.sizeBytes,
      lastModified: latest.fingerprintLastModified,
    };
  },
});

/**
 * Internal: drafts the `awaiting_upload` row. One in-flight upload per lesson
 * is the rule — a second draft must not exist while the first is still
 * landing, queued for transcode, or being replaced. Per-owner caps are
 * enforced here too: this is the only place a draft is created, so a caller
 * cannot open a third upload (or a fourth gigabyte in flight) by racing two
 * browser tabs.
 */
export const createUploadDraft = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    sizeBytes: v.number(),
    fingerprintLastModified: v.number(),
  },
  returns: v.object({ assetId: v.id("videoAssets") }),
  handler: async (ctx, args) => {
    const { user, lesson } = await requireManagerQuery(ctx, args.lessonId);
    if (!Number.isSafeInteger(args.sizeBytes) || args.sizeBytes <= 0) {
      throw new Error("Invalid upload size");
    }
    if (
      !Number.isSafeInteger(args.fingerprintLastModified) ||
      args.fingerprintLastModified <= 0
    ) {
      throw new Error("Invalid file fingerprint");
    }

    const latest = await ctx.db
      .query("videoAssets")
      .withIndex("by_lesson", (q) => q.eq("lessonId", args.lessonId))
      .order("desc")
      .first();
    const inFlight: string[] = ["awaiting_upload", "queued", "processing", "pending"];
    if (latest && inFlight.includes(latest.status)) {
      throw new Error("This lesson already has a video upload in progress");
    }

    // Bounded read: the cap is small, so a handful of rows is the whole
    // picture; `inFlightUploadError` decides from those totals.
    const active = await ctx.db
      .query("videoAssets")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", user._id).eq("status", "awaiting_upload"),
      )
      .take(20);
    const activeBytes = active.reduce((sum, asset) => sum + (asset.sizeBytes ?? 0), 0);
    const capError = inFlightUploadError(active.length, activeBytes, args.sizeBytes);
    if (capError) throw new Error(capError);

    const now = Date.now();
    const assetId = await ctx.db.insert("videoAssets", {
      lessonId: args.lessonId,
      sourceFileUrl: "",
      sourceFileKey: "",
      status: "awaiting_upload",
      sizeBytes: args.sizeBytes,
      ownerId: user._id,
      fingerprintLastModified: args.fingerprintLastModified,
      replacesAssetId: lesson.videoAssetId,
      createdAt: now,
      updatedAt: now,
    });
    return { assetId };
  },
});

/**
 * Internal: claims presign budget for one batch before a single URL is minted.
 * Claiming first (rather than counting after) is what makes concurrent
 * `signParts` calls unable to over-issue: the write is serializable, the
 * presigning that follows is not.
 */
export const claimPresignBudget = internalMutation({
  args: { assetId: v.id("videoAssets"), count: v.number() },
  returns: v.object({ issued: v.number(), budget: v.number() }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    if (asset.sizeBytes === undefined) throw new Error("Upload is not in progress");
    const parts = rawPartCount(asset.sizeBytes);
    const alreadyIssued = asset.presignedUrlCount ?? 0;
    const rejection = presignBudgetError(alreadyIssued, args.count, parts);
    if (rejection) throw new Error(rejection);
    const issued = alreadyIssued + args.count;
    await ctx.db.patch(args.assetId, {
      presignedUrlCount: issued,
      updatedAt: Date.now(),
    });
    return { issued, budget: presignBudget(parts) };
  },
});

/**
 * Internal: records the B2 multipart handle on the draft. No inner auth check
 * by design — the row was drafted by a caller that already passed
 * `resolveUploadInitiator`, and phase 3's worker drives these helpers
 * session-lessly.
 */
export const attachUploadId = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    uploadId: v.string(),
    rawKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.assetId, {
      uploadId: args.uploadId,
      rawKey: args.rawKey,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Internal: guarded status changes for the staged pipeline. Same-status is a
 * no-op (idempotent retries); every other pair must be an edge in
 * `canVideoTransition`. `queued` and `failed` clear the multipart handle —
 * once the raw object is complete or the upload is dead it is meaningless.
 */
export const transitionUploadStatus = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    to: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    if (asset.status === args.to) return { changed: false };
    if (!canVideoTransition(asset.status, args.to)) {
      throw new Error(`Invalid video status transition: ${asset.status} \u2192 ${args.to}`);
    }
    await ctx.db.patch(args.assetId, {
      status: args.to,
      updatedAt: Date.now(),
      // Convex treats `undefined` in a patch as "delete this field".
      ...(args.to === "queued" || args.to === "failed" ? { uploadId: undefined } : {}),
      ...(args.to === "failed"
        ? { errorMessage: (args.errorMessage ?? "Upload failed").slice(0, 500) }
        : {}),
      ...(args.to === "processing" ? { processingStartedAt: Date.now() } : {}),
    });
    return { changed: true };
  },
});

/**
 * Internal: clears the raw source reference after the raw object has been
 * deleted from B2. Called by the Phase 5 cleanup action; best-effort, never
 * throws on a missing row.
 */
export const clearRawSource = internalMutation({
  args: { assetId: v.id("videoAssets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    await ctx.db.patch(args.assetId, {
      rawKey: undefined,
      uploadId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Internal: list `awaiting_upload` assets older than the cutoff, for the
 * stale-multipart reconciler. Returns the handles the action needs to abort.
 */
export const listStaleAwaitingUploads = internalQuery({
  args: { cutoff: v.number() },
  returns: v.array(
    v.object({
      assetId: v.id("videoAssets"),
      uploadId: v.optional(v.string()),
      rawKey: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("videoAssets")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_upload"))
      .collect();
    return rows
      .filter((row) => row.createdAt < args.cutoff)
      .map((row) => ({
        assetId: row._id,
        uploadId: row.uploadId,
        rawKey: row.rawKey,
      }));
  },
});

/**
 * Internal: list assets whose raw source is past retention. `ready` rows keep
 * theirs for a month so a broken ladder can be rebuilt; `failed` rows keep
 * theirs for the same window so a retry is possible, then both are swept.
 * Read-only, so a test can assert the cutoff without touching B2.
 */
export const listExpiredRawSources = internalQuery({
  args: { cutoff: v.number() },
  returns: v.array(
    v.object({
      assetId: v.id("videoAssets"),
      rawKey: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const expired: Array<{ assetId: Id<"videoAssets">; rawKey: string }> = [];
    for (const status of ["ready", "failed"] as const) {
      const rows = await ctx.db
        .query("videoAssets")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const row of rows) {
        if (row.rawKey === undefined || row.updatedAt >= args.cutoff) continue;
        expired.push({ assetId: row._id, rawKey: row.rawKey });
      }
    }
    return expired;
  },
});

/**
 * Internal: DB-only reconciliation of stale `awaiting_upload` rows. Marks any
 * row older than the cutoff as failed. B2-side abort is the action's job; this
 * exists so a mutation-only caller (or a test) can drive the state machine.
 */
export const cleanupStaleUploads = internalMutation({
  args: { cutoff: v.optional(v.number()), olderThanMs: v.optional(v.number()) },
  returns: v.object({ reconciled: v.number(), count: v.number(), cleaned: v.number() }),
  handler: async (ctx, args) => {
    const cutoff = args.cutoff ?? Date.now() - (args.olderThanMs ?? 24 * 60 * 60 * 1000);
    const rows = await ctx.db
      .query("videoAssets")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_upload"))
      .collect();
    let reconciled = 0;
    for (const row of rows) {
      if (row.createdAt >= cutoff) continue;
      if (row.status !== "awaiting_upload") continue;
      try {
        if (!canVideoTransition(row.status, "failed")) continue;
        await ctx.db.patch(row._id, {
          status: "failed",
          uploadId: undefined,
          errorMessage: "Stale upload reconciled",
          updatedAt: Date.now(),
        });
        reconciled += 1;
      } catch {
        // skip
      }
    }
    return { reconciled, count: reconciled, cleaned: reconciled };
  },
});
export const reconcileStaleUploads = cleanupStaleUploads;
export const reconcileStaleMultipartUploads = cleanupStaleUploads;


/**
 * Internal: writes the per-asset AES key exactly once. A retried completion
 * finds the row already present and returns — the key must never rotate after
 * the worker has begun encrypting with it.
 */
export const storeVideoKey = internalMutation({
  args: { assetId: v.id("videoAssets"), keyB64: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.keyB64.length !== 24) throw new Error("Invalid video key");
    const existing = await ctx.db
      .query("videoKeys")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .first();
    if (existing) return null;
    await ctx.db.insert("videoKeys", { assetId: args.assetId, keyB64: args.keyB64 });
    return null;
  },
});
