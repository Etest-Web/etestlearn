import { ReactNode } from "react";

import { DashboardChrome } from "@/components/dashboard-chrome";

/**
 * The dashboard layout is a **server** component on purpose, and it forces the
 * whole `/dashboard/*` subtree into per-request dynamic rendering.
 *
 * Why dynamic is required here: `proxy.ts` protects every dashboard route with
 * a nonce-based Content-Security-Policy (see AGENTS.md rule 8). A nonce only
 * works if Next.js stamps it onto the page's inline `<script>` tags — which
 * happens during a per-request server render, not for a page baked at build
 * time. If this subtree were statically prerendered, its inline hydration
 * scripts would carry no nonce, and the nonce CSP (which deliberately omits
 * `'unsafe-inline'`) would block them — the dashboard would never hydrate.
 *
 * Public routes are the ones that get static prerendering: they receive the
 * separate static CSP (`'unsafe-inline'`, no nonce) from `proxy.ts` and so
 * hydrate fine from build-time HTML. The dashboard is authenticated and
 * per-user, so it stays server-rendered to keep the nonce correct.
 *
 * The actual chrome (sidebar, header, providers) lives in the client component
 * `components/dashboard-chrome.tsx`, which needs a client runtime for its hooks.
 * This file exists to carry the route segment config, which cannot be exported
 * from a `"use client"` module.
 */
export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    return <DashboardChrome>{children}</DashboardChrome>;
}
