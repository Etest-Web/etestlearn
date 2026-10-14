import { NextResponse } from "next/server";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import {
  emailKeyValueRows,
  emailLayout,
  emailParagraph,
} from "@/lib/emails/layout";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";

type InstructorApplicationPayload = {
  fullName: string;
  email: string;
  expertise: string;
  bio: string;
  portfolioUrl?: string;
  motivation: string;
};

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

  // Keyed on the first address in X-Forwarded-For so a single user cannot
  // trivially rotate identities behind the limiter.
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (rateLimited(ip)) {
    return tooManyRequests(WINDOW_MS / 1000);
  }

  // Durable limiter — the authoritative check. The in-memory map above resets
  // on every cold start, so the Convex-backed counter (a row in `rateLimits`,
  // bumped inside a serializable mutation) is what actually holds the 5/hour
  // quota across instances.
  //
  // Fail closed: if the limiter cannot be consulted (missing env, Convex
  // unreachable) we return 503 rather than falling back to the per-instance
  // map — otherwise simply overloading the limiter would downgrade it back to
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

  const data = (body ?? {}) as Record<string, unknown>;
  const application: InstructorApplicationPayload = {
    fullName:
      typeof data.fullName === "string" ? data.fullName.trim() : "",
    email: typeof data.email === "string" ? data.email.trim() : "",
    expertise:
      typeof data.expertise === "string" ? data.expertise.trim() : "",
    bio: typeof data.bio === "string" ? data.bio.trim() : "",
    portfolioUrl:
      typeof data.portfolioUrl === "string" && data.portfolioUrl.trim()
        ? data.portfolioUrl.trim()
        : undefined,
    motivation:
      typeof data.motivation === "string" ? data.motivation.trim() : "",
  };

  if (
    !application.fullName ||
    !application.email ||
    !application.expertise ||
    !application.bio ||
    !application.motivation
  ) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  // Cap each field so one submission cannot be used to ship an arbitrarily
  // large message, and so the admin inbox cannot be flooded with megabytes.
  const LIMITS: Array<[keyof InstructorApplicationPayload, number]> = [
    ["fullName", 200],
    ["email", 320],
    ["expertise", 300],
    ["bio", 5000],
    ["motivation", 5000],
    ["portfolioUrl", 2048],
  ];

  for (const [field, max] of LIMITS) {
    const value = application[field];
    if (typeof value === "string" && value.length > max) {
      return NextResponse.json(
        { error: `${field} exceeds the maximum length of ${max} characters.` },
        { status: 413 }
      );
    }
  }

  // If a URL was supplied it must actually be http(s) — otherwise it is either
  // a javascript:/data: payload aimed at whoever clicks it in the admin
  // review queue, or simply malformed.
  if (application.portfolioUrl) {
    try {
      const { protocol } = new URL(application.portfolioUrl);
      if (protocol !== "http:" && protocol !== "https:") {
        return NextResponse.json(
          { error: "Portfolio must be an http(s) URL." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Portfolio must be a valid URL." },
        { status: 400 }
      );
    }
  }

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