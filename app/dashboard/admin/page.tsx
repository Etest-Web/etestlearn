"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminGuard } from "@/components/admin-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Award,
  BookOpen,
  Download,
  GraduationCap,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

const QUICK_LINKS = [
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/courses", label: "Courses & review queue", icon: BookOpen },
  { href: "/dashboard/admin/payments", label: "Payments", icon: ShoppingBag },
  { href: "/dashboard/admin/discussions", label: "Discussions", icon: TrendingUp },
  { href: "/dashboard/admin/announcements", label: "Announcements", icon: GraduationCap },
  { href: "/dashboard/admin/audit", label: "Audit log", icon: Award },
];

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function ChartCard({
  title,
  data,
  color,
}: {
  title: string;
  data: { week: string; count: number }[];
  color: string;
}) {
  return (
    <Card className="rounded-2xl p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mb-3 text-xs text-muted-foreground">Last 8 weeks</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <RechartsTooltip
              contentStyle={{
                borderRadius: 8,
                border: "none",
                backgroundColor: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Area type="monotone" dataKey="count" stroke={color} strokeWidth={2} fill={`url(#grad-${title.replace(/\W/g, "")})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function OverviewBody() {
  const overview = useQuery(api.admin.getPlatformOverview);
  const exportUsers = useQuery(api.admin.exportUsers);
  const exportEnrollments = useQuery(api.admin.exportEnrollments);
  const exportPurchases = useQuery(api.admin.exportPurchases);

  if (overview === undefined) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const { totals, series } = overview;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={totals.users} sub={`${totals.instructors} instructors · ${totals.suspendedUsers} suspended`} />
        <StatCard label="Courses" value={totals.publishedCourses} sub={`${totals.courses} total · ${totals.featuredCourses} featured`} />
        <StatCard label="Enrollments" value={totals.enrollments} sub={`${totals.completedEnrollments} completed`} />
        <StatCard
          label="Revenue"
          value={`₦${totals.revenue.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`}
          sub={`${totals.purchases} paid · ${totals.refundedPurchases} refunded`}
        />
        <StatCard label="Certificates" value={totals.certificatesActive} sub={`${totals.certificatesIssued} issued · ${totals.certificatesIssued - totals.certificatesActive} revoked`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="New users" data={series.users} color="var(--brand)" />
        <ChartCard title="Enrollments" data={series.enrollments} color="var(--warning)" />
        <ChartCard title="Purchases" data={series.purchases} color="var(--success)" />
      </div>

      <Card className="rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Reports</p>
            <p className="text-xs text-muted-foreground">
              Download the raw rows behind these numbers (first 5,000 rows each).
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!exportUsers || exportUsers.length === 0}
            onClick={() => downloadCsv("users", exportUsers ?? [])}
          >
            <Download className="mr-2 h-4 w-4" /> Users
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!exportEnrollments || exportEnrollments.length === 0}
            onClick={() => downloadCsv("enrollments", exportEnrollments ?? [])}
          >
            <Download className="mr-2 h-4 w-4" /> Enrollments
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!exportPurchases || exportPurchases.length === 0}
            onClick={() => downloadCsv("purchases", exportPurchases ?? [])}
          >
            <Download className="mr-2 h-4 w-4" /> Purchases
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl p-5">
        <p className="text-sm font-semibold text-foreground">Jump to</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Icon className="h-4 w-4 text-brand" />
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <PageHeader
          title="Platform Overview"
          description="Live totals and 8-week trends across users, courses, enrollments and revenue."
        />
        <OverviewBody />
      </div>
    </AdminGuard>
  );
}