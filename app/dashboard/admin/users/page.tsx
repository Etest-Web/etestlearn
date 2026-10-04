"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminGuard } from "@/components/admin-guard";
import { PageHeader } from "@/components/ui/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui";
import { Ban, Eye, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Role = "student" | "instructor" | "admin";

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin":
      return "default";
    case "instructor":
      return "secondary";
    default:
      return "outline";
  }
}

function formatNaira(naira: number) {
  return `₦${naira.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function UsersBody() {
  const users = useQuery(api.users.listAllUsers);
  const setUserRole = useMutation(api.users.setUserRole);
  const bulkSetRoles = useMutation(api.admin.bulkSetRoles);
  const suspendUser = useMutation(api.admin.suspendUser);
  const unsuspendUser = useMutation(api.admin.unsuspendUser);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<Role | "">("");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const detail = useQuery(
    api.admin.getUserDetail,
    detailUserId ? { userId: detailUserId as never } : "skip",
  );

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        u.role.includes(q),
    );
  }, [users, search]);

  if (users === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function applyBulkRole() {
    if (!bulkRole) return;
    try {
      const result = await bulkSetRoles({
        assignments: [...selected].map((userId) => ({ userId: userId as never, role: bulkRole })),
      });
      toast.success(`Updated ${result.changed} user${result.changed === 1 ? "" : "s"} to ${bulkRole}`);
      setSelected(new Set());
      setBulkRole("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  }

  async function handleSuspend(userId: string, suspended: boolean) {
    try {
      if (suspended) {
        await unsuspendUser({ userId: userId as never });
        toast.success("User reinstated");
      } else {
        await suspendUser({ userId: userId as never });
        toast.success("User suspended — they now read as signed out platform-wide");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            All users (<span className="tabular">{users.length}</span>)
          </CardTitle>
          <CardDescription>
            Role changes and suspensions take effect immediately and are audited.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or role…"
                className="pl-9"
              />
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {selected.size} selected
                </span>
                <Select value={bulkRole} onValueChange={(role) => setBulkRole(role as Role)}>
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue placeholder="Set role…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="instructor">Instructor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={applyBulkRole} disabled={!bulkRole}>
                  Apply
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">
                Every user on the platform with role, suspension state and admin actions.
              </caption>
              <thead>
                <tr className="border-b border-rule bg-surface-sunken">
                  <th scope="col" className="w-10 px-3 py-2.5 pl-5" />
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">User</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Role</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Status</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Change role</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u._id}
                    className="border-b border-rule transition-colors last:border-0 hover:bg-surface-sunken/60"
                  >
                    <td className="px-3 py-2.5 pl-5">
                      <Checkbox
                        aria-label={`Select ${u.name ?? u.email ?? "user"}`}
                        checked={selected.has(u._id)}
                        onCheckedChange={() => toggle(u._id)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          {u.imageUrl ? <AvatarImage src={u.imageUrl} alt="" /> : null}
                          <AvatarFallback>
                            {(u.name ?? "?").slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{u.name ?? "Unnamed user"}</span>
                          <span className="truncate text-xs text-muted-foreground">{u.email ?? "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {u.suspendedAt !== undefined ? (
                        <Badge variant="destructive" className="bg-destructive/10 text-destructive">
                          Suspended
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Active</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Select
                        defaultValue={u.role}
                        onValueChange={async (role) => {
                          if (!role) return;
                          try {
                            await setUserRole({
                              userId: u._id,
                              role: role as Role,
                            });
                            toast.success(`Role updated to ${role}`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to update role");
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="student">Student</SelectItem>
                          <SelectItem value="instructor">Instructor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 pr-5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View details for ${u.name ?? "user"}`}
                          onClick={() => setDetailUserId(u._id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {u.suspendedAt !== undefined ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSuspend(u._id, true)}
                          >
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Reinstate
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleSuspend(u._id, false)}
                          >
                            <Ban className="mr-1.5 h-3.5 w-3.5" /> Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No users match “{search}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={detailUserId !== null} onOpenChange={(open) => !open && setDetailUserId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>User details</SheetTitle>
            <SheetDescription>Enrollments, purchases, certificates and quiz history.</SheetDescription>
          </SheetHeader>
          {detail === undefined ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : detail === null ? (
            <p className="p-4 text-sm text-muted-foreground">User not found.</p>
          ) : (
            <div className="space-y-5 p-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  {detail.user.imageUrl ? (
                    <AvatarImage src={detail.user.imageUrl} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {(detail.user.name ?? "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{detail.user.name ?? "Unnamed user"}</p>
                  <p className="text-xs text-muted-foreground">{detail.user.email ?? "—"}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge variant={roleBadgeVariant(detail.user.role)}>{detail.user.role}</Badge>
                    {detail.user.suspendedAt !== null && (
                      <Badge variant="destructive" className="bg-destructive/10 text-destructive">
                        Suspended
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <section>
                <p className="eyebrow mb-2">Enrollments ({detail.enrollments.length})</p>
                <ul className="space-y-1.5">
                  {detail.enrollments.slice(0, 8).map((e) => (
                    <li key={e.courseId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{e.courseTitle ?? "Unknown course"}</span>
                      <span className="ml-2 shrink-0 tabular-nums text-xs text-muted-foreground">
                        {e.progressPercent}%
                      </span>
                    </li>
                  ))}
                  {detail.enrollments.length === 0 && (
                    <li className="text-sm text-muted-foreground">No enrollments.</li>
                  )}
                </ul>
              </section>

              <section>
                <p className="eyebrow mb-2">Purchases ({detail.purchases.length})</p>
                <ul className="space-y-1.5">
                  {detail.purchases.slice(0, 8).map((p) => (
                    <li key={p.reference} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{p.courseTitle ?? "Unknown course"}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-1.5">
                        <span className="tabular-nums text-xs">{formatNaira(p.amount)}</span>
                        <Badge
                          variant="outline"
                          className={
                            p.refundedAt
                              ? "text-destructive"
                              : p.status === "paid"
                                ? "text-success"
                                : "text-muted-foreground"
                          }
                        >
                          {p.refundedAt ? "refunded" : p.status}
                        </Badge>
                      </span>
                    </li>
                  ))}
                  {detail.purchases.length === 0 && (
                    <li className="text-sm text-muted-foreground">No purchases.</li>
                  )}
                </ul>
              </section>

              <section>
                <p className="eyebrow mb-2">Certificates ({detail.certificates.length})</p>
                <ul className="space-y-1.5">
                  {detail.certificates.slice(0, 8).map((c) => (
                    <li key={c.serial ?? c.issuedAt} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{c.courseTitle ?? "Unknown course"}</span>
                      <Badge
                        variant="outline"
                        className={c.revokedAt ? "text-destructive" : "text-success"}
                      >
                        {c.revokedAt ? "revoked" : "active"}
                      </Badge>
                    </li>
                  ))}
                  {detail.certificates.length === 0 && (
                    <li className="text-sm text-muted-foreground">No certificates.</li>
                  )}
                </ul>
              </section>

              <section>
                <p className="eyebrow mb-2">Quizzes</p>
                <p className="text-sm text-muted-foreground">
                  {detail.quizAttempts.total} attempts · {detail.quizAttempts.passed} passed
                </p>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <PageHeader
          title="Users"
          description={
            <>
              Search, promote, suspend and inspect platform accounts. Applications live in{" "}
              <a href="/dashboard/admin/applications" className="link-quiet text-primary">Applications</a>.
            </>
          }
        />
        <UsersBody />
      </div>
    </AdminGuard>
  );
}