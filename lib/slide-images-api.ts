import { makeFunctionReference } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";

/**
 * Typed handle on `convex/slideImages.ts` for the browser. A plain function
 * reference keeps client components away from a Convex *server* module (which
 * would bundle its AWS SDK imports) and avoids depending on codegen for a
 * module added this session.
 */

export type PresignSlideImageArgs = {
  lessonId: Id<"lessons">;
  contentType: string;
  fileName: string;
  sizeBytes: number;
};

export type PresignSlideImageResult = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  contentType: string;
};

export const presignSlideImage = makeFunctionReference<
  "action",
  PresignSlideImageArgs,
  PresignSlideImageResult
>("slideImages:presign");
