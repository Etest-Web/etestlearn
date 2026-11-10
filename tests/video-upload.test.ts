import { describe, expect, test } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type {
  GenericSchema,
  SchemaDefinition,
  DataModelFromSchemaDefinition,
  GenericMutationCtx,
} from "convex/server";
import {
  MAX_RAW_UPLOAD_BYTES,
  RAW_UPLOAD_PART_SIZE_BYTES,
  fingerprintError,
  inFlightUploadError,
  partNumbersError,
  presignBudgetError,
  rawCompletionError,
  rawPartCount,
  uploadPartSize,
} from "../lib/videos";

/**
 * Phase 1 upload invariants.
 *
 * Two layers are pinned here:
 *   · the pure validators in `lib/videos.ts` — the parts B2's answers are
 *     checked against, testable without a network or credentials;
 *   · the per-owner caps in `videoAssets.createUploadDraft`, which are the
 *     only place a draft row is created and therefore the only place a racing
 *     pair of browser tabs can be stopped.
 *
 * B2 itself is never contacted: every refusal below is decided before a client
 * is built or a URL is presigned.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
type TestDataModel = DataModelFromSchemaDefinition<typeof schema>;
type TestCtx = GenericMutationCtx<TestDataModel>;

const as = (t: TestConvex<typeof testSchema>, subject: string) =>
  t.withIdentity({ subject, tokenIdentifier: subject });

const MB = 1024 * 1024;

async function seedInstructorWithLessons(
  t: TestConvex<typeof testSchema>,
  lessonCount: number,
): Promise<Id<"lessons">[]> {
  const now = Date.now();

  const instructorId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("users", {
      clerkId: "clerk_upload_instructor",
      email: "uploader@test.com",
      name: "Uploader",
      role: "instructor",
      createdAt: now,
    }),
  );

  const courseId = await t.run((ctx: TestCtx) =>
    ctx.db.insert("courses", {
      title: "Upload Course",
      slug: "upload-course",
      description: "Video uploads",
      instructorId,
      published: false,
      price: 0,
      currency: "NGN",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const lessonIds: Id<"lessons">[] = [];
  for (let index = 0; index < lessonCount; index += 1) {
    const lessonId = await t.run((ctx: TestCtx) =>
      ctx.db.insert("lessons", {
        courseId,
        title: `Lesson ${index + 1}`,
        contentType: "video",
        order: index,
        createdAt: now,
      }),
    );
    lessonIds.push(lessonId);
  }
  return lessonIds;
}

describe("rawCompletionError", () => {
  test("accepts a landed set that reconstructs the declared body", () => {
    const sizeBytes = RAW_UPLOAD_PART_SIZE_BYTES * 2;
    const parts = [1, 2].map((partNumber) => ({
      partNumber,
      sizeBytes: uploadPartSize(sizeBytes, partNumber),
    }));

    expect(rawCompletionError(sizeBytes, parts)).toBeNull();
  });

  test("refuses a landed total larger than the 2 GB ceiling", () => {
    // Declared at the ceiling; B2 reports more bytes than that in total, which
    // is the shape of an oversized PUT that slipped past the presigned length.
    const parts = [
      { partNumber: 1, sizeBytes: MAX_RAW_UPLOAD_BYTES },
      { partNumber: 2, sizeBytes: RAW_UPLOAD_PART_SIZE_BYTES },
    ];

    expect(rawCompletionError(MAX_RAW_UPLOAD_BYTES, parts)).toBe(
      "Uploaded video exceeds the 2 GB limit",
    );
  });

  test("refuses a landed total that is short of the declared size", () => {
    const declaredSize = RAW_UPLOAD_PART_SIZE_BYTES * 2;

    expect(
      rawCompletionError(declaredSize, [
        { partNumber: 1, sizeBytes: RAW_UPLOAD_PART_SIZE_BYTES },
      ]),
    ).toBe(`Uploaded ${RAW_UPLOAD_PART_SIZE_BYTES} bytes but ${declaredSize} were declared`);
  });

  test("refuses a declared size above the ceiling before looking at parts", () => {
    expect(rawCompletionError(MAX_RAW_UPLOAD_BYTES + 1, [])).toBe(
      "Video exceeds the 2 GB upload limit",
    );
  });

  test("refuses parts that skip a number even when the byte total matches", () => {
    const sizeBytes = RAW_UPLOAD_PART_SIZE_BYTES * 2;

    expect(
      rawCompletionError(sizeBytes, [
        { partNumber: 1, sizeBytes: RAW_UPLOAD_PART_SIZE_BYTES },
        { partNumber: 3, sizeBytes: RAW_UPLOAD_PART_SIZE_BYTES },
      ]),
    ).toBe("Uploaded parts do not cover every part once");
  });

  test("refuses a part whose size is not the slice the file implies", () => {
    const sizeBytes = RAW_UPLOAD_PART_SIZE_BYTES * 2;

    expect(
      rawCompletionError(sizeBytes, [
        { partNumber: 1, sizeBytes: RAW_UPLOAD_PART_SIZE_BYTES - 1 },
        { partNumber: 2, sizeBytes: RAW_UPLOAD_PART_SIZE_BYTES + 1 },
      ]),
    ).toBe("Uploaded part 1 has the wrong size");
  });

  test("computes part counts by rounding up", () => {
    expect(rawPartCount(1)).toBe(1);
    expect(rawPartCount(RAW_UPLOAD_PART_SIZE_BYTES)).toBe(1);
    expect(rawPartCount(RAW_UPLOAD_PART_SIZE_BYTES + 1)).toBe(2);
  });
});

describe("partNumbersError", () => {
  test("refuses a part number beyond the server's part count", () => {
    expect(partNumbersError([4], 3)).toBe("Part number out of range: 4");
  });

  test("refuses zero, negative and non-integer part numbers", () => {
    expect(partNumbersError([0], 3)).toBe("Invalid part number");
    expect(partNumbersError([-1], 3)).toBe("Invalid part number");
    expect(partNumbersError([1.5], 3)).toBe("Invalid part number");
  });

  test("refuses duplicates and empty batches", () => {
    expect(partNumbersError([1, 1], 3)).toBe("Duplicate part number");
    expect(partNumbersError([], 3)).toBe("No parts requested");
  });

  test("refuses a batch larger than the per-call cap", () => {
    const tooMany = Array.from({ length: 51 }, (_, index) => index + 1);

    expect(partNumbersError(tooMany, 100)).toBe("Too many parts requested (max 50)");
  });

  test("accepts in-range, unique part numbers", () => {
    expect(partNumbersError([1, 2, 3], 3)).toBeNull();
  });
});

describe("presignBudgetError", () => {
  test("allows retries inside partCount + slack and refuses beyond it", () => {
    expect(presignBudgetError(3, 50, 3)).toBeNull();
    expect(presignBudgetError(53, 1, 3)).toBe("Too many presigned part URLs for this upload");
  });
});

describe("fingerprintError", () => {
  const declared = { sizeBytes: 12 * MB, lastModified: 1_700_000_000_000 };

  test("accepts the same file", () => {
    expect(fingerprintError(declared, { ...declared })).toBeNull();
  });

  test("refuses a different size or modification time", () => {
    const mismatch = "This is a different file than the upload was started with";

    expect(fingerprintError(declared, { ...declared, sizeBytes: declared.sizeBytes + 1 })).toBe(
      mismatch,
    );
    expect(
      fingerprintError(declared, { ...declared, lastModified: declared.lastModified + 1 }),
    ).toBe(mismatch);
  });

  test("refuses an unusable presented fingerprint", () => {
    expect(fingerprintError(declared, { sizeBytes: 0, lastModified: declared.lastModified })).toBe(
      "Invalid upload size",
    );
    expect(fingerprintError(declared, { sizeBytes: declared.sizeBytes, lastModified: 0 })).toBe(
      "Invalid file fingerprint",
    );
  });
});

describe("inFlightUploadError", () => {
  test("caps a single owner at two concurrent drafts", () => {
    expect(inFlightUploadError(1, MB, MB)).toBeNull();
    expect(inFlightUploadError(2, MB, MB)).toBe(
      "Too many uploads in progress; finish or cancel one first",
    );
  });

  test("caps total declared bytes in flight at 4 GB", () => {
    expect(inFlightUploadError(1, 3 * 1024 * MB, 1024 * MB)).toBeNull();
    expect(inFlightUploadError(1, 3 * 1024 * MB, 1024 * MB + 1)).toBe(
      "Too much video is already uploading; finish or cancel one first",
    );
  });
});

describe("videoAssets.createUploadDraft per-owner caps", () => {
  test("refuses a third in-flight draft for the same instructor", async () => {
    const t = convexTest(testSchema, modules);
    const [first, second, third] = await seedInstructorWithLessons(t, 3);
    const owner = as(t, "clerk_upload_instructor");
    const args = { sizeBytes: 10 * MB, fingerprintLastModified: 1_700_000_000_000 };

    await owner.mutation(internal.videoAssets.createUploadDraft, {
      lessonId: first!,
      ...args,
    });
    await owner.mutation(internal.videoAssets.createUploadDraft, {
      lessonId: second!,
      ...args,
    });

    await expect(
      owner.mutation(internal.videoAssets.createUploadDraft, { lessonId: third!, ...args }),
    ).rejects.toThrow("Too many uploads in progress; finish or cancel one first");
  });

  test("does not let a second draft open on the same lesson", async () => {
    const t = convexTest(testSchema, modules);
    const [lesson] = await seedInstructorWithLessons(t, 1);
    const owner = as(t, "clerk_upload_instructor");
    const args = { sizeBytes: 10 * MB, fingerprintLastModified: 1_700_000_000_000 };

    await owner.mutation(internal.videoAssets.createUploadDraft, { lessonId: lesson!, ...args });

    await expect(
      owner.mutation(internal.videoAssets.createUploadDraft, { lessonId: lesson!, ...args }),
    ).rejects.toThrow("This lesson already has a video upload in progress");
  });
});
