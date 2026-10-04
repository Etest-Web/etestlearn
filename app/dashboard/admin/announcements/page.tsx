"use client";

import { useState } from "react";
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
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";

function AnnouncementsBody() {
  const announcements = useQuery(api.announcements.listAll);
  const create = useMutation(api.announcements.create);
  const setActive = useMutation(api.announcements.setActive);
  const remove = useMutation(api.announcements.remove);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  if (announcements === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  async function handleCreate(activate: boolean) {
    try {
      await create({ title, body, activate });
      toast.success(activate ? "Announcement published" : "Announcement saved as inactive");
      setTitle("");
      setBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create announcement");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card className="rounded-2xl p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-brand" /> New announcement
        </CardTitle>
        <CardDescription className="mt-1">
          Shows as a banner on the learner dashboard while active.
        </CardDescription>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Maintenance window on Sunday"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-body">Body</Label>
            <Textarea
              id="announcement-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="What learners should know…"
            />
            <p className="text-xs text-muted-foreground">{body.length}/2000</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleCreate(true)} disabled={!title.trim() || !body.trim()}>
              Publish now
            </Button>
            <Button
              variant="outline"
              onClick={() => handleCreate(false)}
              disabled={!title.trim() || !body.trim()}
            >
              Save inactive
            </Button>
          </div>
        </div>
      </Card>

      <Card className="gap-0 rounded-2xl p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            All announcements (<span className="tabular">{announcements.length}</span>)
          </CardTitle>
          <CardDescription>The dashboard banner shows the newest active one.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-rule">
            {announcements.map((announcement) => (
              <li key={announcement._id} className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{announcement.title}</p>
                    {announcement.active ? (
                      <Badge className="bg-success/10 text-success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{announcement.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(announcement.createdAt).toLocaleString("en-NG")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await setActive({
                          announcementId: announcement._id,
                          active: !announcement.active,
                        });
                        toast.success(announcement.active ? "Deactivated" : "Activated");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Action failed");
                      }
                    }}
                  >
                    {announcement.active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => {
                      try {
                        await remove({ announcementId: announcement._id });
                        toast.success("Deleted");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Delete failed");
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
            {announcements.length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">
                Nothing published yet.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <PageHeader
          title="Announcements"
          description="Platform-wide notices rendered on every learner's dashboard."
        />
        <AnnouncementsBody />
      </div>
    </AdminGuard>
  );
}