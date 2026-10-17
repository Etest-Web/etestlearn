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
| Other | `pdf-lib` (certificates), `resend` (email), `nodemailer` (email fallback), `svix` (Clerk webhooks), `recharts`, `gsap`, `sonner` | |

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
  helpers/           auth.ts, completion.ts, audit.ts, rateLimit.ts, certificateTemplate.ts (server-side shared code)
hooks/               use-mobile.ts
lib/                 shared helpers usable by BOTH Next and Convex (certificates, certificate-layout, quiz, progress, mail, slug, site, utils, durable-rate-limit, csp)
tests/               integration tests (convex-test + route-handler tests)
docs/                CERTIFICATES.md — the one real technical doc
public/              static assets
proxy.ts             Next 16 middleware (route protection) — see gotchas
```

`convex/` imports from `lib/` via relative paths (`../../lib/...`); app code imports via `@/lib/...`.

---

## 3. Architecture rules (read before changing anything)

1. **All domain logic belongs in `convex/`.** Next route handlers are the exception and exist only
   when you need a Node runtime for third-party SDKs or in-memory state (currently just
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
     `reinstateCertificate` / `issueCertificateForLearner` (the override path), the three
     `certificateTemplates` admin mutations (`saveTemplate`, `updateTemplateLayout`,
     `deleteTemplate`), `courses.unpublishCourse` (only when the course is
     paid *and* sold — unpublishing a free course is ordinary self-service and logging every draft
     toggle would bury the rows that matter), and `courses.reviewUnpublishRequest`.
   - Read back via `auditLogs.listAuditLogs` (admin-only query).
7. **Certificates:** single completion rule in `lib/certificates.ts`
   (`evaluateCertificateCompletion`), consumed by `convex/certificates.ts`
   (`issueForUser`, `getCourseCertificateStatus`) and `lib/certificates.test.ts`.
   `internal.certificates.issueIfEligible` is scheduled (idempotent) from
   `enrollments.completeLesson` and `quizzes.submitQuizAttempt`. Read `docs/CERTIFICATES.md`
   before touching this subsystem.
   **There is exactly one certificate template**, not a collection: the admin
   uploads a background PDF and it becomes the design for every new certificate.
   So there is no gallery, no activate/deactivate, and no separate admin page —
   `saveTemplate` patches the one row in place (keeping its id stable, because
   certificates snapshot it at issuance), and the editor is the "Certificate
   design" card on `/dashboard/admin/certificates`. Field positions are fractions
   of the page and live with both default sets in `lib/certificate-layout.ts`,
   which has no pdf-lib import so the renderer and the admin editor read the same
   numbers. Every reader of the installed row goes through `getInstalledTemplate`
   in `convex/helpers/certificateTemplate.ts`.
   **Placement is edited on a canvas, not in coordinate boxes.**
   `components/certificate-canvas.tsx` draws the real background (pdf.js
   rasterises page 1 in the browser; `pdfjs-dist` is a client dependency, loaded
   through `import()` so it never runs during SSR) and the six fields sit on it
   as drag/resize objects. That only stays honest if both sides read one source,
   so `lib/certificate-layout.ts` also owns the typography the canvas paints
   with — font roles, colours, `wrapText`/`wrapCharBudget`, the truncation limit
   and `CANVAS_BASELINE_NUDGE` (the correction between pdf-lib's baseline and a
   CSS line box). Two things worth knowing before touching it:
   - The raw `x,y`/`off` syntax still exists — `parseAnchor`/`formatAnchor` and
     their tests — but it is now behind the "Paste coordinates" disclosure rather
     than being the primary control.
   - `updateTemplateLayout` **replaces** the layout, so the editor always saves
     all six fields resolved (including explicit `null`s). With no artwork
     uploaded there is no row to store against, so dragging works but Save is
     hidden; the preview action still renders what the built-in page would print.
   Convex storage is fetched cross-origin for the raster: `cors()` in
   `convex-backend`'s `local_backend/src/router.rs` mirrors the request origin on
   `/api/storage/{storage_id}`, so `fetch()` succeeds. If it ever fails the canvas
   falls back to the built-in artwork and says so rather than going blank.
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
9. **Publishing is an operation, not a field.** `courses.updateCourse` deliberately has **no**
   `published` argument; visibility goes through `courses.publishCourse` /
   `courses.unpublishCourse` / `courses.requestUnpublish`. Do not add the field back — it would
   hand every future caller a one-argument path around the unpublish gate.

   The rule itself is in `lib/publishing.ts` (`unpublishPolicy`), the same single-source shape as
   `lib/certificates.ts`. An instructor may always publish. Unpublishing is free when the course is
   free or paid-but-unsold; once a course has at least one **completed** (`paid`) purchase it needs
   admin approval, because pulling a paid listing is the scam (`purchases` has a
   `by_course_status` index for exactly this check; pending checkouts don't count because the
   webhook still grants the enrollment). Workflow: instructor submits →
   `courseUnpublishRequests` row (status `pending`, course stays live) → admin decides via
   `courses.reviewUnpublishRequest`, and only an approval writes `published: false`. An admin may
   also unpublish directly — pulling down a fraudulent course shouldn't wait on a queue — and
   republishing resolves any pending request. Buyers lose nothing either way: access is keyed on the
   enrollment, not on `published`. Queues are read at `app/dashboard/admin/unpublish-requests`.
10. **Maintenance mode is a gate in `proxy.ts`, not a page or a layout.** The switch lives in
    `convex/maintenance.ts` (singleton `maintenanceMode` row, lazily created, read through
    `by_updatedAt` — the `referralSettings` shape); the *policy* — the message, its 280-char ceiling
    and the route allow-list — is in `lib/maintenance.ts` and imported, never restated. Three things
    are load-bearing and easy to undo by accident:
    - **It runs before `auth.protect()`.** That ordering is the feature: after the redirect, a
      signed-out visitor hitting `/dashboard` never reaches the gate, so the notice would only ever
      be seen by people who have an account.
    - **It fails OPEN.** If the Convex read throws, the site renders normally. A Convex blip must not
      take the storefront offline — this is deliberately the opposite of the shared-secret and
      rate-limit helpers. The *staff* check fails **closed**, because failing open there would hand
      anonymous callers the whole site.
    - **Staff are exempt, and that is what makes the toggle usable.** `maintenance.isStaffCaller`
      resolves the `users` role from a Clerk session token (never a client-supplied id). Staff fall
      through to the normal `auth.protect()` path rather than returning early. Verified shape:
      503 + `Retry-After` for pages (a rewrite to `/maintenance`, which keeps the requested URL and
      keeps the CSP/nonce), a JSON 503 for `/api`, and `/become-instructor` plus
      `/api/instructor-applications/notify` left open so instructors can still apply. `/maintenance`
      must be in **both** `MAINTENANCE_ALLOWED_ROUTES` (else the rewrite loops) **and**
      `isPublicRoute` (else `auth.protect()` sends the outage page to sign-in). The toggle is at
      `/dashboard/admin/maintenance`; `proxy.ts` caches the flag for 5s per isolate, so flipping it
      is not instant.
    - **Maintenance lapses on its own.** `setMode` stamps `disableAt` on the rising edge
      (default 2h, clamped to 5min–24h by `resolveMaintenanceDeadline` in `lib/maintenance.ts`)
      and arms `internal.maintenance.releaseIfDue`, which flips the site back up and re-arms
      itself if the deadline has been extended. The deadline survives edits to the note and is
      cleared on the way back up. `releaseIfDue` is deliberately **not** audited — `auditLogs.actorId`
      is required and a scheduler is not a person; the window is reconstructable from `enabledAt`.
      It self-schedules via `makeFunctionReference("maintenance:releaseIfDue")` rather than
      `internal.maintenance.*`, because a self-reference to a newly added function resolves to
      `undefined` until codegen runs (same workaround as `lib/durable-rate-limit.ts`).
    - **Two backstops exist because the gate cannot heal itself from a lockout.** It fails open on
      a Convex blip, but a readable flag plus a broken staff exemption is the case it cannot
      recover from — the console that turns it off resolves its own permission through the same
      `users` lookup that has stopped working. So:
      - `MAINTENANCE_OVERRIDE=off` on the **Convex** deployment (not Next) force-releases the site
        at read time in `loadStatus`, with no rebuild and no session. `npx convex env set/unset`
        propagates in ~5s. One-directional and exact-match by design — it can only release, and
        `"Off"`/`"1"` do nothing — see `isMaintenanceOverridden` in `lib/maintenance.ts`.
      - `maintenance.preflight` reports why *this* caller would not get back in (no session, no
        `users` row, duplicate rows, suspended, wrong role), and the admin console holds the switch
        off until it reads true. It is deliberately **not** behind `requireAdmin`: an admin-gated
        query throws exactly when the identity is broken, which is the only case it exists for.
        It returns no id and no email, so it cannot be used to probe other accounts.
      Both surfaces are asserted in `tests/maintenance-gate.test.ts`; do not delete one to "simplify"
      the file.

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
| `PAYSTACK_SECRET_KEY` | `convex/http.ts` (webhook HMAC), `convex/paystack.ts`, `convex/bankVerification.ts` (payout account resolve) |
| `BANK_ENCRYPTION_KEY` | `convex/helpers/encryption.ts` — AES-256-GCM key for instructor payout account numbers. Convex-side only, fail-closed; generate 32 random bytes base64-encoded and never lose it (stored numbers become unreadable) |
| `SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_EMAIL` | `lib/support.ts` — the "contact support" address in payout emails, errors and the bank page. Default `noreply@glypha.com.ng`; the first name is read server-side (Convex), the `NEXT_PUBLIC_` one in the browser |
| `RESEND_API_KEY` / `RESEND_FROM` | `lib/mail.ts` — preferred mail provider. `RESEND_FROM` is the fallback From for any group left unset. Needs `npx convex env set` too: `convex/certificateArtifacts.ts` and `convex/emailCampaigns.ts` send from inside `"use node"` actions |
| `MAIL_FROM_ACCOUNT` / `_COURSES` / `_BILLING` / `_CERTIFICATES` / `_NOTIFICATIONS` / `_INSTRUCTORS` / `_UPDATES` | `lib/mail-senders.ts` — one From per email category. See `docs/email-senders.md` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | `lib/mail.ts` — fallback provider, used only when Resend is not fully configured |
| `INSTRUCTOR_APPLICATION_EMAIL` | notify route |
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_SITE_URL` | `convex dev` CLI / Convex site URL |
| `VIDEO_PLAYBACK_SECRET` | `lib/video-playback-token.ts` (token HMAC, fail-closed), `convex/http.ts` playback gate |
| `APP_ORIGIN` | `convex/http.ts` playback CORS allowlist (fail-closed) |
| `UPLOADTHING_TOKEN` | `app/api/uploadthing/*` (upload route), `convex/videoTranscode.ts` source cleanup (Convex-side env) |
| `MAINTENANCE_OVERRIDE` | `convex/maintenance.ts` — the maintenance kill-switch. Set to `off` **on the Convex deployment** to force the site back up regardless of the admin switch. Optional; anything other than exactly `off` is ignored |

**Never print, echo, or commit values from `.env` / `.env.local` — they contain live-looking
`pk_live_`/`sk_live_` keys.** Both files are gitignored (so is `/.clerk/`).

Missing-from-env-but-required-by-code checklist: `PAYSTACK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`,
`CLERK_SYNC_TOKEN`, `NOTIFY_RATE_LIMIT_TOKEN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `VIDEO_PLAYBACK_SECRET`, `APP_ORIGIN`, `UPLOADTHING_TOKEN`,
`RESEND_API_KEY` (or the `SMTP_*` set), `INSTRUCTOR_APPLICATION_EMAIL`, `BANK_ENCRYPTION_KEY`.
The seven
`MAIL_FROM_*` variables are optional individually; `RESEND_FROM` covers any that are unset.

---

## 7. Gotchas & do-not-touch

- **`lib/mail.ts` is provider-aware: Resend first, SMTP fallback.** `activeMailProvider()`
  decides per send; both providers satisfy the same `sendMail` contract, so call sites never
  branch on it. Three things to preserve if you touch it:
  - `isResendConfigured()` requires **both** `RESEND_API_KEY` and `RESEND_FROM`. A key without a
    verified sender is treated as *not* configured, because `isMailConfigured()` gates the notify
    route and the certificate action — reporting ready and then throwing per send is the failure
    mode worth avoiding.
  - Resend reports API failures in the response body of a resolved promise; it does not throw.
    `sendViaResend` checks `result.error` and rethrows. Dropping that check makes the notify route
    return `200` for mail that was never sent.
  - Mail env must exist in **two** runtimes. `.env.local` covers the Next route handler;
    `npx convex env set RESEND_API_KEY …` is what `convex/certificateArtifacts.ts` and
    `convex/emailCampaigns.ts` read, since they send from `"use node"` actions. Setting only
    the first leaves certificate and drip mail silently skipped (they log a warning and
    return, deliberately — mail never blocks issuance).
- **Lifecycle email (`lib/emails/`, `convex/emailCampaigns*.ts`).** Every send needs three
  things, and the order matters:
  1. A `dedupeKey`, claimed via `internal.emailDeliveries.claim` **before** the network call.
     Convex retries failed actions and a retried mutation can schedule a drip step twice, so
     without the claim a flaky provider becomes a duplicate email. `claimed` rows are honoured
     for 10 minutes; `sent` and `skipped` are final; `failed` is retryable on purpose (a lost
     receipt costs real money).
  2. A template in `lib/emails/templates.ts`, rendered with `renderEmail(id, data)`.
  3. A sender group. `sendMail` **requires** `group`, so there is no way to send from an
     ungrouped address; `lib/mail-senders.ts` owns the seven groups and resolves
     `MAIL_FROM_<GROUP>` → `RESEND_FROM` → `SMTP_FROM`.
  Delivery never blocks its trigger: `deliver()` swallows provider errors after recording them,
  so a purchase stays settled and a certificate stays issued when mail is down.
- **The drip has one owner.** `emailCampaignsData.scheduleDrip` queues
  `courseNotStarted` / `courseStalled` / `courseAlmostDone` / `courseStalledFinal` at days
  2 / 7 / 12 / 21 from the enrollment, guarded by a `dripScheduled:<id>` ledger row. The
  in-app `checkUserInactivityReminders` in `convex/enrollments.ts` deliberately does NOT email
  the same situation — adding it would mail a learner twice for one gap. Likewise
  `helpers/notifications.ts` mirrors only `discussion_reply` into email.
- **Actions call each other by name, not through `internal`.** `emailCampaigns.ts` is itself
  in `_generated/api`, so importing `internal` from there to reach its own siblings makes
  TypeScript infer a return type from a cycle it sits inside and collapses the file to `any`
  (TS7022). Those calls use `makeFunctionReference` with explicit arg/result types, the same
  workaround `lib/durable-rate-limit.ts` uses. Keep it.
- **`proxy.ts` at the repo root is the Next 16 middleware** (Next renamed `middleware.ts` →
  `proxy.ts`). There is **no** `middleware.ts` — do not "fix" this by adding one; you'd run two
  handlers. Public routes: `/sign-in`, `/sign-up`, `/`, `/courses(.*)`, `/verify(.*)`,
  `/become-instructor`, `/maintenance` and the one
  API route `/api/instructor-applications/notify`; everything else hits `auth.protect()`. The
  matcher also covers `/(api|trpc)(.*)`, so any unlisted `/api` route needs a session too. The
  notify route is public because signed-out applicants post to it; it defends itself (same-origin
  check, IP rate limits, field caps) — public ≠ undefended. `/maintenance` is public for the same
  reason (it is shown to signed-out people) and is additionally the route the maintenance gate
  rewrites to; see rule 10. `proxy.ts` is also where the
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
- **Payout account details are one-shot, staff-only, and encrypted.** `convex/instructorBank.ts`
  owns the policy: an instructor **or admin** saves an account exactly once, verified via
  Paystack's `/bank/resolve` from the `"use node"` action `convex/bankVerification.ts` (the
  default runtime has no `fetch`). Every role check here is `isStaff`, never
  `role === "instructor"`: an admin may teach and therefore earn, and gating the payout account
  on the narrower role leaves an admin's earnings with nowhere to go. The raw number is stored
  only as AES-256-GCM ciphertext (`convex/helpers/encryption.ts`, keyed by
  `BANK_ENCRYPTION_KEY`); the UI reads a last-four mask derived at read time. Changes go through
  support (`lib/support.ts`), never a self-service edit — do not add an "edit payout account"
  path without re-reading that comment.
  The bank dropdown is `lib/banks.ts`, generated by `node scripts/generate-banks.mjs` from
  Paystack's `/bank?country=nigeria`; re-run the script to refresh it.
- **Payout setup is a dialog, not a page.** `components/bank-setup-modal.tsx` exports
  `BankSetupProvider` (mounted in `app/dashboard/instructor/layout.tsx`) and `useBankSetup()`.
  It auto-opens once per full page load when `needsPayoutSetup` is true, and the dialog is
  dismissible, so `components/bank-info-banner.tsx` stays as the re-entry point. The dialog is
  **setup-only**: the read-only receipt is the `#payout-account` section on the Earnings page,
  and every deep link (both notifications, both emails) targets that anchor. There is no
  `/dashboard/instructor/bank` route — do not add one back.
- **Video lessons are URL-based** (YouTube/Vimeo/MP4) — direct video upload is intentionally
  unsupported.
- **Lesson authoring uses Markdown** (`react-markdown` + `remark-gfm`), not a rich-text editor.
- Naming: components kebab-case (`video-player.tsx`); Convex modules camelCase domain names
  (`certificateTemplates.ts`); internal functions camelCase verbs (`issueIfEligible`,
  `markPurchasePaid`).
- `convex/emailCampaignsData.ts` holds the reads the mail actions need, because a `"use node"`
  module may only export actions. Keep it `internal` only.
- Prefer changing existing docs over creating new Markdown files (because of the `*.md` ignore).
  `docs/*.md` is force-added (`git add -f`) when a doc is genuinely needed.

---

## 8. Existing docs (read these for depth)

- `docs/CERTIFICATES.md` — authoritative doc on issuance, templates, artifacts, verification.
- `docs/email-senders.md` — the seven sender groups and the `MAIL_FROM_*` variables.
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
