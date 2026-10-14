"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { BANKS } from "@/lib/banks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EarningsChart,
  SegmentedControl,
  ShareBar,
  StatTile,
} from "@/components/instructor-console";
import { formatNaira } from "@/lib/instructor-earnings";
import { formatAbsoluteDate, formatRelativeTime, pluralize } from "@/lib/utils";
import { supportEmail, supportMailto } from "@/lib/support";
import { useBankSetup } from "@/components/bank-setup-modal";
import { ArrowRight, Banknote, BadgeCheck, Download, Lock, Percent, Receipt, Wallet } from "lucide-react";

/**
 * Earnings — the money page.
 *
 * Structured as a ledger rather than a wall of numbers: a headline, the monthly
 * series, the breakdown per course, then the individual sales that make up
 * those totals. An instructor reconciling "₦84,000 this month" against their
 * bank needs the last table to actually add up, and every figure here comes
 * from the same `lib/instructor-earnings` functions so the chart, the tiles and
 * the table cannot disagree.
 *
 * The one thing this page deliberately does *not* claim is that money has moved.
 * There is no payout automation in this codebase — the same reason refunds are
 * annotated rather than executed (`payments.markRefunded`) — so the wording
 * throughout is "earned", never "paid out".
 */

const RANGES = [
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
] as const;

function EarningsSkeleton() {
  return (
    <PageShell>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </PageShell>
  );
}

/**
 * Where the money goes, shown next to the money.
 *
 * This is the read-only receipt that used to live on its own page. The setup
 * dialog (`components/bank-setup-modal.tsx`) is one-shot, so after the save
 * there is nothing left to *do* here, but there is something to *read*: an
 * instructor asking "which account is being paid?" gets an answer without
 * writing to support. That is the whole reason this is a section rather than
 * a page that was deleted outright.
 *
 * Rendered in both states on purpose. Before setup it is the third path into
 * the form (after the auto-opening dialog and the Overview banner), and it is
 * the only one that is not a nag. `id="payout-account"` is the anchor the
 * nudge notification and the confirmation email link to.
 */
function PayoutAccountSection() {
  const bankInfo = useQuery(api.instructorBank.getBankInfo);
  const { openBankSetup } = useBankSetup();

  if (bankInfo === undefined) return <Skeleton className="h-40" />;

  if (!bankInfo.verified) {
    return (
      <Card id="payout-account">
        <CardHeader>
          <CardTitle>Payout account</CardTitle>
          <CardDescription>
            Where these earnings are sent once a payout account is on file.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[52ch] text-sm leading-[1.7] text-muted-foreground">
            No payout account yet. Earnings are held until a verified Nigerian
            bank account is on file, and the account can only be set once.
          </p>
          <Button onClick={openBankSetup}>
            <Banknote className="h-4 w-4" />
            Add payout account
          </Button>
        </CardContent>
      </Card>
    );
  }

  const bankName =
    BANKS.find((bank) => bank.code === bankInfo.bankCode)?.name ??
    bankInfo.bankCode ??
    "—";

  return (
    <Card id="payout-account">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="size-5 text-success" aria-hidden />
              Payout account
            </CardTitle>
            <CardDescription>
              Earnings are paid to this account.
              {bankInfo.updatedAt
                ? ` Saved ${formatRelativeTime(bankInfo.updatedAt)}.`
                : ""}
            </CardDescription>
          </div>
          <Badge>Verified</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="eyebrow">Account holder</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {bankInfo.accountName ?? "Your account"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Bank</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {bankName}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Account number</dt>
            <dd className="tabular mt-1 text-sm font-medium text-foreground">
              {bankInfo.accountNumberMasked ?? "********"}
            </dd>
          </div>
        </dl>

        <div className="flex items-start gap-3 rounded-xl border border-rule bg-surface-sunken p-3.5">
          <Lock
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm leading-[1.5] text-muted-foreground">
            This account is locked in place. To change it, email{" "}
            <a
              href={supportMailto("Change my payout bank account")}
              className="font-medium text-brand link-quiet"
            >
              {supportEmail()}
            </a>{" "}
            from the address on your account.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Comma-separated values → a CSV cell, quoting only when it has to. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function InstructorEarningsPage() {
  const [months, setMonths] = useState<"6" | "12">("6");
  const earnings = useQuery(api.instructorStats.getEarningsSummary, {
    months: Number(months),
  });

  if (earnings === undefined) return <EarningsSkeleton />;

  const { lifetime, last30, thisMonth, series, byCourse, recentSales } = earnings;
  const hasSales = lifetime.sales > 0;

  function downloadCsv() {
    // Exports the transaction rows, not the aggregates: an instructor
    // reconciling with a bank needs the individual sales, and every total on
    // this page is derivable from them.
    const rows = [
      ["Date", "Course", "Learner", "Amount (NGN)", "Status"],
      ...recentSales.map((sale) => [
        sale.paidAt ? formatAbsoluteDate(sale.paidAt) : "",
        sale.courseTitle,
        sale.buyerName ?? "",
        (sale.amountKobo / 100).toFixed(2),
        sale.refunded ? "refunded" : "settled",
      ]),
    ];
    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        title="Earnings"
        description={
          <>
            What learners have paid for your courses, and the{" "}
            {Math.round(earnings.revenueShare * 100)}% share that is yours.
            Refunds are excluded from income and shown separately.
          </>
        }
        actions={
          hasSales ? (
            <Button variant="outline" onClick={downloadCsv}>
              <Download className="h-4 w-4" />
              Export sales
            </Button>
          ) : undefined
        }
      />

      <section aria-label="Earnings summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          tone="brand"
          label="Last 30 days"
          icon={Wallet}
          value={formatNaira(last30.netEarningsKobo)}
          delta={{
            percent: earnings.trendPercent,
            comparison: "vs previous 30 days",
          }}
          sub={`${pluralize(last30.sales, "sale")} settled`}
        />
        <StatTile
          label="All time"
          icon={Banknote}
          value={formatNaira(lifetime.netEarningsKobo)}
          sub={`${formatNaira(lifetime.grossKobo)} collected`}
        />
        <StatTile
          label="Average sale"
          icon={Receipt}
          value={lifetime.sales > 0 ? formatNaira(lifetime.averageOrderKobo) : "—"}
          sub={
            lifetime.sales > 0
              ? `across ${pluralize(lifetime.sales, "sale")}`
              : "no sales yet"
          }
        />
        <StatTile
          label="Platform fee"
          icon={Percent}
          value={formatNaira(lifetime.platformFeeKobo)}
          sub={
            lifetime.refunds > 0
              ? `${formatNaira(lifetime.refundedKobo)} refunded · excluded`
              : `${Math.round((1 - earnings.revenueShare) * 100)}% of collected`
          }
        />
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Revenue over time</CardTitle>
              <CardDescription>
                Calendar months. The dashed line is gross collected, the filled
                line is your share after the platform fee.
              </CardDescription>
            </div>
            <SegmentedControl
              label="Chart range"
              value={months}
              onChange={setMonths}
              options={RANGES.map((range) => ({
                value: range.value,
                label: range.label,
              }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          {hasSales ? (
            <EarningsChart
              data={series.map((point) => ({
                key: point.key,
                label: point.label,
                grossKobo: point.grossKobo,
                netEarningsKobo: point.netEarningsKobo,
                sales: point.sales,
              }))}
              height={300}
            />
          ) : (
            <EmptyState
              icon={Banknote}
              title="No sales recorded"
              description="Give a published course a price and the first settled payment will appear here, broken down by month."
              action={
                <Button render={<Link href="/dashboard/instructor/courses" />}>
                  Review your courses
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Earnings by course</CardTitle>
          <CardDescription>
            Where the money comes from. Share is measured against your lifetime
            earnings, so the rows sum to 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {byCourse.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No courses to attribute earnings to"
              description="Create a course and its sales will be tracked here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="bg-surface-sunken">
                  <tr className="border-b border-rule">
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Course</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Price</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Sales</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Collected</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Share of earnings</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Your earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {byCourse.map((row) => (
                    <tr
                      key={row.courseId}
                      className="border-b border-rule last:border-0 transition-colors hover:bg-surface-sunken"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/instructor/courses/${row.courseId}`}
                          className="flex min-w-0 items-center gap-2"
                        >
                          <span className="truncate text-sm font-medium text-foreground link-quiet">
                            {row.title}
                          </span>
                          {row.published ? null : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                        </Link>
                      </td>
                      <td className="tabular px-5 py-3 text-sm text-muted-foreground">
                        {row.price && row.price > 0 ? formatNaira(row.price) : "Free"}
                      </td>
                      <td className="tabular px-5 py-3 text-sm text-foreground">{row.sales}</td>
                      <td className="tabular px-5 py-3 text-sm text-foreground">
                        {formatNaira(row.grossKobo)}
                        {row.refundedKobo > 0 ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            ({formatNaira(row.refundedKobo)} refunded)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <ShareBar percent={row.shareOfEarnings} className="max-w-40" />
                      </td>
                      <td className="tabular px-5 py-3 text-right text-sm font-semibold text-foreground">
                        {formatNaira(row.netEarningsKobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-rule-strong bg-surface-sunken">
                    <td className="px-5 py-3 text-sm font-semibold text-foreground" colSpan={2}>
                      Total
                    </td>
                    <td className="tabular px-5 py-3 text-sm font-semibold text-foreground">
                      {lifetime.sales}
                    </td>
                    <td className="tabular px-5 py-3 text-sm font-semibold text-foreground">
                      {formatNaira(lifetime.grossKobo)}
                    </td>
                    <td className="px-5 py-3" />
                    <td className="tabular px-5 py-3 text-right text-sm font-semibold text-foreground">
                      {formatNaira(lifetime.netEarningsKobo)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly statement</CardTitle>
          <CardDescription>
            The same series as the chart, as numbers. This month so far:{" "}
            <span className="tabular text-foreground">
              {formatNaira(thisMonth.netEarningsKobo)}
            </span>{" "}
            from {pluralize(thisMonth.sales, "sale")}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-surface-sunken">
                <tr className="border-b border-rule">
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Month</th>
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Sales</th>
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Collected</th>
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Refunded</th>
                  <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Fee</th>
                  <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Your earnings</th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((point) => (
                  <tr
                    key={point.key}
                    className="border-b border-rule last:border-0 transition-colors hover:bg-surface-sunken"
                  >
                    <td className="px-5 py-3 text-sm font-medium text-foreground">
                      {point.label}
                    </td>
                    <td className="tabular px-5 py-3 text-sm text-foreground">{point.sales}</td>
                    <td className="tabular px-5 py-3 text-sm text-foreground">
                      {formatNaira(point.grossKobo)}
                    </td>
                    <td className="tabular px-5 py-3 text-sm text-muted-foreground">
                      {point.refundedKobo > 0 ? formatNaira(point.refundedKobo) : "—"}
                    </td>
                    <td className="tabular px-5 py-3 text-sm text-muted-foreground">
                      {point.platformFeeKobo > 0 ? formatNaira(point.platformFeeKobo) : "—"}
                    </td>
                    <td className="tabular px-5 py-3 text-right text-sm font-semibold text-foreground">
                      {formatNaira(point.netEarningsKobo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
          <CardDescription>
            The individual payments behind the totals above, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentSales.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No payments yet"
              description="When a learner completes checkout, the payment lands here within seconds."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="bg-surface-sunken">
                  <tr className="border-b border-rule">
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Learner</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Course</th>
                    <th scope="col" className="px-5 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th scope="col" className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr
                      key={sale._id}
                      className="border-b border-rule last:border-0 transition-colors hover:bg-surface-sunken"
                    >
                      <td className="tabular px-5 py-3 text-sm text-muted-foreground">
                        {sale.paidAt ? formatAbsoluteDate(sale.paidAt) : "—"}
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground">
                        {sale.buyerName ?? "A learner"}
                      </td>
                      <td className="max-w-56 truncate px-5 py-3 text-sm text-muted-foreground">
                        {sale.courseTitle}
                      </td>
                      <td className="px-5 py-3">
                        {sale.refunded ? (
                          <Badge variant="destructive">Refunded</Badge>
                        ) : (
                          <Badge variant="success">Settled</Badge>
                        )}
                      </td>
                      <td className="tabular px-5 py-3 text-right text-sm font-semibold text-foreground">
                        {formatNaira(sale.amountKobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PayoutAccountSection />

      <Card variant="sunken">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="display-subheading text-[15px] text-foreground">
              How payouts work
            </h2>
          </div>
          <p className="max-w-[70ch] text-sm leading-[1.7] text-muted-foreground">
            These figures are what your courses have <em>earned</em>. Money
            collected through Paystack settles to the platform account, and
            payouts to instructors are arranged manually — nothing here is
            transferred automatically. A refunded purchase is excluded from
            earnings the moment an admin marks it, so the number can go down
            after you have seen it. If a figure looks wrong, the{" "}
            <Link
              href="/dashboard/instructor"
              className="text-brand link-quiet"
            >
              overview
            </Link>{" "}
            shows which course it came from.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button variant="ghost" render={<Link href="/dashboard/instructor/analytics" />}>
          See how learners are doing
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </PageShell>
  );
}
