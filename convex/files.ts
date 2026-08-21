import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return await ctx.storage.generateUploadUrl();
});

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Validates an uploaded file against its stored metadata (real size + MIME
// type, not client-claimed values) before resolving its URL. Use this instead
// of getFileUrl for user-uploaded content like thumbnails and avatars.
export const validateAndResolveUpload = query({
  args: {
    storageId: v.id("_storage"),
    kind: v.union(v.literal("image")),
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

    return await ctx.storage.getUrl(args.storageId);
  },
});

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
