"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

/** The three Badge variants this page draws from; see the note above. */
type RoleBadgeVariant = "default" | "secondary" | "outline";

/**
 * Role reads as a word inside the pill, so the variant only has to separate the
 * three at a glance. Admin takes the brand plate because it is the privileged
 * one; instructor and student are distinguished by fill vs. hairline.
 */
function roleBadgeVariant(role: string): RoleBadgeVariant {
  switch (role) {
    case "admin":
      return "default";
    case "instructor":
      return "secondary";
    default:
      return "outline";
  }
}

export default function AdminUsersPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const users = useQuery(api.users.listAllUsers);
  const setUserRole = useMutation(api.users.setUserRole);

  if (currentUser === undefined || (users === undefined && currentUser?.role === "admin")) {
    return (
      <div className="max-w-5xl mx-auto w-full space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="mx-auto mt-16 w-full max-w-md">
        <EmptyState
          icon={ShieldAlert}
          title="Access denied"
          description="This console is for administrators. Your account does not have access to it."
          tone="warning"
        />
      </div>
    );
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await setUserRole({ userId: userId as never, role: role as "student" | "instructor" | "admin" });
      toast.success(`Role updated to ${role}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8">
      <PageHeader
        title="Admin Console"
        description={
          <>
            Manage platform users and their roles. Instructor applications live in{" "}
            <a href="/dashboard/admin/applications" className="link-quiet text-primary">Applications</a>,
            and instructors asking to take a paid course off sale queue in{" "}
            <a href="/dashboard/admin/unpublish-requests" className="link-quiet text-primary">Unpublish Requests</a>.
          </>
        }
      />

      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            All users (<span className="tabular">{users?.length ?? 0}</span>)
          </CardTitle>
          <CardDescription>Changing a role takes effect immediately.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">
                Every user on the platform, with their role and a control to change it.
              </caption>
              <thead>
                {/* A recessed head rather than a heavy border: the column labels
                    sit on a sunken plane so the rules below do the dividing. */}
                <tr className="border-b border-rule bg-surface-sunken">
                  <th scope="col" className="eyebrow px-3 py-2.5 pl-5 text-left">User</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Email</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Role</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 pr-5 text-left">Change role</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr
                    key={u._id}
                    className="border-b border-rule transition-colors last:border-0 hover:bg-surface-sunken/60"
                  >
                    <td className="px-3 py-2.5 pl-5 font-medium">{u.name ?? "Unnamed user"}</td>
                    <td className="px-3 py-2.5 break-all text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
                    </td>
                    <td className="px-3 py-2.5 pr-5">
                      {u._id === currentUser._id ? (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      ) : (
                        <Select
                          defaultValue={u.role}
                          onValueChange={(role) => {
                            if (role) handleRoleChange(u._id, role);
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
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}