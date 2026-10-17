import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { ArrowRight, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";
import { supportMailto } from "@/lib/support";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  normalizeMaintenanceMessage,
} from "@/lib/maintenance";

/**
 * The page every blocked route is rewritten to.
 *
 * `proxy.ts` serves this for the storefront, the catalog and every dashboard
 * while the switch is on. It reads the note server-side rather than through a
 * client query for one reason that matters: a page whose whole job is to be
 * legible when things are broken should not depend on a second client round-trip
 * to render. If Convex is unreachable the fallback copy below is shown — a
 * plain note still beats an error page.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "We'll be right back",
  // This route answers 503 during an outage, which is the signal to back off.
  // `noindex` says the same thing to a crawler that reads the HTML: do not put
  // this in the index. Neither is load-bearing on its own — a 503 alone is
  // enough for well-behaved crawlers, and the header is what protects a crawler
  // that ignores status codes.
  robots: { index: false, follow: false },
};

/** Mirrors `convex/maintenance.getStatus`, minus the fields the page never shows. */
type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  allowInstructorApplications: boolean;
};

async function readStatus(): Promise<MaintenanceStatus> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    return {
      enabled: true,
      message: DEFAULT_MAINTENANCE_MESSAGE,
      allowInstructorApplications: true,
    };
  }

  try {
    return await new ConvexHttpClient(url).query(
      // Referenced by wire name: `api.maintenance.*` is not in
      // `convex/_generated/api` until codegen runs, and importing the generated
      // api object here would pull the whole backend into the server bundle for
      // two fields. Same workaround as `lib/durable-rate-limit.ts`.
      "maintenance:getStatus" as never,
      {},
    );
  } catch {
    return {
      enabled: true,
      message: DEFAULT_MAINTENANCE_MESSAGE,
      allowInstructorApplications: true,
    };
  }
}

/**
 * Composition.
 *
 * Deliberately quiet. The reader is either a learner who has lost access or an
 * employer checking a certificate, and both are owed the message with nothing
 * standing in front of it — so no decorative icon, no pill badge asserting a
 * reason the operator may not have chosen, and no second round-trip to render.
 *
 * Two things are load-bearing beyond the copy:
 *
 *   · The status line above the headline carries no claim. An earlier version
 *     labelled every outage as scheduled work, which is a lie during an
 *     emergency — and the one thing a reader most needs to know accurately is
 *     whether this was expected.
 *   · The instructor-application block stays, because it is the one door the
 *     gate deliberately leaves open (`MAINTENANCE_APPLICATION_ROUTES`). Showing
 *     it is what keeps the allow-list from being a promise nobody can see.
 */
export default async function MaintenancePage() {
  const status = await readStatus();
  const message = normalizeMaintenanceMessage(status.message) || DEFAULT_MAINTENANCE_MESSAGE;

  return (
    <main className="relative isolate flex min-h-[80vh] items-center justify-center px-4 py-20">
      {/* The brand wash the marketing pages open with, held far back so the
          notice is the only thing that reads as foreground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--brand)_0%,transparent_70%)] opacity-[0.07]"
      />

      <div className="w-full max-w-lg">
        {/* A masthead rule rather than a badge: it states the category without
            claiming a cause. */}
        <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-px w-8 bg-rule" aria-hidden />
          Maintenance
        </p>

        <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">
          We&rsquo;ll be right back
        </h1>

        <p className="mt-4 max-w-md text-balance text-base leading-relaxed text-muted-foreground">
          {message}
        </p>

        {/*
          The one door left open. Instructors are how the catalogue gets built,
          so taking applications offline is a far larger cost than pausing the
          storefront — which is why `/become-instructor` is allowlisted in
          `lib/maintenance.ts` rather than blocked with everything else.
        */}
        {status.allowInstructorApplications && (
          <section className="mt-12 border-t border-rule pt-6">
            <h2 className="text-sm font-semibold text-foreground">
              Applications to teach are still open
            </h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
              Everything else returns when the work is done. In the meantime, applications keep
              moving &mdash; so if you were going to apply, go ahead.
            </p>
            <Button className="mt-5" render={<a href="/become-instructor" />}>
              Apply to teach on {siteConfig.name}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </section>
        )}

        <p className="mt-12 text-xs text-muted-foreground">
          Questions in the meantime?{" "}
          <a
            href={supportMailto("Maintenance enquiry")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            <Mail className="mr-1 inline h-3 w-3" aria-hidden />
            Email support
          </a>
          .
        </p>
      </div>
    </main>
  );
}
