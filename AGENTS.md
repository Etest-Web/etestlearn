# AGENTS.md

Guidance for AI coding agents (and new contributors) working in this repository.

**Project:** `etestlearn` — "Glypha Learn", an LMS (course catalog, enrollments, lessons, quizzes,
certificates with PDF/email/public verification, Paystack payments, instructor & admin dashboards).

---

## 1. Stack at a glance

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.1.6** (App Router) + **React 19.2.3** | `next build`, `next dev` |
| Backend | **Convex** (`convex ^1.45.0`) | All domain logic lives in `convex/` |
| Auth | **Clerk** (`@clerk/nextjs ^7.0.4`) | Route protection in root `proxy.ts` |
| Styling | **Tailwind CSS v4** (CSS-first config) | No `tailwind.config.*`; see `app/globals.css` |
| UI kit | shadcn-style components on **Base UI** (`style: base-vega`) | NOT Radix. Primitives in `components/ui/` |
| Language | TypeScript 5, `strict: true` | Path alias `@/*` → project root |
| Tests | **Vitest 4** + `convex-test` | Node environment only, no DOM/component tests |
| Package manager | **pnpm 10** | CI pins Node 22 |
| Other | `pdf-lib` (certificates), `nodemailer` (email), `svix` (Clerk webhooks), `recharts`, `gsap`, `sonner` | |

### Key commands

```bash
pnpm install            # install deps
pnpm dev                # runs `next dev` AND `convex dev` concurrently
pnpm dev:next           # Next.js only
pnpm dev:convex         # Convex function deployment/watch only
pnpm build              # production build
pnpm test               # vitest run (all tests, once)
pnpm test:watch         # vitest watch mode
pnpm lint               # eslint (flat config)
pnpm exec tsc --noEmit  # typecheck (what CI gates on — no `typecheck` script exists)
```

---

## 2. Repository layout

```
app/                 Next.js App Router (route groups: (public), (auth))
  (public)/          landing page at /
  (auth)/            Clerk catch-all sign-in / sign-up
  dashboard/         student, instructor, admin dashboards (mostly "use client")
  api/               exactly ONE Next route handler: instructor-applications/notify
  sitemap.ts robots.ts error.tsx not-found.tsx layout.tsx
components/
  ui/                shadcn/Base UI primitives + barrel `index.ts` → import { Button } from "@/components/ui"
  marketing/         landing-page sections
  *.tsx              shared components (navbar, guards, providers…) — kebab-case
convex/              backend: one module per domain + http.ts + schema.ts + helpers/
  _generated/        codegen output — NEVER hand-edit (refresh with `npx convex dev`)
  helpers/           auth.ts, completion.ts, audit.ts, rateLimit.ts (server-side shared code)
hooks/               use-mobile.ts
lib/                 shared helpers usable by BOTH Next and Convex (certificates, quiz, progress, mail, slug, site, utils, durable-rate-limit, csp)
tests/               integration tests (convex-test + route-handler tests)
docs/                CERTIFICATES.md — the one real technical doc
public/              static assets
proxy.ts             Next 16 middleware (route protection) — see gotchas
```

`convex/` imports from `lib/` via relative paths (`../../lib/...`); app code imports via `@/lib/...`.

---

## 3. Architecture rules (read before changing anything)

1. **All domain logic belongs in `convex/`.** Next route handlers are the exception and exist only
   when you need Node-side SMTP/nodemailer or in-memory state (currently just
   `app/api/instructor-applications/notify/route.ts`).
2. **Server-side authorization is mandatory.** Client role checks (`useQuery(api.users.getCurrentUser)`,
   `components/instructor-guard.tsx`, `app/dashboard/layout.tsx`) are UX only. Every Convex function
   must re-check identity/role via `convex/helpers/auth.ts`
   (`getCurrentUser` / `requireUser` / `isStaff` / `canManageCourse`).
3. **Convex function conventions**
   - Public: `export const name = query | mutation | action` in `convex/<module>.ts`.
   - Internal: `internalQuery/internalMutation/internalAction`, called as `internal.<module>.<name>`.
   - Validate every argument with `v.*` validators.
   - Read through indexes (`withIndex(...)`); the schema defines ~32 indexes (`by_clerk_id`,
     `by_slug`, `by_user_course`, `by_serial`, `by_key`, …). Add an index in `convex/schema.ts` if
     you need a new lookup path.
   - HTTP endpoints live in `convex/http.ts` (`httpRouter()` + `httpAction`):
     `POST /webhook/paystack` (HMAC-SHA512 signature), `POST /webhook/clerk` (svix verification).
   - Modules marked `"use node"` may export **only actions**: `convex/paystack.ts`,
     `convex/certificateArtifacts.ts`, `convex/certificateTemplateActions.ts`. Actions have no
     `ctx.db`, so admin checks go through an `internalQuery` (see
     `certificateTemplates.getCallerRole`). Keep node-only actions and DB queries/mutations in
     separate files.
4. **User provisioning source of truth** is the Clerk webhook in `convex/http.ts`
   (`internal.users.upsertFromClerk` / `deleteFromClerk`); `users.ensureCurrentUser` and
   `users.syncFromClerk` are fallbacks. Roles: `"student" | "instructor" | "admin"`.
5. **Public mutations called from Next server code** (`users.syncFromClerk`, `rateLimit.consume`)
   cannot rely on Clerk JWTs — they guard themselves with a shared secret read *inside* the
   handler, compared in constant time, **failing closed** when the env var is unset. Preserve this
   pattern for any new public function.
6. **Rate limiting / auditing (wired)**
   - `convex/helpers/rateLimit.ts` → `consumeRateLimit` / `requireRateLimit` (fixed-window,
     `rateLimits` table, mutation ctx only).
   - `convex/rateLimit.ts` → public `consume` mutation for Next server code
     (bounded `max`/`windowMs`, `NOTIFY_RATE_LIMIT_TOKEN` guarded).
   - `lib/durable-rate-limit.ts` → `consumeDurableRateLimit()` client; throws
     `DurableRateLimitUnavailableError` → route returns **503 (fail closed)**.
   - `convex/helpers/audit.ts` → `logAudit(...)` appends to `auditLogs`.
   - `requireRateLimit` call sites: `quizzes.submitQuizAttempt` (10/min per user, alongside the
     existing 30s per-quiz cooldown), `discussions.postMessage` (10/min per user, alongside the
     10s per-thread cooldown), `discussions.createThread` (5/hour per user).
   - `logAudit` call sites — privileged actions only; learner self-service issuance and webhook
     syncs are deliberately unlogged because `auditLogs.actorId` is required: `users.setUserRole`,
     `instructorApplications.reviewApplication`, `certificates.revokeCertificate` /
     `reinstateCertificate` / `issueCertificateForLearner` (the override path), and all five
     `certificateTemplates` admin mutations.
   - Read back via `auditLogs.listAuditLogs` (admin-only query).
7. **Certificates:** single completion rule in `lib/certificates.ts`
   (`evaluateCertificateCompletion`), consumed by `convex/certificates.ts`
   (`issueForUser`, `getCourseCertificateStatus`) and `lib/certificates.test.ts`.
   `internal.certificates.issueIfEligible` is scheduled (idempotent) from
   `enrollments.completeLesson` and `quizzes.submitQuizAttempt`. Read `docs/CERTIFICATES.md`
   before touching this subsystem.
8. **CSP is per-request; the rest of the security headers are static.** `lib/csp.ts` builds the
   Content-Security-Policy from a fresh nonce per request and `proxy.ts` writes it to both the
   response header (what the browser enforces) and the request header `X-Nonce` (what Next.js and
   Clerk read back to stamp `nonce` onto the scripts they render). It cannot live in
   `next.config.ts` because `headers()` is evaluated once at boot and cannot carry a nonce.
   `next.config.ts` holds only the invariant headers (HSTS, COOP, X-Frame-Options,
   Permissions-Policy, …). Adding a new external origin (script, font, image, connect target)
   **requires editing the allow-list in `lib/csp.ts`** or the browser will block it.
   `script-src` deliberately has no `'unsafe-inline'` — adding one silently defeats the nonce.
   `tests/csp.test.ts` asserts the directives; do not change the policy by eye.
   Three consequences worth knowing before touching this:
   - `app/layout.tsx` reads `X-Nonce` and passes it to `<ThemeProvider nonce>`, because
     next-themes' inline theme script is the one tag Next.js cannot nonce itself. That
     `headers()` call is also what keeps the routes per-request — a prerendered page would bake in
     a build-time nonce that matches no response's CSP. Expect `ƒ` in the build table.
   - Clerk's `<script src="https://clerk.glypha.com.ng/…/clerk.browser.js">` ships **without** a
     nonce (it is rendered by Clerk's client `ClerkScripts`, which reads `nonce` from
     `ClerkProvider` props; that prop is not in Clerk's public types). The host allow-list is what
     lets it load.
   - That is why `'strict-dynamic'` is absent: it would make CSP3 browsers ignore `'self'` and
     that host entry, blocking clerk-js and taking sign-in down. Verify with
     `curl -s -D- -o/dev/null <url>` plus a scan of the rendered HTML before considering it.

---

## 4. Testing

- Config: `vitest.config.ts` — `environment: "node"`, `testTimeout: 30000`, alias `@` → root.
- **Include globs are narrow:** only `lib/**/*.test.ts` and `tests/**/*.test.ts` run. Co-located
  tests anywhere else are silently ignored. There are no `*.tsx` / component / e2e tests.
- Convex integration pattern (`tests/convex.security.test.ts` and friends):

  ```ts
  const modules = import.meta.glob("../convex/**/*.ts");
  const testSchema = schema as unknown as SchemaDefinition<GenericSchema, boolean>;
  const t = convexTest(testSchema, modules);

  t.withIdentity({ subject, tokenIdentifier: subject }); // impersonate
  t.run(async (ctx) => ctx.db.insert("users", { ... })); // seed
  t.mutation(api.users.someFn, { ... });                  // call
  ```

- Route-handler tests import the handler directly and `vi.mock` its deps
  (see `tests/notify-route.test.ts` mocking `@/lib/mail`, `@/lib/durable-rate-limit`).
- `tests/vite-env.d.ts` declares `import.meta.glob` for the node env.
- Run everything with `pnpm test` before considering a change done.

---

## 5. CI (`.github/workflows/ci.yml`)

Runs on push to **`master`** and on all PRs: install → **lint (non-blocking)** → **typecheck
(hard gate)** → **tests (hard gate)** → **build (hard gate)**.

- Lint is intentionally `pnpm exec eslint . || true` — pre-existing lint debt is tracked
  separately. Don't treat existing `no-explicit-any` warnings as regressions, and don't "fix" the
  CI step without being asked.
- CI injects placeholder `NEXT_PUBLIC_*` values so `next build` can prerender.
- There is no `typecheck` script; CI calls `pnpm exec tsc --noEmit` directly.

---

## 6. Environment variables (names only)

Set Next-side vars in `.env` / `.env.local` (gitignored). Set Convex-side vars with
`npx convex env set <NAME> <value>`.

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `components/convex-client-provider.tsx` (throws if missing), `app/sitemap.ts`, `app/courses/[slug]/layout.tsx`, `lib/durable-rate-limit.ts` |
| `NEXT_PUBLIC_SITE_URL` | `lib/site.ts`, `lib/mail.ts`, notify route origin check (fail-closed) |
| `NEXT_PUBLIC_APP_URL` | `convex/paystack.ts` Paystack callback URL (throws if missing) |
| `NEXT_PUBLIC_CLERK_*` | Clerk runtime (sign-in/up URLs, publishable key, redirects) |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | CI placeholder / Paystack client flow |
| `CLERK_JWT_ISSUER_DOMAIN` | `convex/auth.config.ts` (Convex ↔ Clerk trust) |
| `CLERK_SECRET_KEY`, `CLERK_FRONTEND_API_URL` | Clerk server SDK |
| `CLERK_WEBHOOK_SECRET` | `convex/http.ts` svix verification |
| `CLERK_SYNC_TOKEN` | `convex/users.ts` `syncFromClerk` (fail-closed) |
| `NOTIFY_RATE_LIMIT_TOKEN` | `convex/rateLimit.ts`, `lib/durable-rate-limit.ts` |
| `PAYSTACK_SECRET_KEY` | `convex/http.ts` (webhook HMAC), `convex/paystack.ts` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | `lib/mail.ts` |
| `INSTRUCTOR_APPLICATION_EMAIL` | notify route |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_SITE_URL` | `convex dev` CLI / Convex site URL |

**Never print, echo, or commit values from `.env` / `.env.local` — they contain live-looking
`pk_live_`/`sk_live_` keys.** Both files are gitignored (so is `/.clerk/`).

Missing-from-env-but-required-by-code checklist: `PAYSTACK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`,
`CLERK_SYNC_TOKEN`, `NOTIFY_RATE_LIMIT_TOKEN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`.

---

## 7. Gotchas & do-not-touch

- **`proxy.ts` at the repo root is the Next 16 middleware** (Next renamed `middleware.ts` →
  `proxy.ts`). There is **no** `middleware.ts` — do not "fix" this by adding one; you'd run two
  handlers. Public routes: `/sign-in`, `/sign-up`, `/`, `/courses(.*)`, `/verify(.*)` and the one
  API route `/api/instructor-applications/notify`; everything else hits `auth.protect()`. The
  matcher also covers `/(api|trpc)(.*)`, so any unlisted `/api` route needs a session too. The
  notify route is public because signed-out applicants post to it; it defends itself (same-origin
  check, IP rate limits, field caps) — public ≠ undefended. `proxy.ts` is also where the
  per-request CSP is attached; see rule 8.
- **Never hand-edit `convex/_generated/*`.** If types are stale (e.g. a new module like
  `rateLimit` missing from `api.d.ts`), run `npx convex dev` to regenerate. Until then the code
  uses `makeFunctionReference<"mutation">("rateLimit:consume")` in `lib/durable-rate-limit.ts`
  instead of `api.rateLimit.consume`.
- **`.gitignore` contains `*.md`** (plus `implementation_plan.md`, `build.log`, `build_out.txt`).
  Markdown files — including this one — are ignored by git; add with `git add -f`, or narrow the
  ignore rule (an `!AGENTS.md` exception is present) if you need them tracked. Verify with
  `git check-ignore -v AGENTS.md` before assuming a doc is committed.
- **Do not commit build artifacts:** `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`,
  `build.log`, `build_out.txt`, `node_modules/`, `.convex/local/**`, `/coverage`.
- **Tailwind v4 is CSS-first:** theme tokens are defined in `app/globals.css` via `@theme inline`.
  No `tailwind.config.*` exists — don't create one.
- **UI primitives are Base UI, not Radix.** `npx shadcn add <x>` targets `@/components/ui` and
  `app/globals.css` (see `components.json`, style `base-vega`, extra `@react-bits` registry).
- **Payments:** prices are stored in **kobo** (`courses.price`, integer) with `currency`.
  Paystack webhook is idempotent (`internal.payments.markPurchasePaid`).
- **Video lessons are URL-based** (YouTube/Vimeo/MP4) — direct video upload is intentionally
  unsupported.
- **Lesson authoring uses Markdown** (`react-markdown` + `remark-gfm`), not a rich-text editor.
- Naming: components kebab-case (`video-player.tsx`); Convex modules camelCase domain names
  (`certificateTemplates.ts`); internal functions camelCase verbs (`issueIfEligible`,
  `markPurchasePaid`).
- Prefer changing existing docs over creating new Markdown files (because of the `*.md` ignore).

---

## 8. Existing docs (read these for depth)

- `docs/CERTIFICATES.md` — authoritative doc on issuance, templates, artifacts, verification.
- `COMPLETION_PLAN.md` — roadmap status: phases 0–5 done, phase 6 (testing) mostly done
  (Playwright E2E deferred), phase 7 (production launch: Vercel + Convex prod + live keys) pending.
- `implementation_plan.md`, `lms-platform-nextjs-plan_2d6de771.plan.md` — historical planning
  artifacts (they reference `middleware.ts`, which is now `proxy.ts`).
- `README.md` — untouched `create-next-app` boilerplate; ignore for project guidance.

---

## 9. Definition of done

A change is complete when all of the following pass locally:

```bash
pnpm exec tsc --noEmit   # typecheck
pnpm test                # vitest
pnpm build               # next build
pnpm exec eslint .       # informational — pre-existing debt is expected
```

Plus: every new Convex function validates args, re-checks auth server-side, and uses indexes for
reads; new external origins are added to the CSP in `next.config.ts`.
