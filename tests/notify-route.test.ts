import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards for the hardening added to the instructor-application notify route:
 * origin enforcement, field length caps, portfolio URL scheme validation, and
 * the durable (Convex-backed) rate limiter layered over the in-memory one.
 *
 * The route reads env at call time, so each test sets what it needs and
 * restores afterwards rather than relying on module-load-time capture.
 */

const sendMail = vi.fn();
vi.mock("@/lib/mail", () => ({
  sendMail,
  isSmtpConfigured: () => true,
  escapeHtml: (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));

// The durable limiter lives in its own module precisely so tests can replace
// it wholesale: no Convex deployment, no network. Default = allowed, so the
// pre-existing tests keep exercising their own paths unchanged.
const consumeDurableRateLimit = vi.fn();
vi.mock("@/lib/durable-rate-limit", () => ({ consumeDurableRateLimit }));

const { POST } = await import("@/app/api/instructor-applications/notify/route");

beforeEach(() => {
  sendMail.mockReset();
  consumeDurableRateLimit.mockReset();
  consumeDurableRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
});

const BASE_ENV = {
  INSTRUCTOR_APPLICATION_EMAIL: "admin@example.com",
  NEXT_PUBLIC_SITE_URL: "https://glypha.com.ng",
};

const VALID_BODY = {
  fullName: "Ada Okafor",
  email: "ada@example.com",
  expertise: "Graphic design",
  bio: "Ten years of practice.",
  motivation: "I want to teach.",
};

/** A request that looks like it came from our own site. */
function sameOriginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://glypha.com.ng/api/instructor-applications/notify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      origin: "https://glypha.com.ng",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** Each test needs a fresh limiter window, so vary the client IP. */
let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

/**
 * Sets env for the duration of `fn`, including when `fn` is async. A plain
 * sync try/finally would restore process.env before awaited work resumed,
 * which made the route see INSTRUCTOR_APPLICATION_EMAIL as unset (500).
 */
async function withEnv<T>(fn: () => T | Promise<T>): Promise<T> {
  const saved = { ...process.env };
  Object.assign(process.env, BASE_ENV);
  try {
    return await fn();
  } finally {
    process.env = saved;
  }
}

describe("notify route — origin enforcement", () => {
  it("rejects a cross-site submission", async () => {
    const res = await withEnv(() =>
      POST(
        new Request(
          "https://glypha.com.ng/api/instructor-applications/notify",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "sec-fetch-site": "cross-site",
              origin: "https://evil.example",
            },
            body: JSON.stringify(VALID_BODY),
          },
        ),
      ),
    );

    expect(res.status).toBe(403);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects when Sec-Fetch-Site is missing and Origin disagrees", async () => {
    const res = await withEnv(() =>
      POST(
        new Request("https://glypha.com.ng/api/instructor-applications/notify", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.example",
          },
          body: JSON.stringify(VALID_BODY),
        }),
      ),
    );

    expect(res.status).toBe(403);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("fails closed when NEXT_PUBLIC_SITE_URL is unset", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, BASE_ENV);
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const res = await POST(sameOriginRequest(VALID_BODY));
      expect(res.status).toBe(403);
    } finally {
      process.env = saved;
    }
  });
});

describe("notify route — input limits", () => {
  it("rejects an oversized bio", async () => {
    const res = await withEnv(() =>
      POST(
        sameOriginRequest(
          { ...VALID_BODY, bio: "x".repeat(5001) },
          { "x-forwarded-for": freshIp() },
        ),
      ),
    );

    expect(res.status).toBe(413);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a javascript: portfolio URL", async () => {
    const res = await withEnv(() =>
      POST(
        sameOriginRequest(
          { ...VALID_BODY, portfolioUrl: "javascript:alert(1)" },
          { "x-forwarded-for": freshIp() },
        ),
      ),
    );

    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a malformed portfolio URL", async () => {
    const res = await withEnv(() =>
      POST(
        sameOriginRequest(
          { ...VALID_BODY, portfolioUrl: "not a url" },
          { "x-forwarded-for": freshIp() },
        ),
      ),
    );

    expect(res.status).toBe(400);
  });

  it("accepts a valid https portfolio and sends the mail", async () => {
    sendMail.mockResolvedValueOnce(undefined);
    const res = await withEnv(() =>
      POST(
        sameOriginRequest(
          { ...VALID_BODY, portfolioUrl: "https://ada.example" },
          { "x-forwarded-for": freshIp() },
        ),
      ),
    );

    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("notify route — rate limiting", () => {
  it("returns 429 with Retry-After once the window is exhausted", async () => {
    sendMail.mockResolvedValue(undefined);
    const ip = freshIp();

    const statuses: number[] = [];
    let retryAfter: string | null = null;

    await withEnv(async () => {
      for (let i = 0; i < 6; i++) {
        const res = await POST(
          sameOriginRequest(VALID_BODY, { "x-forwarded-for": ip }),
        );
        statuses.push(res.status);
        if (res.status === 429) {
          retryAfter = res.headers.get("retry-after");
        }
      }
    });

    // The limiter counts every accepted attempt against the window, so the
    // first MAX_PER_WINDOW requests succeed and the next is refused.
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    expect(retryAfter).toBeTruthy();
  });
});

describe("notify route — durable rate limiting", () => {
  it("returns 429 from the durable limiter without sending the mail", async () => {
    // In-memory limiter still has budget for this IP (fresh key), so the 429
    // must come from the durable counter being exhausted.
    consumeDurableRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 3_600_000,
    });

    const res = await withEnv(() =>
      POST(
        sameOriginRequest(VALID_BODY, { "x-forwarded-for": freshIp() }),
      ),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("returns 503 when the durable limiter cannot be consulted", async () => {
    // Fail closed: an unreachable limiter (missing env, Convex down) must
    // disable the endpoint, never fall through to "allowed".
    consumeDurableRateLimit.mockRejectedValue(
      new Error("Durable rate limiter is not configured."),
    );

    const res = await withEnv(() =>
      POST(
        sameOriginRequest(VALID_BODY, { "x-forwarded-for": freshIp() }),
      ),
    );

    expect(res.status).toBe(503);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("consults the durable limiter with the IP key and the 5/hour window", async () => {
    const ip = freshIp();

    const res = await withEnv(() =>
      POST(sameOriginRequest(VALID_BODY, { "x-forwarded-for": ip })),
    );

    expect(res.status).toBe(200);
    expect(consumeDurableRateLimit).toHaveBeenCalledTimes(1);
    expect(consumeDurableRateLimit).toHaveBeenCalledWith(
      `instructorApplicationNotify:${ip}`,
      5,
      60 * 60 * 1000,
    );
  });
});