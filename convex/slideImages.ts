"use node";

/**
 * Server side of the slide-image upload handshake.
 *
 * The browser PUTs the file straight to a private B2 bucket through one
 * presigned URL; bytes never transit Convex. The URL is minted only after the
 * caller passes the same owner-or-admin check every course write uses. A
 * second bucket keeps slide images out of the video pipeline's raw-upload
 * lifecycle, and the key prefix (`slides/...`) is what the CDN Worker routes
 * to that bucket.
 *
 * The signed PUT pins both content type and length, so B2 refuses a body that
 * does not match what was authorized. Missing config is a refusal, never a
 * URL to some other bucket.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  MAX_SLIDE_IMAGE_BYTES,
  normalizeSlideImageType,
  slideImageKey,
  slideImagePublicUrl,
} from "../lib/slideImages";

interface B2Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  slidesBucket: string;
  cdnOrigin: string;
}

const ENV_LABELS: Readonly<Record<keyof B2Config, string>> = {
  endpoint: "B2_ENDPOINT",
  region: "B2_REGION",
  accessKeyId: "B2_APP_KEY_ID",
  secretAccessKey: "B2_APP_KEY",
  slidesBucket: "B2_SLIDES_BUCKET",
  cdnOrigin: "CDN_ORIGIN",
};

function readConfig(): B2Config {
  const values: B2Config = {
    endpoint: process.env.B2_ENDPOINT ?? "",
    region: process.env.B2_REGION ?? "",
    accessKeyId: process.env.B2_APP_KEY_ID ?? "",
    secretAccessKey: process.env.B2_APP_KEY ?? "",
    slidesBucket: process.env.B2_SLIDES_BUCKET ?? "",
    cdnOrigin: process.env.CDN_ORIGIN ?? process.env.NEXT_PUBLIC_CDN_ORIGIN ?? "",
  };
  const missing = (Object.keys(ENV_LABELS) as Array<keyof B2Config>).find(
    (key) => values[key].length === 0,
  );
  if (missing) {
    throw new Error(`Slide image storage is not configured (missing env ${ENV_LABELS[missing]})`);
  }
  return values;
}

let clientCache: { endpoint: string; client: S3Client } | null = null;

function b2Client(config: B2Config): S3Client {
  if (!clientCache || clientCache.endpoint !== config.endpoint) {
    clientCache = {
      endpoint: config.endpoint,
      client: new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: true,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    };
  }
  return clientCache.client;
}

/**
 * The auth query lives in `courses.ts`, which is not a `"use node"` module and
 * so can read `ctx.db`. A plain function reference avoids depending on a
 * regenerated `_generated/api.d.ts` for a function added this session.
 */
const authorizeUpload = makeFunctionReference<
  "query",
  { lessonId: Id<"lessons"> },
  { courseId: Id<"courses"> }
>("courses:authorizeSlideImageUpload");

/** Presigned PUT expiry — one hour, long enough for a 10 MB upload on a slow link. */
const PRESIGN_TTL_SECONDS = 3600;

export const presign = action({
  args: {
    lessonId: v.id("lessons"),
    contentType: v.string(),
    fileName: v.string(),
    sizeBytes: v.number(),
  },
  returns: v.object({
    uploadUrl: v.string(),
    publicUrl: v.string(),
    key: v.string(),
    contentType: v.string(),
  }),
  handler: async (ctx, args) => {
    const config = readConfig();

    // Identity propagates into the internal query; the whole owner-or-admin
    // check runs where the lesson and course rows are readable.
    const { courseId } = await ctx.runQuery(authorizeUpload, { lessonId: args.lessonId });

    if (
      !Number.isInteger(args.sizeBytes) ||
      args.sizeBytes <= 0 ||
      args.sizeBytes > MAX_SLIDE_IMAGE_BYTES
    ) {
      throw new Error(`Slide image must be between 1 byte and ${MAX_SLIDE_IMAGE_BYTES} bytes`);
    }
    const type = normalizeSlideImageType(args.contentType, args.fileName);
    if (!type) throw new Error("Unsupported slide image type");

    const key = slideImageKey(courseId, args.lessonId, randomUUID(), type);
    const uploadUrl = await getSignedUrl(
      b2Client(config),
      new PutObjectCommand({
        Bucket: config.slidesBucket,
        Key: key,
        ContentType: type,
        ContentLength: args.sizeBytes,
      }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );

    return {
      uploadUrl,
      publicUrl: slideImagePublicUrl(config.cdnOrigin, key),
      key,
      contentType: type,
    };
  },
});
