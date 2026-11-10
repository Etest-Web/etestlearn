import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  hlsPrefixOf,
  isIvHex,
  randomIvHex,
  transcodeReportError,
  githubDispatchConfig,
  repositoryDispatchBody,
} from "../lib/video-transcode-job";
import type { TranscodeReport } from "../lib/video-transcode-job";

/**
 * Phase 3 transcode job: the Convex half of the GitHub Actions worker.
 *
 * The runner is session-less. It claims an asset with `VIDEO_TRANSCODE_TOKEN`,
 * downloads the raw object from B2, builds the ladder, then reports
 * completion or failure. Three rules keep a re-run from corrupting a served
 * video:
 *
 *   · `claim` accepts `queued` and an idempotent `processing` retry, and
 *     refuses `ready` outright. A ladder that players already received must
 *     never be rebuilt: the AES key is already in the playlists.
 *   · The IV is minted once, at the first claim, and reused by every retry.
 *     Rotating it would change the ciphertext of segments cached by the CDN.
 *   · `complete` and `fail` only touch `processing` (or are no-ops on their own
 *     terminal state). `ready` is never overwritten.
 */

const jobStatusRef = makeFunctionReference<
  "query",
  { assetId: Id<"videoAssets"> },
  "queued" | "processing" | null
>("videoTranscodeJobs:jobStatus");

/** The asset fields a worker needs, read in the same transaction as the claim. */
export const claim = internalMutation({
  args: { assetId: v.id("videoAssets") },
  returns: v.object({
    assetId: v.id("videoAssets"),
    rawKey: v.string(),
    sizeBytes: v.number(),
    keyB64: v.string(),
    ivHex: v.string(),
    attempts: v.number(),
  }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    if (asset.status === "ready") {
      throw new Error("Video is already transcoded; refusing to rebuild a served ladder");
    }
    if (asset.status !== "queued" && asset.status !== "processing") {
      throw new Error("Video is not queued for transcoding");
    }
    if (asset.rawKey === undefined || asset.sizeBytes === undefined) {
      throw new Error("Video has no verified raw source");
    }

    const keyRow = await ctx.db
      .query("videoKeys")
      .withIndex("by_asset", (q) => q.eq("assetId", args.assetId))
      .first();
    if (!keyRow) throw new Error("Video encryption key is missing");

    // Mint once. A retry must reuse the IV: the CDN may already hold
    // ciphertext produced with it.
    const ivHex = asset.ivHex ?? randomIvHex();
    if (!isIvHex(ivHex)) throw new Error("Video encryption IV is malformed");

    const attempts = (asset.attempts ?? 0) + 1;
    const now = Date.now();
    await ctx.db.patch(args.assetId, {
      status: "processing",
      ivHex,
      attempts,
      processingStartedAt: now,
      transcodeProgress: 0,
      updatedAt: now,
      errorMessage: undefined,
    });

    return {
      assetId: args.assetId,
      rawKey: asset.rawKey,
      sizeBytes: asset.sizeBytes,
      keyB64: keyRow.keyB64,
      ivHex,
      attempts,
    };
  },
});

/**
 * Record a finished ladder. The report is checked against the Worker's path
 * allowlist before anything is written, so a runner bug cannot publish keys
 * the CDN will refuse to serve. Completion also points the lesson at the new
 * asset — `createUploadDraft` records `replacesAssetId` but deliberately does
 * not repoint the lesson until a playable ladder exists.
 */
export const complete = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    durationSeconds: v.number(),
    variants: v.array(
      v.object({
        variant: v.number(),
        label: v.string(),
        height: v.number(),
        width: v.optional(v.number()),
        bitrate: v.number(),
        bandwidth: v.number(),
      }),
    ),
    masterPlaylistKey: v.string(),
    variantPlaylistKeys: v.array(
      v.object({ variant: v.number(), key: v.string() }),
    ),
  },
  returns: v.object({ status: v.literal("ready") }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    // Idempotent: a runner whose completion response was lost re-reports and
    // must not rewrite a ready ladder.
    if (asset.status === "ready") return { status: "ready" as const };
    if (asset.status !== "processing") {
      throw new Error("Video is not being transcoded");
    }
    const replacedAssetId = asset.replacesAssetId;
    const rawKey = asset.rawKey;

    const report: TranscodeReport = {
      durationSeconds: args.durationSeconds,
      variants: args.variants,
      masterPlaylistKey: args.masterPlaylistKey,
      variantPlaylistKeys: args.variantPlaylistKeys,
    };
    const rejection = transcodeReportError(args.assetId, report);
    if (rejection) throw new Error(rejection);

    const lesson = await ctx.db.get(asset.lessonId);
    if (!lesson) throw new Error("Lesson not found");

    const now = Date.now();
    await ctx.db.patch(args.assetId, {
      status: "ready",
      durationSeconds: args.durationSeconds,
      // The stored ladder shape has no `variant` folder number; that is only
      // a transport detail of the report.
      variants: args.variants.map((variant) => ({
        label: variant.label,
        height: variant.height,
        ...(variant.width === undefined ? {} : { width: variant.width }),
        bitrate: variant.bitrate,
        bandwidth: variant.bandwidth,
      })),
      hlsPrefix: hlsPrefixOf(args.assetId),
      masterPlaylistKey: args.masterPlaylistKey,
      variantPlaylistKeys: args.variantPlaylistKeys,
      errorMessage: undefined,
      transcodeProgress: 100,
      // Raw source is deleted by the Phase 5 cleanup action scheduled below;
      // clearing the reference here keeps a retry from re-fetching it.
      rawKey: undefined,
      uploadId: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(asset.lessonId, {
      videoAssetId: args.assetId,
      contentType: "video",
    });

    // Phase 5: delete the raw source now that the ladder is served, and sweep
    // the HLS objects + row of the asset this one replaced.
    if (rawKey) {
      await ctx.scheduler.runAfter(0, internal.videoStorage.deleteRawSource, {
        assetId: args.assetId.toString(),
        rawKey,
      });
    }
    if (replacedAssetId) {
      const old = await ctx.db.get(replacedAssetId);
      if (old) {
        await ctx.scheduler.runAfter(0, internal.videoStorage.sweepHlsPrefix, {
          assetId: replacedAssetId.toString(),
        });
        if (old.rawKey) {
          await ctx.scheduler.runAfter(0, internal.videoStorage.deleteRawSource, {
            assetId: replacedAssetId.toString(),
            rawKey: old.rawKey,
          });
        }
        const oldKey = await ctx.db
          .query("videoKeys")
          .withIndex("by_asset", (q) => q.eq("assetId", replacedAssetId))
          .first();
        if (oldKey) await ctx.db.delete(oldKey._id);
        await ctx.db.delete(replacedAssetId);
      }
    }

    return { status: "ready" as const };
  },
});

/**
 * Record a dead job. `ready` is refused rather than tolerated: marking a
 * served ladder failed would hide a working video from learners over a
 * retryable runner error. Re-running a failed job is not supported — the
 * instructor uploads again and the new asset gets a fresh key and IV.
 */
export const fail = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    errorMessage: v.string(),
  },
  returns: v.object({ status: v.literal("failed") }),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Video asset not found");
    if (asset.status === "ready") {
      throw new Error("Video is already ready; refusing to mark it failed");
    }
    if (asset.status === "failed") return { status: "failed" as const };
    if (asset.status !== "queued" && asset.status !== "processing") {
      throw new Error("Video is not queued for transcoding");
    }

    await ctx.db.patch(args.assetId, {
      status: "failed",
      errorMessage: args.errorMessage.trim().slice(0, 500) || "Transcode failed",
      updatedAt: Date.now(),
    });
    // Phase 5: drop any partial HLS objects the runner may have uploaded.
    await ctx.scheduler.runAfter(0, internal.videoStorage.sweepHlsPrefix, {
      assetId: args.assetId.toString(),
    });
    return { status: "failed" as const };
  },
});

/**
 * Progress update from the runner. Only valid while processing; ignored if
 * the asset has moved on (retry/complete/fail race).
 */
export const setProgress = internalMutation({
  args: {
    assetId: v.id("videoAssets"),
    progress: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.status !== "processing") return null;
    const clamped = Math.max(0, Math.min(100, Math.round(args.progress)));
    await ctx.db.patch(args.assetId, {
      transcodeProgress: clamped,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * The dispatch guard: only a queued or in-flight job is worth sending to
 * GitHub. Reads the row directly so the action does not need the full claim
 * payload.
 */
export const jobStatus = internalQuery({
  args: { assetId: v.id("videoAssets") },
  returns: v.union(v.literal("queued"), v.literal("processing"), v.null()),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    if (asset.status === "queued" || asset.status === "processing") return asset.status;
    return null;
  },
});

/**
 * Ask GitHub Actions to run the transcode workflow. Missing or malformed
 * dispatch configuration is a warning, not a failed upload: the asset stays
 * `queued` and the workflow's manual `workflow_dispatch` input can start it.
 */
export const dispatch = internalAction({
  args: { assetId: v.id("videoAssets") },
  returns: v.object({ dispatched: v.boolean() }),
  handler: async (ctx, args) => {
    const status = await ctx.runQuery(jobStatusRef, { assetId: args.assetId });
    if (status === null) return { dispatched: false };

    const config = githubDispatchConfig({
      token: process.env.GITHUB_TRANSCODE_TOKEN,
      repo: process.env.GITHUB_TRANSCODE_REPO,
      eventType: process.env.GITHUB_TRANSCODE_EVENT_TYPE,
    });
    if (!config) {
      console.warn(
        `Video transcode dispatch is not configured; asset ${args.assetId} stays queued`,
      );
      return { dispatched: false };
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.repo}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(repositoryDispatchBody(args.assetId, config.eventType)),
        },
      );
      if (!response.ok) {
        console.warn(
          `Video transcode dispatch failed for asset ${args.assetId} (status ${response.status})`,
        );
        return { dispatched: false };
      }
      return { dispatched: true };
    } catch (error) {
      // The token is never included: only the failure reason is logged.
      console.warn(
        `Video transcode dispatch failed for asset ${args.assetId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return { dispatched: false };
    }
  },
});
