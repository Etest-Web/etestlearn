import { makeFunctionReference } from "convex/server";
import type { SearchResults } from "./search";

/**
 * Typed handles on `convex/search.ts`, for the client and for tests.
 *
 * Why not `api.search.*`: `convex/_generated/api.d.ts` is produced by
 * `npx convex dev` and does not list this module yet, so `api.search.search`
 * does not typecheck. `makeFunctionReference` names the same wire function
 * ("modulePath:exportName") and needs no codegen.
 * **Run `npx convex dev` and switch this to `api.search.*` once the module is
 * registered** — this file is the only place that has to change, because every
 * consumer imports from here.
 *
 * This file is also the seam that keeps the browser away from server code:
 * client components may not import a Convex *server* module (it would bundle
 * the function definitions), so they import these opaque references instead.
 * The result *types* come from `lib/search.ts` — the shared vocabulary, not the
 * server module — so the browser never reaches for a Convex module at all.
 */
export const searchApi = {
  search: makeFunctionReference<"query", { query: string }, SearchResults>(
    "search:search",
  ),
} as const;
