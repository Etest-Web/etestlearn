import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getPublitioUploadUrl } from "@/lib/publitio";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Mint a Publit.io signing URL for a lesson video.
 *
 * Three things this must not be, and none of them are optional:
 *
 *  - **Unbounded.** Signing URL after signing URL spends third-party quota on
 *    this deployment's key, so the caller gets a fixed bucket (20/hour per
 *    user, durable in Convex) checked *before* the key is used. Fail-closed:
 *    if the limiter cannot answer, the request is refused rather than allowed
 *    (M-5).
 *  - **Unbound.** A signed URL is only handed out for a lesson the caller may
 *    actually manage — the same `canUploadToLesson` gate the UploadThing
 *    route uses, so both upload paths agree on who may upload where.
 *  - **Verbose on failure.** Signing failures are reported as a generic 500
 *    body; the detail goes to the server log only, because the client has no
 *    use for it and an error string from a signing library sometimes has.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const token = await getToken({ template: "convex" });
  if (!convexUrl || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ConvexHttpClient } = await import("convex/browser");
  const { api } = await import("@/convex/_generated/api");
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  const me = await convex.query(api.users.getCurrentUser);
  if (!me || (me.role !== "instructor" && me.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit before the lesson check: the bucket is keyed on the identity
  // we already have, and a caller hammering for signatures should not also be
  // buying a database read per attempt.
  //
  // Fail closed on purpose — 503 says "temporarily unavailable", which is the
  // truth, and it is a different answer from "you are out of quota".
  let durable: { allowed: boolean; retryAfterMs: number };
  try {
    durable = await consumeDurableRateLimit(
      `publitioUploadUrl:${userId}`,
      MAX_PER_WINDOW,
      WINDOW_MS,
    );
  } catch (error) {
    console.error("Durable rate limiter unavailable for publitio upload route:", error);
    return NextResponse.json(
      { error: "Rate limiting is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }
  if (!durable.allowed) {
    return NextResponse.json(
      { error: "Too many upload requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil(durable.retryAfterMs / 1000))),
        },
      },
    );
  }

  // The lesson this upload is for. Required: an unbound signing URL would let
  // any instructor session mint Publit.io capacity regardless of what (if
  // anything) they are editing.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const lessonId = (rawBody as { lessonId?: unknown } | null)?.lessonId;
  if (typeof lessonId !== "string" || !lessonId || lessonId.length > 100) {
    return NextResponse.json({ error: "lessonId is required." }, { status: 400 });
  }

  try {
    const allowed = await convex.query(api.videoAssets.canUploadToLesson, {
      lessonId: lessonId as Id<"lessons">,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    // A malformed id never reaches the handler: the validator rejects it, and
    // "you sent something that is not a lesson id" is a 400 rather than a 500.
    return NextResponse.json({ error: "Invalid lessonId." }, { status: 400 });
  }

  const apiKey = process.env.PUBLITIO_API_KEY;
  const apiSecret = process.env.PUBLITIO_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error("Publit.io credentials are not configured on the server");
    return NextResponse.json(
      { error: "Video uploads are unavailable right now." },
      { status: 500 }
    );
  }

  try {
    const uploadUrl = getPublitioUploadUrl(apiKey, apiSecret);
    return NextResponse.json({ uploadUrl });
  } catch (err) {
    // Generic body, specific log: the client is told it failed, the operator
    // is told why, and no signing internals cross the wire (M-5).
    console.error("Failed to sign Publit.io upload URL:", err);
    return NextResponse.json(
      { error: "Could not create an upload URL. Please try again." },
      { status: 500 }
    );
  }
}
