import { NextResponse } from "next/server";
import { escapeHtml, isSmtpConfigured, sendMail } from "@/lib/mail";

type InstructorApplicationPayload = {
  fullName: string;
  email: string;
  expertise: string;
  bio: string;
  portfolioUrl?: string;
  motivation: string;
};

/**
 * Fixed-window rate limiter.
 *
 * In-memory and therefore per-instance: on serverless each cold start gets a
 * fresh map, so this is a floor that stops casual abuse and accidental client
 * retry loops, not a hard guarantee. A durable store (Upstash/Convex) is the
 * real answer if this endpoint ever carries a quota you care about.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
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
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many applications. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(WINDOW_MS / 1000)) },
      }
    );
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

  if (!isSmtpConfigured()) {
    return NextResponse.json(
      { error: "SMTP settings are not configured." },
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

  const tableRows = fields
    .map(
      ([label, value]) =>
        `<tr>` +
        `<td style="padding:8px 12px;border:1px solid #E8E3E9;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 12px;border:1px solid #E8E3E9;">${escapeHtml(value)}</td>` +
        `</tr>`
    )
    .join("");

  try {
    await sendMail({
      to: destinationEmail,
      replyTo: application.email,
      subject: `New Instructor Application — ${application.fullName}`,
      text: fields
        .map(([label, value]) => `${label}: ${value}`)
        .join("\n"),
      html:
        `<p>A new instructor application was submitted on Glypha Learn:</p>` +
        `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">${tableRows}</table>`,
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