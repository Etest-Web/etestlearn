import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { ArrowRight, GraduationCap, Mail, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

export default async function MaintenancePage() {
  const status = await readStatus();
  const message = normalizeMaintenanceMessage(status.message) || DEFAULT_MAINTENANCE_MESSAGE;

  return (
    <main className="relative isolate flex min-h-[80vh] items-center justify-center px-4 py-20">
      {/* The brand wash the marketing pages open with, held far back so the
          notice is the only thing that reads as foreground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--brand)_0%,transparent_70%)] opacity-[0.10]"
      />

      <div className="w-full max-w-xl text-center">
        <div
          aria-hidden
          className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand"
        >
          <Wrench className="h-6 w-6" />
        </div>

        <Badge variant="secondary" className="mb-4">
          Scheduled maintenance
        </Badge>

        <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em] text-foreground sm:text-5xl">
          We&rsquo;ll be right back
        </h1>

        <p className="mx-auto mt-4 max-w-md text-balance text-base leading-relaxed text-muted-foreground">
          {message}
        </p>

        

        {/*
          The one door left open. Instructors are how the catalogue gets built,
          so taking applications offline is a far larger cost than pausing the
          storefront — which is why `/become-instructor` is allowlisted in
          `lib/maintenance.ts` rather than blocked with everything else.
        */}
        {status.allowInstructorApplications && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <Button size="lg" render={<a href="/become-instructor" />}>
              <GraduationCap className="mr-2 h-4 w-4" aria-hidden />
              Apply to teach on {siteConfig.name}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
            <p className="text-xs text-muted-foreground">
              Applications are the one thing still open. Everything else returns when we&rsquo;re back.
            </p>
          </div>
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