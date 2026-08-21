"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { Badge } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

function roleBadgeClass(role: string) {
  switch (role) {
    case "admin":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "instructor":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export default function AdminUsersPage() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const users = useQuery(api.users.listAllUsers);
  const setUserRole = useMutation(api.users.setUserRole);

  if (currentUser === undefined || (users === undefined && currentUser?.role === "admin")) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldAlert className="h-12 w-12 text-red-400 mx-auto" />
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="text-sm text-muted-foreground">Admins only.</p>
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
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UsersIcon className="h-6 w-6" /> Admin Console
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage platform users and their roles. Instructor applications live in{" "}
          <a href="/dashboard/admin/applications" className="text-[#5340FF] hover:underline">Applications</a>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users?.length ?? 0})</CardTitle>
          <CardDescription>Changing a role takes effect immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-3 pr-4">User</th>
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3">Change role</th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u._id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{u.name ?? "Unnamed user"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={roleBadgeClass(u.role)}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-3">
                      {u._id === currentUser._id ? (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      ) : (
                        <Select
                          defaultValue={u.role}
                          onValueChange={(role) => {
                            if (role) handleRoleChange(u._id, role);
                          }}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
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
