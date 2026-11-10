import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type {
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
  GenericSchema,
  SchemaDefinition,
} from "convex/server";
import {
  DEFAULT_TRANSCODE_EVENT_TYPE,
  MAX_TRANSCODE_ATTEMPTS,
  canRetryTranscode,
  githubDispatchConfig,
  hlsPrefixOf,
  isAuthorizedTranscodeCall,
  isIvHex,
  isSafeAssetId,
  isTranscodeObjectKey,
  masterPlaylistKeyOf,
  randomIvHex,
  repositoryDispatchBody,
  transcodeReportError,
  variantPlaylistKeyOf,
  type TranscodeReport,
} from "../lib/video-transcode-job";
import { RAW_SOURCE_RETENTION_MS, rawSourceRetentionCutoff } from "../lib/videos";

/**
 * Phase 3 job invariants.
 *
 * The pure half pins the report/path/auth policy the HTTP boundary and the
 * runner share. The Convex half pins the state machine that protects a served
 * ladder: `ready` is terminal, the IV is minted once, and only `processing`
 * rows can be completed or failed.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

const VALID_KEY_B64 = "MDEyMzQ1Njc4OWFiY2RlZg==";

type SeedOptions = {
  status?: "queued" | "processing" | "ready" | "failed";
  ivHex?: string;
  attempts?: number;
  withKey?: boolean;
};

async function seedAsset(t: TestConvex<typeof schema>, options: SeedOptions = {}) {
  const now = Date.now();
  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: `clerk_${now}_${Math.random()}`,
      email: "instructor@test.com",
      name: "Instructor",
      role: "instructor",
      createdAt: now,
    }),
  );
  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Transcode Course",
      slug: `transcode-course-${now}-${Math.random()}`,
      description: "Test course",
      instructorId,
      published: true,
      price: 0,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );
  const lessonId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("lessons", {
      courseId,
      title: "Lesson 1",
      contentType: "video",
      order: 1,
      createdAt: now,
    }),
  );
  const assetId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("videoAssets", {
      lessonId,
      status: options.status ?? "queued",
      sourceFileUrl: "",
      sourceFileKey: "",
      rawKey: "raw/asset/source",
      sizeBytes: 1024,
      ivHex: options.ivHex,
      attempts: options.attempts,
      createdAt: now,
      updatedAt: now,
    }),
  );
  if (options.withKey !== false) {
    await t.run((ctx: TestCtx) =>
      ctx.db.insert("videoKeys", { assetId, keyB64: VALID_KEY_B64 }),
    );
  }
  return { assetId, lessonId };
}

function reportFor(assetId: string): TranscodeReport {
  return {
    durationSeconds: 120,
    variants: [
      {
        variant: 0,
        label: "360p",
        height: 360,
        width: 640,
        bitrate: 800_000,
        bandwidth: 900_000,
      },
      {
        variant: 1,
        label: "720p",
        height: 720,
        width: 1280,
        bitrate: 2_800_000,
        bandwidth: 3_000_000,
      },
    ],
    masterPlaylistKey: masterPlaylistKeyOf(assetId),
    variantPlaylistKeys: [
      { variant: 0, key: variantPlaylistKeyOf(assetId, 0) },
      { variant: 1, key: variantPlaylistKeyOf(assetId, 1) },
    ],
  };
}

describe("transcode report policy", () => {
  test("a report matching the Worker layout is accepted", () => {
    expect(transcodeReportError("asset123", reportFor("asset123"))).toBeNull();
  });

  test("a master key outside the asset prefix is refused", () => {
    const report = reportFor("asset123");
    expect(
      transcodeReportError("asset123", { ...report, masterPlaylistKey: "hls/other/master.m3u8" }),
    ).toMatch(/master playlist key/i);
  });

  test("variant folders and heights must agree", () => {
    const report = reportFor("asset123");
    const broken: TranscodeReport = {
      ...report,
      variants: [{ ...report.variants[0]!, variant: 1 }],
      variantPlaylistKeys: [{ variant: 1, key: variantPlaylistKeyOf("asset123", 1) }],
    };
    expect(transcodeReportError("asset123", broken)).toMatch(/does not match 360p/i);
  });

  test("an unsupported height is refused", () => {
    const report = reportFor("asset123");
    const broken: TranscodeReport = {
      ...report,
      variants: [{ ...report.variants[0]!, height: 480 }],
      variantPlaylistKeys: [{ variant: 0, key: variantPlaylistKeyOf("asset123", 0) }],
    };
    expect(transcodeReportError("asset123", broken)).toMatch(/unsupported variant height/i);
  });

  test("every variant needs exactly one playlist", () => {
    const report = reportFor("asset123");
    expect(
      transcodeReportError("asset123", {
        ...report,
        variantPlaylistKeys: report.variantPlaylistKeys.slice(0, 1),
      }),
    ).toMatch(/exactly one playlist/i);
  });
});

describe("transcode key and path helpers", () => {
  test("asset ids and object keys match the Worker allowlist", () => {
    expect(isSafeAssetId("asset123")).toBe(true);
    expect(isSafeAssetId("../asset")).toBe(false);
    expect(isTranscodeObjectKey("asset123", "hls/asset123/master.m3u8")).toBe(true);
    expect(isTranscodeObjectKey("asset123", "hls/asset123/0/seg_12.ts")).toBe(true);
    expect(isTranscodeObjectKey("asset123", "hls/asset123/0/seg_12.ts/extra")).toBe(false);
    expect(isTranscodeObjectKey("asset123", "hls/asset999/master.m3u8")).toBe(false);
    expect(hlsPrefixOf("asset123")).toBe("hls/asset123");
  });

  test("an IV is 32 lowercase hex characters", () => {
    expect(isIvHex(randomIvHex())).toBe(true);
    expect(isIvHex("ABCDEF")).toBe(false);
    expect(isIvHex("0".repeat(32))).toBe(true);
  });
});

describe("transcode secret and dispatch helpers", () => {
  test("only the exact bearer token is accepted", () => {
    expect(isAuthorizedTranscodeCall("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedTranscodeCall("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedTranscodeCall("Basic s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedTranscodeCall(null, "s3cret")).toBe(false);
    expect(isAuthorizedTranscodeCall("Bearer s3cret", undefined)).toBe(false);
  });

  test("dispatch config fails closed and defaults the event type", () => {
    expect(
      githubDispatchConfig({ token: "t", repo: "org/repo", eventType: undefined }),
    ).toEqual({ token: "t", repo: "org/repo", eventType: DEFAULT_TRANSCODE_EVENT_TYPE });
    expect(githubDispatchConfig({ token: "", repo: "org/repo" })).toBeNull();
    expect(githubDispatchConfig({ token: "t", repo: "not a repo" })).toBeNull();
    expect(githubDispatchConfig({ token: "t", repo: "org/repo", eventType: "bad type" })).toBeNull();
  });

  test("the dispatch body carries the asset id in client_payload", () => {
    expect(repositoryDispatchBody("asset123", "video-transcode")).toEqual({
      event_type: "video-transcode",
      client_payload: { assetId: "asset123" },
    });
  });
});

describe("transcode job state machine", () => {
  test("claim moves a queued asset to processing and mints an IV", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "queued" });

    const job = await t.mutation(internal.videoTranscodeJobs.claim, { assetId });

    expect(job.rawKey).toBe("raw/asset/source");
    expect(job.keyB64).toBe(VALID_KEY_B64);
    expect(isIvHex(job.ivHex)).toBe(true);
    expect(job.attempts).toBe(1);

    const asset = await t.run((ctx: TestCtx) => ctx.db.get(assetId));
    expect(asset?.status).toBe("processing");
    expect(asset?.ivHex).toBe(job.ivHex);
    expect(asset?.processingStartedAt).toBeTypeOf("number");
  });

  test("a retried claim reuses the IV and increments attempts", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "processing", ivHex: "a".repeat(32) });

    const job = await t.mutation(internal.videoTranscodeJobs.claim, { assetId });

    expect(job.ivHex).toBe("a".repeat(32));
    expect(job.attempts).toBe(1);
    const again = await t.mutation(internal.videoTranscodeJobs.claim, { assetId });
    expect(again.ivHex).toBe("a".repeat(32));
    expect(again.attempts).toBe(2);
  });

  test("claim refuses a ready asset", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "ready" });
    await expect(t.mutation(internal.videoTranscodeJobs.claim, { assetId })).rejects.toThrow(
      /already transcoded/i,
    );
  });

  test("a failed asset with its raw source can be claimed again", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "failed", attempts: 1 });

    const job = await t.mutation(internal.videoTranscodeJobs.claim, { assetId });

    expect(job.attempts).toBe(2);
    expect(job.rawKey).toBe("raw/asset/source");
    const asset = await t.run((ctx: TestCtx) => ctx.db.get(assetId));
    expect(asset?.status).toBe("processing");
    expect(asset?.errorMessage).toBeUndefined();
  });

  test("claim refuses a failed asset once the attempt budget is spent", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, {
      status: "failed",
      attempts: MAX_TRANSCODE_ATTEMPTS,
    });
    await expect(t.mutation(internal.videoTranscodeJobs.claim, { assetId })).rejects.toThrow(
      /retry is exhausted/i,
    );
  });

  test("claim refuses a failed asset whose raw source is gone", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "failed" });
    await t.run((ctx: TestCtx) =>
      ctx.db.patch(assetId, { rawKey: undefined }),
    );
    await expect(t.mutation(internal.videoTranscodeJobs.claim, { assetId })).rejects.toThrow(
      /retry is exhausted|verified raw source/i,
    );
  });

  test("claim refuses a failed asset that already published a ladder", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "failed" });
    await t.run((ctx: TestCtx) =>
      ctx.db.patch(assetId, { masterPlaylistKey: masterPlaylistKeyOf(assetId) }),
    );
    await expect(t.mutation(internal.videoTranscodeJobs.claim, { assetId })).rejects.toThrow(
      /retry is exhausted/i,
    );
  });

  test("claim refuses an asset with no encryption key", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "queued", withKey: false });
    await expect(t.mutation(internal.videoTranscodeJobs.claim, { assetId })).rejects.toThrow(
      /key is missing/i,
    );
  });

  test("complete writes the ladder and points the lesson at the asset", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId, lessonId } = await seedAsset(t, { status: "processing" });
    const report = reportFor(assetId);

    const result = await t.mutation(internal.videoTranscodeJobs.complete, {
      assetId,
      durationSeconds: report.durationSeconds,
      variants: [...report.variants],
      masterPlaylistKey: report.masterPlaylistKey,
      variantPlaylistKeys: [...report.variantPlaylistKeys],
    });
    expect(result.status).toBe("ready");

    const asset = await t.run((ctx: TestCtx) => ctx.db.get(assetId));
    expect(asset?.status).toBe("ready");
    expect(asset?.durationSeconds).toBe(120);
    expect(asset?.hlsPrefix).toBe(hlsPrefixOf(assetId));
    expect(asset?.masterPlaylistKey).toBe(report.masterPlaylistKey);
    expect(asset?.variantPlaylistKeys).toEqual(report.variantPlaylistKeys);
    expect(asset?.variants).toEqual([
      { label: "360p", height: 360, width: 640, bitrate: 800_000, bandwidth: 900_000 },
      { label: "720p", height: 720, width: 1280, bitrate: 2_800_000, bandwidth: 3_000_000 },
    ]);

    const lesson = await t.run((ctx: TestCtx) => ctx.db.get(lessonId));
    expect(lesson?.videoAssetId).toBe(assetId);
    expect(lesson?.contentType).toBe("video");

    // Retention: the raw source stays so a broken ladder can be rebuilt
    // without another upload; the daily reaper owns its deletion.
    expect(asset?.rawKey).toBe("raw/asset/source");
  });

  test("complete is idempotent on a ready asset", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "processing" });
    const report = reportFor(assetId);
    await t.mutation(internal.videoTranscodeJobs.complete, {
      assetId,
      durationSeconds: report.durationSeconds,
      variants: [...report.variants],
      masterPlaylistKey: report.masterPlaylistKey,
      variantPlaylistKeys: [...report.variantPlaylistKeys],
    });

    // A wrong second report must not overwrite a served ladder either: the
    // ready guard returns before validation.
    const result = await t.mutation(internal.videoTranscodeJobs.complete, {
      assetId,
      durationSeconds: report.durationSeconds,
      variants: [...report.variants],
      masterPlaylistKey: "hls/wrong/master.m3u8",
      variantPlaylistKeys: [...report.variantPlaylistKeys],
    });
    expect(result.status).toBe("ready");

    const asset = await t.run((ctx: TestCtx) => ctx.db.get(assetId));
    expect(asset?.masterPlaylistKey).toBe(report.masterPlaylistKey);
  });

  test("complete refuses a report outside the Worker allowlist", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "processing" });

    const brokenReport = reportFor(assetId);
    await expect(
      t.mutation(internal.videoTranscodeJobs.complete, {
        assetId,
        durationSeconds: brokenReport.durationSeconds,
        variants: [brokenReport.variants[0]!],
        masterPlaylistKey: brokenReport.masterPlaylistKey,
        variantPlaylistKeys: [{ variant: 0, key: "hls/elsewhere/0/index.m3u8" }],
      }),
    ).rejects.toThrow(/variant playlist key/i);
  });

  test("complete refuses an asset that was never claimed", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "queued" });
    const neverClaimed = reportFor(assetId);
    await expect(
      t.mutation(internal.videoTranscodeJobs.complete, {
        assetId,
        durationSeconds: neverClaimed.durationSeconds,
        variants: [...neverClaimed.variants],
        masterPlaylistKey: neverClaimed.masterPlaylistKey,
        variantPlaylistKeys: [...neverClaimed.variantPlaylistKeys],
      }),
    ).rejects.toThrow(/not being transcoded/i);
  });

  test("fail marks a processing asset failed and keeps the reason", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "processing" });

    const result = await t.mutation(internal.videoTranscodeJobs.fail, {
      assetId,
      errorMessage: "ffmpeg exited 1",
    });
    expect(result.status).toBe("failed");

    const asset = await t.run((ctx: TestCtx) => ctx.db.get(assetId));
    expect(asset?.status).toBe("failed");
    expect(asset?.errorMessage).toBe("ffmpeg exited 1");

    // Idempotent: a repeated failure report is accepted.
    await expect(
      t.mutation(internal.videoTranscodeJobs.fail, { assetId, errorMessage: "again" }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  test("fail refuses to bury a ready asset", async () => {
    const t = convexTest(testSchema, modules);
    const { assetId } = await seedAsset(t, { status: "ready" });
    await expect(
      t.mutation(internal.videoTranscodeJobs.fail, { assetId, errorMessage: "late error" }),
    ).rejects.toThrow(/already ready/i);
  });

  test("jobStatus reports only work worth dispatching", async () => {
    const t = convexTest(testSchema, modules);
    const queued = await seedAsset(t, { status: "queued" });
    const ready = await seedAsset(t, { status: "ready" });
    const retryable = await seedAsset(t, { status: "failed", attempts: 1 });
    const exhausted = await seedAsset(t, {
      status: "failed",
      attempts: MAX_TRANSCODE_ATTEMPTS,
    });

    expect(await t.query(internal.videoTranscodeJobs.jobStatus, { assetId: queued.assetId })).toBe(
      "queued",
    );
    expect(await t.query(internal.videoTranscodeJobs.jobStatus, { assetId: ready.assetId })).toBeNull();
    expect(
      await t.query(internal.videoTranscodeJobs.jobStatus, { assetId: retryable.assetId }),
    ).toBe("failed");
    expect(
      await t.query(internal.videoTranscodeJobs.jobStatus, { assetId: exhausted.assetId }),
    ).toBeNull();
  });
});

describe("raw source retention", () => {
  test("only a failed job with a source and attempts left is retryable", () => {
    const base = { status: "failed", rawKey: "raw/asset/source", attempts: 1 };
    expect(canRetryTranscode(base)).toBe(true);
    expect(canRetryTranscode({ ...base, status: "ready" })).toBe(false);
    expect(canRetryTranscode({ ...base, rawKey: undefined })).toBe(false);
    expect(canRetryTranscode({ ...base, masterPlaylistKey: "hls/asset/master.m3u8" })).toBe(false);
    expect(canRetryTranscode({ ...base, attempts: MAX_TRANSCODE_ATTEMPTS })).toBe(false);
  });

  test("the retention cutoff is one month behind now", () => {
    expect(RAW_SOURCE_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(rawSourceRetentionCutoff(1_000_000_000)).toBe(1_000_000_000 - RAW_SOURCE_RETENTION_MS);
  });

  test("the reaper query lists ready and failed assets past retention", async () => {
    const t = convexTest(testSchema, modules);
    const now = Date.now();
    const expired = await seedAsset(t, { status: "ready" });
    const fresh = await seedAsset(t, { status: "ready" });
    const failedOld = await seedAsset(t, { status: "failed" });
    await t.run(async (ctx: TestCtx) => {
      await ctx.db.patch(expired.assetId, { updatedAt: now - RAW_SOURCE_RETENTION_MS - 1 });
      await ctx.db.patch(failedOld.assetId, { updatedAt: now - RAW_SOURCE_RETENTION_MS - 1 });
    });

    const rows = await t.query(internal.videoAssets.listExpiredRawSources, {
      cutoff: rawSourceRetentionCutoff(now),
    });
    expect(rows.map((row) => row.assetId).sort()).toEqual(
      [expired.assetId, failedOld.assetId].sort(),
    );
    expect(rows.every((row) => row.rawKey === "raw/asset/source")).toBe(true);
    expect(rows.some((row) => row.assetId === fresh.assetId)).toBe(false);
  });
});
