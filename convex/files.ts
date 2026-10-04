import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRateLimit } from "./helpers/rateLimit";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    await requireRateLimit(ctx, `upload:${identity.subject}`, 20, 60_000);
    return await ctx.storage.generateUploadUrl();
  },
});

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Validates an uploaded file against its stored metadata (real size + MIME
// type, not client-claimed values) before resolving its URL. Use this instead
// of getFileUrl for user-uploaded content like thumbnails and avatars.
export const validateAndResolveUpload = query({
  args: {
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image"), v.literal("video")),
    maxBytes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) {
      throw new Error("Uploaded file not found");
    }

    const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
    if (meta.size > maxBytes) {
      throw new Error(
        `File is too large (${Math.round(meta.size / 1024)} KB). Maximum is ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      );
    }

    if (args.kind === "image" && !meta.contentType?.startsWith("image/")) {
      throw new Error("Only image files are allowed");
    }

    if (args.kind === "video" && !meta.contentType?.startsWith("video/")) {
      throw new Error("Only video files are allowed");
    }

    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Returns a signed URL for any stored blob the caller can name by id.
 *
 * Residual risk, documented rather than papered over: the only gate is
 * "authenticated". Convex's `_storage` metadata records size and content type
 * but nothing about who uploaded the blob, so an ownership check is
 * impossible today without a schema change — there is simply no uploader to
 * compare the caller against. The exposure is bounded by two facts: storage
 * ids are unguessable, so a caller must already hold the exact id, and
 * learning one implies the app rendered it to them in a course, lesson or
 * certificate they could see. Prefer `validateAndResolveUpload` for
 * user-uploaded content, which at least re-checks size and MIME type against
 * the stored file. Follow-up (needs a schema change): record the uploader
 * when a blob is attached to a document and reject ids the caller does not
 * own.
 */
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});
