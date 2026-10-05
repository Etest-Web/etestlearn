"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UTApi } from "uploadthing/server";
import { createAes128Iv, createAes128Key, encryptAes128Cbc } from "../lib/video-encryption";
import {
  listVariantSegments,
  pickLadder,
  probeVideo,
  transcodeToHls,
} from "../lib/video-encode";
import { buildMasterPlaylist } from "../lib/video-playlists";
import { assertUploadthingFileUrl } from "../lib/video-source";

/**
 * Background transcode worker. Runs on Convex with system ffmpeg: probe the
 * source, emit the HLS ladder, AES-128-encrypt every segment, upload the
 * ciphertext + manifests + key, then mark the asset ready.
 */
export const transcode = internalAction({
  args: { assetId: v.id("videoAssets") },
  handler: async (ctx, args) => {
    const workDir = mkdtempSync(join(tmpdir(), "video-"));
    try {
      await ctx.runMutation(internal.videoAssets.setAssetProcessing, { assetId: args.assetId });
      const asset = await ctx.runQuery(internal.videoAssets.getAssetForWorker, { assetId: args.assetId });

      // The URL was allowlisted at registerSource; re-check at fetch time so
      // a row written by any other path can never turn this worker into an
      // SSRF primitive.
      assertUploadthingFileUrl(asset.sourceFileUrl);
      const download = await fetch(asset.sourceFileUrl);
      if (!download.ok) throw new Error(`Source download failed: ${download.status}`);
      const inputPath = join(workDir, "source");
      writeFileSync(inputPath, Buffer.from(await download.arrayBuffer()));

      const probed = await probeVideo(inputPath);
      const ladder = pickLadder(probed.height);
      const outDir = join(workDir, "hls");
      await transcodeToHls(inputPath, outDir, ladder);

      const key = createAes128Key();
      const iv = createAes128Iv();
      const keyStorageId = await ctx.storage.store(new Blob([key as BlobPart], { type: "application/octet-stream" }));

      const variantManifestStorageIds = [];
      const segments = [];
      for (let i = 0; i < ladder.length; i++) {
        const names = listVariantSegments(outDir, i);
        if (names.length === 0) throw new Error(`Variant ${i} produced no segments`);
        for (const name of names) {
          const plaintext = readFileSync(join(outDir, name));
          const ciphertext = encryptAes128Cbc(plaintext, key, iv);
          const storageId = await ctx.storage.store(
            new Blob([ciphertext as BlobPart], { type: "video/mp2t" }),
          );
          segments.push({ variant: i, name, storageId });
        }
        const manifestId = await ctx.storage.store(
          new Blob([readFileSync(join(outDir, `out_${i}.m3u8`)) as BlobPart], { type: "application/x-mpegURL" }),
        );
        variantManifestStorageIds.push(manifestId);
      }

      const master = buildMasterPlaylist(ladder);
      const masterManifestStorageId = await ctx.storage.store(
        new Blob([master], { type: "application/x-mpegURL" }),
      );

      await ctx.runMutation(internal.videoAssets.completeAsset, {
        assetId: args.assetId,
        masterManifestStorageId,
        variantManifestStorageIds,
        segments,
        keyStorageId,
        ivHex: iv.toString("hex"),
        variants: ladder.map((l) => ({ label: l.label, height: l.height, bitrate: l.bitrate, bandwidth: l.bandwidth })),
        durationSeconds: Math.round(probed.durationSeconds),
      });
    } catch (err) {
      await ctx.runMutation(internal.videoAssets.failAsset, {
        assetId: args.assetId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  },
});

/**
 * Delete retired raw uploads from UploadThing. Best-effort by design: the
 * ladder in Convex storage is already gone by the time this runs, so a
 * failure here only leaks the source file, never student access.
 */
export const deleteUploadthingFiles = internalAction({
  args: { fileKeys: v.array(v.string()) },
  handler: async (_ctx, args) => {
    if (args.fileKeys.length === 0) return;
    const utapi = new UTApi();
    await utapi.deleteFiles(args.fileKeys);
  },
});
