"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Banknote, ShieldAlert } from "lucide-react";

import { api } from "@/convex/_generated/api";

/**
 * "You have no bank details yet" — the red banner at the top of the instructor
 * console.
 *
 * Deliberately styled unlike the calm platform `AnnouncementBanner` on the
 * learner dashboard: destructive border, a filled tint and a shield glyph,
 * because this is the one banner that gates money. An instructor who ignores
 * it still teaches, but never gets paid, so quiet chrome would be a lie about
 * how urgent it is.
 *
 * Two subscriptions, both narrow on purpose:
 * · `needsPayoutSetup` answers "instructor, not yet verified" — false for
 *   students and admins, so the banner never renders for them and their
 *   client never learns anything about payouts.
 * · `ensurePayoutNudge` writes the matching inbox notification **once**. The
 *   guard is server-side and idempotent (it finds the existing unread row and
 *   returns), so React StrictMode's double-effect and every future login are
 *   harmless — the mutation is called from an effect, and a mutation that
 *   checks before it writes is the only shape that survives that.
 *
 * The banner cannot be dismissed. That is intentional and is the whole point
 * of the design decision above: a payout blocker is not an announcement, and
 * an X would turn "you will not be paid" into something people close out of
 * habit. It disappears on its own the moment the account is saved.
 */
export function BankInfoBanner() {
  const needsSetup = useQuery(api.instructorBank.needsPayoutSetup);
  const ensureNudge = useMutation(api.instructorBank.ensurePayoutNudge);

  useEffect(() => {
    if (needsSetup !== true) return;
    // Fire-and-forget: the inbox row is a nicety, not something the banner
    // depends on. A rejection here (offline, suspended mid-render) must not
    // throw into render or log an unhandled rejection.
    void ensureNudge({}).catch(() => undefined);
  }, [needsSetup, ensureNudge]);

  if (needsSetup !== true) return null;

  return (
    <div
      role="status"
      className="relative flex flex-wrap items-center gap-3 rounded-2xl border border-destructive bg-destructive/5 p-4 shadow-sm sm:flex-nowrap"
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
      >
        <ShieldAlert className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">
          Add your bank details to receive payouts
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Earnings from your courses are held until a verified Nigerian bank
          account is on file. This takes a minute and can only be done once.
        </p>
      </div>

      <Link
        href="/dashboard/instructor/bank"
        className="inline-flex shrink-0 items-center gap-2 rounded-sm bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95"
      >
        <Banknote className="h-4 w-4" aria-hidden />
        Add bank details
      </Link>
    </div>
  );
}
