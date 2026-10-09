/**
 * Reading and writing the dashboard's mode cookie.
 *
 * The cookie exists for one decision only: where `/dashboard` should land.
 * What the sidebar *paints* is derived from the URL instead
 * (`modeForPath` in `components/dashboard-nav.ts`), so the chrome can never
 * disagree with the page in front of you — and a hand-typed URL always shows
 * the right nav whether or not a cookie was ever written.
 *
 * Client-only by construction: `readDashboardMode` touches `document`, so it is
 * called from an effect. Nothing in `convex/` imports this.
 */
import type { DashboardMode } from "@/components/dashboard-nav";

const COOKIE_NAME = "glypha_mode";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Parse a raw cookie value, rejecting anything unrecognised.
 *
 * A corrupt or hand-edited value falls back to `null` — which the caller reads
 * as "no preference", i.e. render the student dashboard. That direction is
 * deliberate: a bad cookie should never be the reason someone cannot reach their
 * console, because `landingForMode` would happily send them somewhere arbitrary.
 */
export function parseDashboardMode(raw: string | null | undefined): DashboardMode | null {
    if (raw === "student" || raw === "instructor" || raw === "admin") return raw;
    return null;
}

/** Read the current mode preference, or `null` when none is set. */
export function readDashboardMode(): DashboardMode | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(
        new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`),
    );
    return parseDashboardMode(match?.[1]);
}

/**
 * Persist the mode so the next visit to `/dashboard` lands in the right console.
 *
 * Same-origin and `path=/` so the dashboard layout and every console route can
 * see it. Not `Secure`/`SameSite`: this is a display preference that gates
 * nothing — every console re-checks the role server-side, and the caller
 * additionally refuses to honour a mode the role does not have.
 */
export function writeDashboardMode(mode: DashboardMode): void {
    if (typeof document === "undefined") return;
    document.cookie = `${COOKIE_NAME}=${mode}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

export const DASHBOARD_MODE_COOKIE = COOKIE_NAME;