"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { extractScormArchive } from "../lib/scorm/zip";
import type { Id } from "./_generated/dataModel";

const FILE_BATCH_SIZE = 50;

/**
 * Node action to unpack a SCORM archive uploaded to Convex storage,
 * validate manifest, store all assets, and register the package.
 */
export const extractAndStoreScormPackage = action({
  args: {
    courseId: v.id("courses"),
    lessonId: v.optional(v.id("lessons")),
    zipStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // 1. Verify caller permission
    const auth = await ctx.runQuery(internal.scorm.canManageCourseInternal, {
      courseId: args.courseId,
    });
    if (!auth.canManage) {
      throw new Error("Not authorized to manage this course");
    }

    // 2. Fetch the uploaded zip file from storage
    const blob = await ctx.storage.get(args.zipStorageId);
    if (!blob) {
      throw new Error("Uploaded SCORM package archive not found in storage");
    }

    const zipBuffer = new Uint8Array(await blob.arrayBuffer());

    // 3. Decompress, validate against Zip Slip and Zip Bombs, parse manifest
    let extracted;
    try {
      extracted = await extractScormArchive(zipBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SCORM package extraction failed: ${msg}`);
    }

    // 4. If linked to an existing lesson that already has a package, clean up old package
    if (args.lessonId) {
      await ctx.runMutation(internal.scorm.cleanupLessonExistingPackage, {
        lessonId: args.lessonId,
      });
    }

    // 5. Create the scormPackages record
    const storagePrefix = `scorm/${args.courseId}/${Date.now()}`;
    const packageId: Id<"scormPackages"> = await ctx.runMutation(
      internal.scorm.createPackageRecord,
      {
        courseId: args.courseId,
        lessonId: args.lessonId,
        title: extracted.manifest.title,
        version: extracted.manifest.version,
        entryPoint: extracted.manifest.entryPoint,
        storagePrefix,
        packageSize: extracted.totalSize,
        masteryScore: extracted.manifest.masteryScore,
        manifestData: JSON.stringify(extracted.manifest),
        zipStorageId: args.zipStorageId,
      }
    );

    // 6. Store extracted asset files in Convex storage and record entries
    let currentBatch: Array<{
      path: string;
      storageId: Id<"_storage">;
      contentType: string;
      sizeBytes: number;
    }> = [];

    for (const file of extracted.files) {
      const arrayBuffer = file.data.buffer.slice(
        file.data.byteOffset,
        file.data.byteOffset + file.data.byteLength
      ) as ArrayBuffer;
      const fileBlob = new Blob([arrayBuffer], { type: file.contentType });
      const fileStorageId = await ctx.storage.store(fileBlob);

      currentBatch.push({
        path: file.path,
        storageId: fileStorageId,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      });

      if (currentBatch.length >= FILE_BATCH_SIZE) {
        await ctx.runMutation(internal.scorm.savePackageFileBatch, {
          packageId,
          files: currentBatch,
        });
        currentBatch = [];
      }
    }

    if (currentBatch.length > 0) {
      await ctx.runMutation(internal.scorm.savePackageFileBatch, {
        packageId,
        files: currentBatch,
      });
    }

    // 7. If lesson was provided, link package to lesson
    if (args.lessonId) {
      await ctx.runMutation(internal.scorm.linkPackageToLessonInternal, {
        packageId,
        lessonId: args.lessonId,
        title: extracted.manifest.title,
      });
    }

    return {
      success: true,
      packageId,
      title: extracted.manifest.title,
      version: extracted.manifest.version,
      entryPoint: extracted.manifest.entryPoint,
      fileCount: extracted.files.length,
      totalBytes: extracted.totalSize,
      masteryScore: extracted.manifest.masteryScore,
    };
  },
});
