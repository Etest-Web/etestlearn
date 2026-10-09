"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminGuard } from "@/components/role-guard";
import { PageShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Undo2 } from "lucide-react";
import { toast } from "sonner";

type StatusFilter = "all" | "pending" | "paid" | "failed";

function PaymentsBody() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [reason, setReason] = useState("");

  const purchases = useQuery(api.payments.adminListPurchases, {
    status: status === "all" ? undefined : status,
    limit: 200,
  });
  const markRefunded = useMutation(api.payments.markRefunded);

  if (purchases === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  async function refund(purchaseId: string, clear: boolean) {
    try {
      await markRefunded({
        purchaseId: purchaseId as never,
        reason: clear ? undefined : reason.trim() || undefined,
        clearRefund: clear,
      });
      toast.success(clear ? "Refund annotation cleared" : "Purchase marked refunded");
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <Card className="gap-0 p-0">
      <CardHeader className="border-b border-rule p-5">
        <CardTitle>
          Purchases (<span className="tabular">{purchases.length}</span>)
        </CardTitle>
        <CardDescription>
          Refund marks are annotations — the money moves in the Paystack dashboard. Course
          access is never revoked automatically; delete the enrollment deliberately if needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 border-b border-rule p-4">
          <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Refund reason (recorded in the audit log)…"
            className="max-w-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Purchases with buyer, course, amount and refund state.</caption>
            <thead>
              <tr className="border-b border-rule bg-surface-sunken">
                <th scope="col" className="eyebrow px-3 py-2.5 pl-5 text-left">Reference</th>
                <th scope="col" className="eyebrow px-3 py-2.5 text-left">Buyer</th>
                <th scope="col" className="eyebrow px-3 py-2.5 text-left">Course</th>
                <th scope="col" className="eyebrow px-3 py-2.5 text-left">Amount</th>
                <th scope="col" className="eyebrow px-3 py-2.5 text-left">Status</th>
                <th scope="col" className="eyebrow px-3 py-2.5 pr-5 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr
                  key={purchase._id}
                  className="border-b border-rule transition-colors last:border-0 hover:bg-surface-sunken/60"
                >
                  <td className="px-3 py-2.5 pl-5">
                    <p className="max-w-[180px] truncate font-mono text-xs">{purchase.reference}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(purchase.createdAt).toLocaleDateString("en-NG")}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{purchase.buyerName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{purchase.buyerEmail ?? ""}</p>
                  </td>
                  <td className="px-3 py-2.5">{purchase.courseTitle ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {purchase.currency} {purchase.amount.toLocaleString("en-NG")}
                  </td>
                  <td className="px-3 py-2.5">
                    {purchase.refundedAt ? (
                      <Badge className="bg-destructive/10 text-destructive">Refunded</Badge>
                    ) : purchase.status === "paid" ? (
                      <Badge className="bg-success/10 text-success">Paid</Badge>
                    ) : (
                      <Badge variant="secondary">{purchase.status}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 pr-5 text-right">
                    {purchase.refundedAt ? (
                      <Button variant="ghost" size="sm" onClick={() => refund(purchase._id, true)}>
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Clear mark
                      </Button>
                    ) : purchase.status === "paid" ? (
                      <Button variant="outline" size="sm" onClick={() => refund(purchase._id, false)}>
                        Mark refunded
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      className="border-y-0"
                      title="No purchases in this view"
                      description="Paystack checkouts appear here as the webhook confirms them. Pending checkouts are not shown until payment settles."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPaymentsPage() {
  return (
    <AdminGuard>
      <PageShell>
        <PageHeader
          title="Payments"
          description="Every Paystack purchase across the platform, with refund tracking."
        />
        <PaymentsBody />
      </PageShell>
    </AdminGuard>
  );
}