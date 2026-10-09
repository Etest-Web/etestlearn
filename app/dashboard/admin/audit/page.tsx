"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminGuard } from "@/components/role-guard";
import { PageShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, Card, EmptyState, Input } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText } from "lucide-react";

function formatDetails(details: unknown): string {
  if (details === null || details === undefined) return "";
  try {
    return JSON.stringify(details, null, 0);
  } catch {
    return String(details);
  }
}

function AuditBody() {
  const [action, setAction] = useState("");
  const logs = useQuery(api.auditLogs.listAuditLogs, {
    action: action.trim() || undefined,
    limit: 100,
  });

  if (logs === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  return (
    <Card className="gap-0 rounded-2xl p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule p-4">
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action, e.g. user.set_role or purchase.refund"
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Showing the {logs.length} most recent entries (max 100).
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">
            Append-only audit trail of privileged actions, newest first.
          </caption>
          <thead>
            <tr className="border-b border-rule bg-surface-sunken">
              <th scope="col" className="eyebrow px-3 py-2.5 pl-5 text-left">When</th>
              <th scope="col" className="eyebrow px-3 py-2.5 text-left">Actor</th>
              <th scope="col" className="eyebrow px-3 py-2.5 text-left">Action</th>
              <th scope="col" className="eyebrow px-3 py-2.5 text-left">Target</th>
              <th scope="col" className="eyebrow px-3 py-2.5 pr-5 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log._id}
                className="border-b border-rule transition-colors last:border-0 hover:bg-surface-sunken/60"
              >
                <td className="whitespace-nowrap px-3 py-2.5 pl-5 text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("en-NG")}
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium">{log.actor?.name ?? "Deleted user"}</p>
                  <p className="text-xs text-muted-foreground">{log.actor?.email ?? ""}</p>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {log.action}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {log.targetType ?? "—"}
                  {log.targetId ? <span className="block max-w-[140px] truncate font-mono">{log.targetId}</span> : null}
                </td>
                <td className="max-w-[280px] px-3 py-2.5 pr-5">
                  <code className="block break-all text-[11px] text-muted-foreground">
                    {formatDetails(log.details) || "—"}
                  </code>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                {/* `EmptyState` carries its own rules above and below; inside a
                    `td` they would draw across the whole row, so the border is
                    dropped here and the cell keeps the table's padding. */}
                <td colSpan={5} className="p-0">
                  <EmptyState
                    icon={ScrollText}
                    className="border-y-0"
                    title={
                      action.trim()
                        ? "No matching entries"
                        : "No audit entries yet"
                    }
                    description={
                      action.trim()
                        ? `Nothing recorded for “${action.trim()}”.`
                        : "Privileged actions — role changes, suspensions, refunds, moderation, publishing — are appended here as they happen."
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function AdminAuditPage() {
  return (
    <AdminGuard>
      <PageShell>
        <PageHeader
          title="Audit Log"
          description="Append-only record of privileged actions: role changes, suspensions, refunds, moderation and publishing decisions."
        />
        <AuditBody />
      </PageShell>
    </AdminGuard>
  );
}