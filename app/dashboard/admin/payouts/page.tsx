"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  AdminPayoutView,
  PayoutRecipientView,
} from "@/convex/payouts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, Input, Label, PageHeader } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/instructor-earnings";
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/utils";
import { payoutStatusLabel, type PayoutStatus } from "@/lib/payouts";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

/**
 * The payout queue.
 *
 * This is where an instructor's "pay me" request becomes an actual transfer,
 * and it is the only place that writes the `paid` rows the instructor's history
 * is made of. That ordering is the point: a request never claims money moved —
 * an admin confirms it did, with the reference as evidence.
 *
 * The body is mounted separately from the page shell so the admin-only queries
 * are not called above the role check (same pattern as
 * `admin/unpublish-requests`).
 */

type QueueFilter = PayoutStatus | "all";

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: "requested", label: "Requested" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function statusBadge(status: PayoutStatus) {
  switch (status) {
    case "paid":
      return (
        <Badge variant="success">
          <BadgeCheck className="h-3 w-3" />
          Paid
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline">
          <XCircle className="h-3 w-3" />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3" />
          Requested
        </Badge>
      );
  }
}

/** Resolve a ledger row's owner to a comfortable display line. */
function instructorLabel(row: AdminPayoutView): string {
  return row.instructorName ?? row.instructorEmail ?? "Unknown instructor";
}

/** The inline "mark paid" / "decline" panel for one pending request. */
function ResolvePanel({
  row,
  onDone,
}: {
  row: AdminPayoutView;
  onDone?: () => void;
}) {
  const [action, setAction] = useState<"pay" | "decline" | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const markPaid = useMutation(api.payouts.markPayoutPaid);
  const decline = useMutation(api.payouts.declinePayoutRequest);

  async function confirm() {
    setBusy(true);
    try {
      if (action === "pay") {
        await markPaid({
          payoutId: row._id,
          reference: reference.trim() || undefined,
          note: note.trim() || undefined,
        });
        toast.success(`Marked ${formatNaira(row.amountKobo)} as paid.`);
      } else {
        await decline({
          payoutId: row._id,
          note: note.trim() || undefined,
        });
        toast.success("Request declined.");
      }
      onDone?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update the request"));
    } finally {
      setBusy(false);
    }
  }

  if (action === null) {
    return (
      <CardFooter className="flex-col gap-2 sm:flex-row">
        <Button
          className="w-full sm:w-auto"
          onClick={() => setAction("pay")}
        >
          <Send className="h-4 w-4" />
          Mark as paid
        </Button>
        <Button
          className="w-full sm:w-auto"
          variant="outline"
          onClick={() => setAction("decline")}
        >
          Decline
        </Button>
      </CardFooter>
    );
  }

  return (
    <CardFooter className="flex-col gap-3 sm:flex-row sm:flex-wrap">
      {action === "pay" ? (
        <>
          <Input
            aria-label="Transfer reference"
            placeholder="Transfer reference (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          <Input
            aria-label="Admin note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full sm:max-w-xs"
          />
        </>
      ) : (
        <Input
          aria-label="Reason for declining"
          placeholder="Why is this being declined? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full"
        />
      )}
      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          className="flex-1 sm:flex-none"
          variant="ghost"
          onClick={() => {
            setAction(null);
            setReference("");
            setNote("");
          }}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 sm:flex-none"
          variant={action === "pay" ? "default" : "destructive"}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : action === "pay" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {action === "pay" ? "Confirm payment" : "Confirm decline"}
        </Button>
      </div>
    </CardFooter>
  );
}

/**
 * Record a payout that was sent outside the request queue.
 *
 * An instructor does not have to have asked for money to have been paid, so the
 * ledger has to be writable directly. The picker shows staff only; the selected
 * person's balance is fetched on demand rather than for the whole list, so this
 * does not walk every instructor's sales on page load.
 */
function RecordPayoutCard() {
  const recipients = useQuery(api.payouts.listPayoutRecipients, {});
  const [instructorId, setInstructorId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const recordPayout = useMutation(api.payouts.recordPayout);
  const overview = useQuery(
    api.payouts.getPayoutOverview,
    instructorId ? { instructorId: instructorId as Id<"users"> } : "skip",
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const naira = Number(amount);
    if (!instructorId) {
      toast.error("Choose who this payout was sent to");
      return;
    }
    if (!Number.isFinite(naira) || naira <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }

    setBusy(true);
    try {
      await recordPayout({
        instructorId: instructorId as Id<"users">,
        amountKobo: Math.round(naira * 100),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Payout recorded.");
      setInstructorId("");
      setAmount("");
      setReference("");
      setNote("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to record the payout"));
    } finally {
      setBusy(false);
    }
  }

  const selected: PayoutRecipientView | undefined = recipients?.find(
    (r) => r.id === instructorId,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a payout</CardTitle>
        <CardDescription>
          For money you have already sent outside a request. It lands in the
          instructor&apos;s history as a completed payout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payout-recipient">Recipient</Label>
            <Select
              value={instructorId}
              onValueChange={(value) => setInstructorId(value ?? "")}
            >
              <SelectTrigger id="payout-recipient" className="w-full">
                <SelectValue placeholder="Select an instructor" />
              </SelectTrigger>
              <SelectContent>
                {(recipients ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name ?? r.email ?? "Unnamed"}
                    {r.bankVerified ? "" : " (no bank account)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                Available balance:{" "}
                <span className="tabular text-foreground">
                  {overview ? formatNaira(overview.balance.availableKobo) : "…"}
                </span>
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-amount">Amount (₦)</Label>
            <Input
              id="payout-amount"
              inputMode="decimal"
              placeholder="e.g. 25000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-reference">Transfer reference</Label>
            <Input
              id="payout-reference"
              placeholder="Paystack transfer code (optional)"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payout-record-note">Note</Label>
            <Input
              id="payout-record-note"
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !instructorId}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Banknote className="h-4 w-4" />
              )}
              Record payout
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PayoutQueueBody() {
  const [filter, setFilter] = useState<QueueFilter>("requested");
  const queue = useQuery(api.payouts.listPayoutQueue, {
    status: filter === "all" ? undefined : filter,
  });

  return (
    <>
      <div
        className="flex w-max gap-0.5 overflow-x-auto rounded-md border border-rule bg-surface-sunken p-0.5"
        role="group"
        aria-label="Filter payouts by status"
      >
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            aria-pressed={filter === item.value}
            variant={filter === item.value ? "secondary" : "ghost"}
            size="sm"
            className="rounded-sm"
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <RecordPayoutCard />

      {queue === undefined ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Nothing here"
          description={
            filter === "requested"
              ? "No instructor is waiting on a payout right now."
              : "No payouts match this filter."
          }
          tone="brand"
        />
      ) : (
        <div className="grid gap-4">
          {queue.map((row) => (
            <Card key={row._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{instructorLabel(row)}</CardTitle>
                    <CardDescription className="mt-1">
                      {row.instructorEmail ?? "no email on file"} ·{" "}
                      {formatNaira(row.amountKobo)} ·{" "}
                      <span className="tabular">
                        {payoutStatusLabel(row.status).toLowerCase()}
                      </span>{" "}
                      {formatRelativeTime(row.requestedAt)}
                    </CardDescription>
                  </div>
                  {statusBadge(row.status)}
                </div>
              </CardHeader>

              <CardContent className="space-y-2 text-sm">
                {row.note ? (
                  <p className="whitespace-pre-wrap leading-[1.6] text-foreground">
                    {row.note}
                  </p>
                ) : null}
                {row.status !== "requested" ? (
                  <p className="text-xs text-muted-foreground">
                    {row.resolvedAt
                      ? `Resolved ${formatAbsoluteDate(row.resolvedAt)}`
                      : "Resolved"}
                    {row.recordedByName ? ` by ${row.recordedByName}` : ""}
                    {row.reference ? ` · ref ${row.reference}` : ""}
                  </p>
                ) : null}
              </CardContent>

              {row.status === "requested" ? <ResolvePanel row={row} /> : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function AdminPayoutsPage() {
  return (
    <PageShell>
      <PageHeader
        title="Payouts"
        description="Instructors ask to be paid from here; you confirm each transfer once it has actually been sent. The reference you record is the receipt they see."
      />
      <PayoutQueueBody />
    </PageShell>
  );
}
