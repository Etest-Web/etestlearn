import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guards for the hardening on the Publit.io upload-url route (M-5): a durable
 * per-user rate limit that fails closed, a per-lesson authorization check, and
 * a 500 body that no longer echoes whatever the signing helper threw.
 *
 * Every dependency is mocked — Clerk, Convex, the signing helper and the
 * limiter — so the test asserts what the *route* decides rather than what the
 * network does.
 */

// ── Clerk ────────────────────────────────────────────────────────────────────
const authState = { userId: "user_abc" as string | null };
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: authState.userId,
    getToken: async () => "convex_jwt",
  }),
}));

// ── Convex ───────────────────────────────────────────────────────────────────
const convexState = {
  role: "instructor" as string,
  canUpload: true as boolean,
  queryCalls: [] as string[],
};
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    async query(ref: unknown, args: unknown) {
      const name = String(ref);
      convexState.queryCalls.push(name);
      if (name.includes("getCurrentUser")) {
        return { role: convexState.role };
      }
      if (name.includes("canUploadToLesson")) {
        return convexState.canUpload;
      }
      throw new Error(`unexpected query: ${name}`);
    }
  },
}));
vi.mock("@/convex/_generated/api", () => ({
  api: {
    users: { getCurrentUser: "users:getCurrentUser" },
    videoAssets: { canUploadToLesson: "videoAssets:canUploadToLesson" },
  },
}));

// ── Signing helper ───────────────────────────────────────────────────────────
const getPublitioUploadUrl = vi.fn();
vi.mock("@/lib/publitio", () => ({ getPublitioUploadUrl }));

// ── Durable rate limiter ─────────────────────────────────────────────────────
const consumeDurableRateLimit = vi.fn();
vi.mock("@/lib/durable-rate-limit", () => ({ consumeDurableRateLimit }));

const { POST } = await import("@/app/api/publitio/upload-url/route");

function bodyRequest(body: unknown) {
  return new Request("https://glypha.com.ng/api/publitio/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let savedEnv: NodeJS.ProcessEnv | null = null;

beforeEach(() => {
  savedEnv = { ...process.env };
  authState.userId = "user_abc";
  convexState.role = "instructor";
  convexState.canUpload = true;
  convexState.queryCalls = [];
  getPublitioUploadUrl.mockReset().mockReturnValue("https://media.publit.io/sign/ok");
  consumeDurableRateLimit.mockReset().mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  process.env.PUBLITIO_API_KEY = "pk_test";
  process.env.PUBLITIO_API_SECRET = "sk_test";
  // The route 401s without a deployment URL, same as it does in production.
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
});

afterEach(() => {
  // Env is read at call time by the route, so it can only be put back once the
  // request has finished — and it must be, or these values leak into whatever
  // file the worker runs next.
  if (savedEnv) process.env = savedEnv;
  savedEnv = null;
});

describe("publitio upload-url route", () => {
  it("refuses a caller with no session", async () => {
    authState.userId = null;
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(401);
    expect(consumeDurableRateLimit).not.toHaveBeenCalled();
  });

  it("refuses a non-staff session", async () => {
    convexState.role = "student";
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(403);
    expect(consumeDurableRateLimit).not.toHaveBeenCalled();
  });

  it("rate-limits by user and says so with a Retry-After", async () => {
    consumeDurableRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 1234 });
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("2");
    // Bucketed per user, namespaced so it cannot collide with another route's.
    expect(consumeDurableRateLimit).toHaveBeenCalledWith(
      "publitioUploadUrl:user_abc",
      20,
      60 * 60 * 1000,
    );
    // Refused before the authorization query — a caller out of quota buys
    // nothing, not even a database read.
    expect(convexState.queryCalls).not.toContain("videoAssets:canUploadToLesson");
  });

  it("fails closed when the limiter cannot answer", async () => {
    consumeDurableRateLimit.mockRejectedValue(new Error("convex unreachable"));
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(503);
    expect(getPublitioUploadUrl).not.toHaveBeenCalled();
  });

  it("requires a lesson id", async () => {
    const res = await POST(bodyRequest({}));
    expect(res.status).toBe(400);
    expect(getPublitioUploadUrl).not.toHaveBeenCalled();
  });

  it("does not sign for a lesson the caller cannot manage", async () => {
    convexState.canUpload = false;
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(403);
    expect(getPublitioUploadUrl).not.toHaveBeenCalled();
  });

  it("signs for a lesson the caller can manage", async () => {
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ uploadUrl: "https://media.publit.io/sign/ok" });
    expect(convexState.queryCalls).toContain("videoAssets:canUploadToLesson");
  });

  it("returns a generic 500 when signing fails, without the underlying message", async () => {
    getPublitioUploadUrl.mockImplementation(() => {
      throw new Error("HMAC failed for key pk_test at step 4");
    });
    const res = await POST(bodyRequest({ lessonId: "lesson1" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/pk_test|HMAC|step 4/);
    expect(text).toMatch(/try again/i);
  });
});
