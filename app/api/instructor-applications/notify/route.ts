import { NextResponse } from "next/server";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import {
  emailKeyValueRows,
  emailLayout,
  emailParagraph,
} from "@/lib/emails/layout";
import { consumeDurableRateLimit, DurableRateLimitUnavailableError } from "@/lib/durable-rate-limit";
import { normalizeEmailAddress } from "@/lib/email-address";
import { isDisposableEmail } from "@/lib/email";
import { z } from "zod";

type InstructorApplicationPayload = {
  fullName: string;
  email: string;
  expertise: string;
  bio: string;
  portfolioUrl?: string;
  motivation: string;
};

const instructorApplicationSchema = z.object({
  fullName: z.string().trim().min(1, "Missing required fields.").max(200, "fullName exceeds the maximum length of 200 characters."),
  email: z.string().trim().min(1, "Missing required fields.").max(320, "email exceeds the maximum length of 320 characters."),
  expertise: z.string().trim().min(1, "Missing required fields.").max(300, "expertise exceeds the maximum length of 300 characters."),
  bio: z.string().trim().min(1, "Missing required fields.").max(5000, "bio exceeds the maximum length of 5000 characters."),
  motivation: z.string().trim().min(1, "Missing required fields.").max(5000, "motivation exceeds the maximum length of 5000 characters."),
  portfolioUrl: z
    .string()
    .trim()
    .max(2048, "portfolioUrl exceeds the maximum length of 2048 characters.")
    .url("Portfolio must be a valid URL.")
    .refine((url) => {
      try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "Portfolio must be an http(s) URL.")
    .optional()
    .or(z.literal("")),
});

/**
 * Fixed-window rate limiter: 5 per hour per client key.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

/**
 * In-memory limiter — the cheap first line of defense, checked before the
 * durable one. It is per-instance (each serverless cold start gets a fresh
 * map), so on its own it is bypassable by an attacker who forces new
 * instances. It stays because it still stops casual retry loops and single-
 * instance floods without a network round trip; the authoritative check is
 * the durable Convex limiter consulted right after it.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

/** Namespaces this endpoint's buckets in the shared `rateLimits` table. */
const DURABLE_KEY_PREFIX = "instructorApplicationNotify:";

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many applications. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))),
      },
    },
  );
}

/**
 * Same-origin check.
 *
 * This endpoint is unauthenticated (the instructor application form is public),
 * so without this any third-party page can drive a visitor's browser to POST
 * here and turn the SMTP relay into a spam amplifier aimed at the admin inbox.
 * Sec-Fetch-Site is checked first because it cannot be spoofed by a normal
 * cross-origin request; Origin is the fallback for older clients.
 */
function isSameOrigin(request: Request): boolean {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) return false; // fail closed

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const origin = request.headers.get("origin");
  return origin ? origin === site.replace(/\/+$/, "") : false;
}

export async function POST(request: Request) {
  const destinationEmail = process.env.INSTRUCTOR_APPLICATION_EMAIL;

  if (!destinationEmail) {
    return NextResponse.json(
      { error: "INSTRUCTOR_APPLICATION_EMAIL is not set." },
      { status: 500 }
    );
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Forbidden." },
      { status: 403 }
    );
  }

  // Header *order* here is a security decision, not a preference list: this
  // address keys both limiters below (the in-memory map and the durable
  // Convex bucket), so whoever picks it picks the quota.
  //
  // `x-real-ip` first because the platform overwrites it — on Vercel its
  // value cannot have come from the request. `cf-connecting-ip` used to be
  // checked first, but it is only authoritative when the request really did
  // come through Cloudflare; against a direct Vercel target a client can send
  // it verbatim and get a fresh limiter identity per request, which turns
  // "5 an hour" into "unlimited" (and the admin inbox into a firehose).
  //
  // `x-forwarded-for` next for the same reason (Vercel overwrites it, client
  // IP first). `cf-connecting-ip` stays last so a Cloudflare-fronted deploy
  // still has a trustworthy key — it just must never outrank a platform-set
  // header. `||` rather than `??` so an empty header value falls through
  // instead of becoming the key.
  const ip =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown";

  if (rateLimited(ip)) {
    return tooManyRequests(WINDOW_MS / 1000);
  }

  // Durable limiter — the authoritative check. The in-memory map above resets
  // on every cold start, so the Convex-backed counter (a row in `rateLimits`,
  // bumped inside a serializable mutation) is what holds the 5/hour
  // quota across instances.
  //
  // Fail closed: if the limiter cannot be consulted (missing env, Convex
  // unreachable) we return 503 rather than falling back to the per-instance
  // map — otherwise overloading the limiter would downgrade it back to
  // the bypassable one. 503 means "endpoint temporarily unavailable", not
  // "unlimited".
  let durable: { allowed: boolean; retryAfterMs: number };
  try {
    durable = await consumeDurableRateLimit(
      DURABLE_KEY_PREFIX + ip,
      MAX_PER_WINDOW,
      WINDOW_MS,
    );
  } catch (error) {
    console.error("Durable rate limiter unavailable for notify route:", error);
    return NextResponse.json(
      {
        error:
          "Rate limiting is temporarily unavailable. Please try again shortly.",
      },
      { status: 503 },
    );
  }

  if (!durable.allowed) {
    return tooManyRequests(durable.retryAfterMs / 1000);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const parsed = instructorApplicationSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.message || "Invalid request body.";
    if (message.includes("exceeds the maximum length")) {
      return NextResponse.json({ error: message }, { status: 413 });
    }
    if (message === "Missing required fields.") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (message === "Portfolio must be a valid URL." || message === "Portfolio must be an http(s) URL.") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const application: InstructorApplicationPayload = {
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    expertise: parsed.data.expertise,
    bio: parsed.data.bio,
    motivation: parsed.data.motivation,
    portfolioUrl:
      parsed.data.portfolioUrl && parsed.data.portfolioUrl.trim()
        ? parsed.data.portfolioUrl.trim()
        : undefined,
  };

  // Format, not just presence: this address becomes the `replyTo` of the
  // admin notification, so it must be an address — no CR/LF, within the RFC
  // limits, shaped like one (M-9).
  const email = normalizeEmailAddress(application.email);
  if (!email) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Please use a permanent email address." },
      { status: 400 }
    );
  }
  application.email = email;

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Email delivery is not configured." },
      { status: 500 }
    );
  }

  const fields: Array<[string, string]> = [
    ["Full Name", application.fullName],
    ["Email", application.email],
    ["Expertise", application.expertise],
    ["Bio", application.bio],
    ["Portfolio / Website", application.portfolioUrl ?? "Not provided"],
    ["Motivation", application.motivation],
  ];

  const bodyHtml =
    emailParagraph(
      `${escapeHtml(application.fullName)} applied to teach on Glypha Learn. ` +
        "Reply straight to this email to answer them.",
    ) + emailKeyValueRows(fields);

  try {
    await sendMail({
      group: "instructors",
      to: destinationEmail,
      // Replies go to the applicant, so an admin can answer from their inbox
      // without opening the review queue.
      replyTo: application.email,
      subject: `Instructor application: ${application.fullName}`,
      text: [
        `New instructor application from ${application.fullName}.`,
        "",
        ...fields.map(([label, value]) => `${label}: ${value}`),
        "",
        `Reply to this email to reach ${application.email}.`,
      ].join("\n"),
      html: emailLayout({
        preheader: `${application.fullName} wants to teach on Glypha Learn`,
        eyebrow: "Instructor application",
        heading: `${application.fullName} applied to teach`,
        body: bodyHtml,
        footnote: `Sent to the review inbox. The applicant's address is set as the reply-to.`,
      }),
    });
  } catch (error) {
    console.error(
      "Failed to send instructor application notification:",
      error
    );
    return NextResponse.json(
      { error: "Failed to send notification email." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}