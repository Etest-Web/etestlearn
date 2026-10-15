"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile, SegmentedControl } from "@/components/instructor-console";
import { formatNaira } from "@/lib/instructor-earnings";
import {
  formatAbsoluteDate,
  formatRelativeTime,
  pluralize,
} from "@/lib/utils";
import {
  Banknote,
  BadgeCheck,
  Clock,
  Download,
  Lock,
  Receipt,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { PayoutStatus } from "@/lib/payouts";

/**
 * Payouts — what has been sent, and the button that asks for the rest.
 *
 * The Earnings page answers "what have I earned?". This page answers the two
 * questions that come after it: "what is still owed?" and "did that transfer
 * actually happen?". Every figure comes from the same total the Earnings page
 * shows minus the ledger rows rendered below, so the headline and the table
 * cannot disagree.
 *
 * The page never claims money moved by itself. A `paid` row exists only after an
 * admin marked a real transfer, and its reference is shown as the receipt.
 */

const STATUS_META: Record<
  PayoutStatus,
  { label: string; variant: "secondary" | "success" | "outline"; icon: typeof Clock }
> = {
  requested: { label: "Requested", variant: "secondary", icon: Clock },
  paid: { label: "Paid", variant: "success", icon: BadgeCheck },
  cancelled: { label: "Cancelled", variant: "outline", icon: XCircle },
};

function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const { label, variant, icon: Icon } = STATUS_META[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function PayoutsSkeleton() {
  return (
    <PageShell>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </PageShell>
  );
}

/** Comma-separated values → a CSV cell, quoting only when it has to. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function RequestPayoutButton({
  availableKobo,
  disabledReason,
}: {
  availableKobo: number;
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const request = useMutation(api.payouts.requestPayout);

  const disabled = disabledReason !== null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await request({ note: note.trim() || undefined });
      toast.success("Payout requested. We'll send it to your account shortly.");
      setOpen(false);
      setNote("");
    } catch (error) {
      toast.error((error as Error)?.message ?? "Failed to request a payout");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={disabled} title={disabledReason ?? undefined} />
        }
      >
        <Send className="h-4 w-4" />
        Request payout
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Request your balance</DialogTitle>
            <DialogDescription>
              This asks us to pay out {formatNaira(availableKobo)}. Payouts are
              sent by hand, so it may take a few working days. You can add a note
              for the person sending it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payout-note">Note (optional)</Label>
            <Textarea
              id="payout-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the person sending the payout should know"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {note.trim().length}/500 characters
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Requesting..." : `Request ${formatNaira(availableKobo)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type StatusFilter = PayoutStatus | "all";

export default function InstructorPayoutsPage() {
  const overview = useQuery(api.payouts.getPayoutOverview, {});
  const bankInfo = useQuery(api.instructorBank.getBankInfo);
  const cancelRequest = useMutation(api.payouts.cancelPayoutRequest);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (overview === undefined || bankInfo === undefined) {
    return <PayoutsSkeleton />;
  }

  const { balance, payouts, bankVerified } = overview;
  const pending = payouts.filter((p) => p.status === "requested");
  const hasPending = pending.length > 0;

  const disabledReason = !bankVerified
    ? "Add a verified payout account first"
    : hasPending
      ? "You already have a request waiting to be paid"
      : balance.availableKobo <= 0
        ? "Nothing available to request yet"
        : null;

  const visible =
    filter === "all" ? payouts : payouts.filter((p) => p.status === filter);

  const filters: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: payouts.length },
    {
      value: "requested",
      label: "Requested",
      count: payouts.filter((p) => p.status === "requested").length,
    },
    {
      value: "paid",
      label: "Paid",
      count: payouts.filter((p) => p.status === "paid").length,
    },
    {
      value: "cancelled",
      label: "Cancelled",
      count: payouts.filter((p) => p.status === "cancelled").length,
    },
  ];

  function downloadCsv() {
    const rows = [
      ["Requested", "Resolved", "Amount (NGN)", "Status", "Reference", "Note"],
      ...payouts.map((p) => [
        formatAbsoluteDate(p.requestedAt),
        p.resolvedAt ? formatAbsoluteDate(p.resolvedAt) : "",
        (p.amountKobo / 100).toFixed(2),
        p.status,
        p.reference ?? "",
        p.note ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function withdraw(payoutId: Id<"payouts">) {
    setCancellingId(payoutId);
    try {
      await cancelRequest({ payoutId });
      toast.success("Request withdrawn — the balance is available again.");
    } catch (error) {
      toast.error((error as Error)?.message ?? "Failed to withdraw the request");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Payouts"
        description="What you have asked for, what has been sent, and what is still yours to claim."
        actions={
          payouts.length > 0 ? (
            <Button variant="outline" onClick={downloadCsv}>
              <Download className="h-4 w-4" />
              Export payouts
            </Button>
          ) : undefined
        }
      />

      <section
        aria-label="Payout summary"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatTile
          tone="brand"
          label="Available to request"
          icon={Wallet}
          value={formatNaira(balance.availableKobo)}
          sub={
            hasPending
              ? `${formatNaira(balance.pendingKobo)} already requested`
              : "not yet requested"
          }
        />
        <StatTile
          label="Pending"
          icon={Clock}
          value={formatNaira(balance.pendingKobo)}
          sub={
            hasPending
              ? pluralize(pending.length, "request") + " awaiting payment"
              : "nothing awaiting payment"
          }
        />
        <StatTile
          label="Paid out"
          icon={BadgeCheck}
          value={formatNaira(balance.paidKobo)}
          sub={`${pluralize(
            payouts.filter((p) => p.status === "paid").length,
            "payout",
          )} completed`}
        />
        <StatTile
          label="Lifetime earnings"
          icon={Receipt}
          value={formatNaira(balance.earnedKobo)}
          sub="matches your Earnings page"
        />
      </section>

      {!bankVerified ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5 text-muted-foreground" aria-hidden />
              Add a payout account
            </CardTitle>
            <CardDescription>
              We can only send money to a verified Nigerian bank account, and it
              can be set once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/dashboard/instructor/earnings#payout-account" />}>
              <Banknote className="h-4 w-4" />
              Set up payout account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Request your balance</CardTitle>
                <CardDescription>
                  We pay out the full available balance
                  {bankInfo?.accountName
                    ? ` to ${bankInfo.accountName}`
                    : ""}{" "}
                  once a request is in.
                </CardDescription>
              </div>
              <RequestPayoutButton
                availableKobo={balance.availableKobo}
                disabledReason={disabledReason}
              />
            </div>
          </CardHeader>
          {hasPending ? (
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-surface-sunken p-3.5">
                <p className="text-sm text-muted-foreground">
                  You requested{" "}
                  <span className="tabular font-medium text-foreground">
                    {formatNaira(balance.pendingKobo)}
                  </span>{" "}
                  {formatRelativeTime(pending[0].requestedAt)}. We&apos;ll notify
                  you when it is sent.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancellingId === pending[0]._id}
                  onClick={() => withdraw(pending[0]._id)}
                >
                  {cancellingId === pending[0]._id
                    ? "Withdrawing..."
                    : "Withdraw request"}
                </Button>
              </div>
            </CardContent>
          ) : null}
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Payout history</CardTitle>
              <CardDescription>
                Every request and every transfer, newest first.
              </CardDescription>
            </div>
            <SegmentedControl
              label="Filter payouts by status"
              value={filter}
              onChange={setFilter}
              options={filters}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title={payouts.length === 0 ? "No payouts yet" : "Nothing here"}
              description={
                payouts.length === 0
                  ? "Once you request your balance and we send it, the transfer will be recorded here with its reference."
                  : "No payouts match this filter."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead className="bg-surface-sunken">
                  <tr className="border-b border-rule">
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">
                      Requested
                    </th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">
                      Reference
                    </th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">
                      Note
                    </th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((payout) => (
                    <tr
                      key={payout._id}
                      className="border-b border-rule last:border-0 transition-colors hover:bg-surface-sunken"
                    >
                      <td className="tabular px-5 py-3 text-sm text-muted-foreground">
                        {formatAbsoluteDate(payout.requestedAt)}
                        {payout.resolvedAt && payout.status !== "requested" ? (
                          <span className="block text-xs">
                            resolved {formatAbsoluteDate(payout.resolvedAt)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <PayoutStatusBadge status={payout.status} />
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        {payout.reference ?? "—"}
                      </td>
                      <td className="max-w-56 truncate px-5 py-3 text-sm text-muted-foreground">
                        {payout.note ?? "—"}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-sm font-semibold text-foreground">
                        {formatNaira(payout.amountKobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="sunken">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="display-subheading text-[15px] text-foreground">
              How payouts work
            </h2>
          </div>
          <p className="max-w-[70ch] text-sm leading-[1.7] text-muted-foreground">
            Your available balance is everything you have earned minus what has
            already been paid or is pending. Requesting it asks us to send the
            rest. Payouts are arranged by hand, so a request stays pending until a
            person marks it sent, and the reference on that row is your receipt. A
            refund after a payout reduces your earnings, so the available figure
            can go down without a new request.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button
          variant="ghost"
          render={<Link href="/dashboard/instructor/earnings" />}
        >
          Back to earnings
        </Button>
      </div>
    </PageShell>
  );
}
