/**
 * "Was this path prerendered, and what inline scripts does it ship?"
 *
 * The hash-based `script-src` (see `buildStaticContentSecurityPolicy`) can only
 * be built from the response itself: a static page has no request, therefore no
 * nonce, but its inline scripts are fixed at build time — so the honest source
 * of truth is the HTML file Next will serve. This module is the only place that
 * reads the build output, and it answers three questions the proxy asks per
 * request:
 *
 *   1. Is this path in the prerender manifest?  → `isPrerenderedRoute`
 *   2. If so, what does its HTML contain?        → `readPrerenderedScriptHashes`
 *   3. Where would that HTML live?               → `prerenderedHtmlCandidates` (pure)
 *
 * Why the manifest matters as well as the file
 * ============================================
 * File existence alone cannot tell "dynamic route" apart from "prerendered
 * route whose file this process cannot see" — and getting that wrong in the
 * dangerous direction means serving a hash policy for a page whose scripts
 * were rendered at request time (they match no hash → the page never
 * hydrates). So the manifest answers *what the route is*, the file answers
 * *what to allow*, and the two failure modes fall back to the policy the app
 * shipped before this existed rather than to a broken page:
 *
 *   · manifest unreadable  → caller keeps its old public/protected split
 *   · manifest says prerendered but the HTML is missing → degraded policy
 *
 * Both fallbacks are availability floors, not security decisions, and each one
 * is warned about once per path from `proxy.ts`.
 *
 * Why these files must be in the deployment
 * =========================================
 * Neither is imported statically, so Next's output-file tracing cannot see
 * them — on a platform that packages functions from the trace (Vercel) they
 * would simply be absent and the app would silently sit on the degraded
 * policy. `next.config.ts#outputFileTracingIncludes` lists both explicitly for
 * that reason; keep it in sync if the paths here move.
 *
 * Everything is read at runtime, not compile time, on purpose: the proxy is
 * bundled *before* pages are prerendered, so hashes imported at build time
 * would be from the previous build (or empty). Reading the artifact the server
 * is about to serve cannot go stale.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractInlineScriptHashes } from "./csp";

/** Prerendered HTML for a path, hashed once and remembered per process. */
const htmlHashCache = new Map<string, string[]>();

/** Paths we have already warned about, so a broken build logs once, not per hit. */
const warnedPaths = new Set<string>();

/**
 * `prerender-manifest.json`'s `routes` keys, or `null` when the file cannot be
 * read. `undefined` means "not attempted yet" — a failed read is *not* cached,
 * because `next dev` writes build artifacts after the first request and a
 * cached miss would then never recover. A production process that cannot read
 * it once cannot read it later either, and the retry costs one ENOENT.
 */
let prerenderedRoutes: Set<string> | null | undefined;

function distDir(): string {
  // The proxy runs on Node (Next 16 makes that the default), so cwd is the
  // project root in every environment this app runs in — `next dev`,
  // `next start`, and the platform function.
  return path.join(process.cwd(), ".next");
}

/**
 * Normalise a request pathname for lookup: no query/fragment (the caller has
 * already split them), no trailing slash, no traversal.
 *
 * Returns `null` for anything that is not obviously a single URL path — a
 * `..` never belongs in a route here, and refusing it outright means the
 * path is never joined onto the dist directory in the first place.
 */
export function normalizePathname(pathname: string): string | null {
  if (!pathname || pathname.includes("\0") || pathname.includes("..")) return null;
  if (!pathname.startsWith("/")) return null;
  const normalized = path.posix.normalize(pathname);
  if (!normalized.startsWith("/") || normalized.includes("..")) return null;
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

/**
 * The candidate files Next may have written for a path, relative to
 * `.next/server/app`. Pure — this is the part worth unit-testing, since the
 * rest of the module is filesystem plumbing.
 *
 * Both layouts occur: Next writes `courses.html` for `/courses` and
 * `foo/index.html` for `/foo` depending on the route's shape, so the caller
 * tries them in order.
 */
export function prerenderedHtmlCandidates(pathname: string): string[] | null {
  const normalized = normalizePathname(pathname);
  if (normalized === null) return null;
  if (normalized === "/") return ["index.html"];
  const relative = normalized.slice(1);
  return [`${relative}.html`, `${relative}/index.html`];
}

/**
 * Is this path one Next prerendered at build time?
 *
 *   `true`  — it is in the manifest; the response will be a file from disk
 *   `false` — it is not; the response will be rendered for this request
 *   `null`  — the manifest is unreadable, so the caller must not guess
 */
export function isPrerenderedRoute(pathname: string): boolean | null {
  const normalized = normalizePathname(pathname);
  if (normalized === null) return false;

  if (prerenderedRoutes === undefined) {
    try {
      const raw = readFileSync(path.join(distDir(), "prerender-manifest.json"), "utf8");
      const parsed = JSON.parse(raw) as { routes?: Record<string, unknown> };
      prerenderedRoutes = new Set(Object.keys(parsed.routes ?? {}));
    } catch {
      prerenderedRoutes = null;
    }
  }

  if (prerenderedRoutes === null) return null;
  return prerenderedRoutes.has(normalized);
}

/**
 * The `script-src` hashes for the prerendered HTML served at `pathname`, or
 * `null` when there is nothing readable to hash (not prerendered, no file,
 * or the read/parse failed).
 *
 * Results are cached per path — the HTML cannot change while the process
 * lives, and hashing ~30 scripts on every hit of the landing page would be a
 * silly way to spend a request. Failures are deliberately *not* cached so a
 * transient problem does not stick for the life of the isolate.
 */
export async function readPrerenderedScriptHashes(pathname: string): Promise<string[] | null> {
  const normalized = normalizePathname(pathname);
  if (normalized === null) return null;

  const cached = htmlHashCache.get(normalized);
  if (cached) return cached;

  const candidates = prerenderedHtmlCandidates(normalized);
  if (!candidates) return null;

  for (const candidate of candidates) {
    const absolute = path.join(distDir(), "server", "app", candidate);
    if (!existsSync(absolute)) continue;
    try {
      const html = readFileSync(absolute, "utf8");
      const hashes = await extractInlineScriptHashes(html);
      htmlHashCache.set(normalized, hashes);
      return hashes;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * The `script-src` hashes for the inline scripts the **root layout** ships,
 * read from the landing page's prerendered HTML.
 *
 * These are the one class of inline script a nonce policy cannot reach: Next
 * stamps `nonce` on the tags *it* emits (chunk tags, the RSC payload, the
 * hydration bootstrap), but a `<script>` rendered by a React component carries
 * whatever nonce the component was handed — and `app/layout.tsx` cannot hand
 * one over without calling `headers()`, which would opt every route into
 * dynamic rendering and cost the storefront its prerendering (see H-1b). The
 * theme script is therefore blocked on every nonce route, and dark-mode users
 * get a flash of the wrong theme before hydration fixes it.
 *
 * The landing page is the honest source: the root layout is part of *every*
 * route's tree, so the set is the same everywhere; the values are build-time
 * constants; and the minified function source next-themes embeds
 * (`fn.toString()`) is only knowable from the *built* HTML — the copy in
 * `node_modules` is a differently-minified string, so hashing it would allow a
 * script the browser never sees. Reading `index.html` means the value cannot
 * drift from what the bundler produced.
 *
 * The set covers all executable inline scripts on that page, not just the
 * theme script — Next's bootstrap payloads included. That is deliberate and
 * not a weakening: each hash names a byte-identical, build-produced, benign
 * payload, so an attacker who "uses" one can only re-run code the site was
 * going to run anyway; anything of their own still needs the per-request
 * nonce. Data blocks (JSON-LD) are excluded by the extractor, as everywhere.
 *
 * Returns `[]` when there is no readable artifact (development, degraded
 * deployment) — the caller then keeps a nonce-only policy, which still blocks
 * nothing Next rendered itself.
 */
export async function readLayoutScriptHashes(): Promise<string[]> {
  return (await readPrerenderedScriptHashes("/")) ?? [];
}

/**
 * Record that a path fell back to the degraded policy, so the operator hears
 * about it exactly once per path instead of once per request.
 *
 * Returns `true` the first time only — the proxy logs when it does.
 */
export function shouldWarnAboutFallback(pathname: string): boolean {
  const key = pathname || "/";
  if (warnedPaths.has(key)) return false;
  warnedPaths.add(key);
  if (warnedPaths.size > 500) warnedPaths.clear();
  return true;
}
