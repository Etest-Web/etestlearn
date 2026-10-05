import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const f = createUploadthing();

/**
 * Raw lesson-video uploads live on UploadThing; the encrypted HLS ladder
 * stays in Convex storage behind the token gate. Auth here is deliberately
 * thin (signed-in staff managing the lesson) — `videoAssets.registerSource`
 * re-verifies everything before an upload is attached, and the transcode
 * worker only fetches allowlisted UploadThing hosts.
 */
export const uploadRouter = {
  lessonVideo: f({ video: { maxFileSize: "1GB", maxFileCount: 1 } })
    .input(z.object({ lessonId: z.string() }))
    .middleware(async ({ input }) => {
      const { userId, getToken } = await auth();
      if (!userId) throw new UploadThingError("Unauthorized");
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      const token = await getToken();
      if (!convexUrl || !token) throw new UploadThingError("Unauthorized");
      const convex = new ConvexHttpClient(convexUrl);
      convex.setAuth(token);
      const ok = await convex.query(api.videoAssets.canUploadToLesson, {
        lessonId: input.lessonId as Id<"lessons">,
      });
      if (!ok) throw new UploadThingError("Forbidden");
      return { lessonId: input.lessonId };
    })
    .onUploadComplete(async ({ metadata }) => {
      // Attachment happens client-side via `videoAssets.registerSource`, which
      // carries the same manager check plus file validation.
      return { lessonId: metadata.lessonId };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
