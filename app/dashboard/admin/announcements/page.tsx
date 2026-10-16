"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {  } from "@/components/role-guard";
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
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_LIMITS,
  audienceLabel,
  normalizeAudience,
  type AnnouncementAudience,
} from "@/lib/announcements";
import { getErrorMessage } from "@/lib/errors";

function AnnouncementsBody() {
  const announcements = useQuery(api.announcements.listAll);
  const create = useMutation(api.announcements.create);
  const setActive = useMutation(api.announcements.setActive);
  const setAudience = useMutation(api.announcements.setAudience);
  const remove = useMutation(api.announcements.remove);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Named `setAudienceChoice` to leave `setAudience` to the mutation above.
  const [audience, setAudienceChoice] = useState<AnnouncementAudience>("everyone");

  if (announcements === undefined) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  async function handleCreate(activate: boolean) {
    try {
      await create({ title, body, activate, audience });
      toast.success(
        activate
          ? `Announcement published to ${audienceLabel(audience).toLowerCase()}`
          : "Announcement saved as inactive",
      );
      setTitle("");
      setBody("");
      setAudienceChoice("everyone");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not create announcement"));
    }
  }

  async function handleAudienceChange(id: Id<"announcements">, next: AnnouncementAudience) {
    try {
      await setAudience({ announcementId: id, audience: next });
      toast.success(`Now shown to ${audienceLabel(next).toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the audience");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card className="rounded-2xl p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-brand" /> New announcement
        </CardTitle>
        <CardDescription className="mt-1">
          Shows as a banner on the dashboards of whoever the audience covers,
          while active.
        </CardDescription>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={ANNOUNCEMENT_LIMITS.title}
              placeholder="Maintenance window on Sunday"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-body">Body</Label>
            <Textarea
              id="announcement-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={ANNOUNCEMENT_LIMITS.body}
              rows={5}
              placeholder="What learners should know…"
            />
            <p className="text-xs text-muted-foreground">
              {body.length}/{ANNOUNCEMENT_LIMITS.body}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-audience">Audience</Label>
            <Select
              value={audience}
              onValueChange={(value) => setAudienceChoice(normalizeAudience(value))}
            >
              <SelectTrigger id="announcement-audience">
                <SelectValue placeholder="Select an audience" />
              </SelectTrigger>
              <SelectContent>
                {ANNOUNCEMENT_AUDIENCES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                ANNOUNCEMENT_AUDIENCES.find((option) => option.value === audience)
                  ?.description
              }
            </p>
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
          <CardDescription>
            Each dashboard shows the newest active announcement its audience
            covers.
          </CardDescription>
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
                  <div className="mt-2 max-w-[16rem]">
                    <Label
                      htmlFor={`audience-${announcement._id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Audience
                    </Label>
                    <Select
                      value={normalizeAudience(announcement.audience)}
                      onValueChange={(value) =>
                        handleAudienceChange(announcement._id, normalizeAudience(value))
                      }
                    >
                      <SelectTrigger id={`audience-${announcement._id}`} className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANNOUNCEMENT_AUDIENCES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        toast.error(getErrorMessage(err, "Action failed"));
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
                        toast.error(getErrorMessage(err, "Delete failed"));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
            {announcements.length === 0 && (
              <li>
                <EmptyState
                  icon={Megaphone}
                  tone="brand"
                  title="Nothing published yet"
                  description="An announcement appears as a dismissible banner on the dashboards it targets. Write one above to broadcast it."
                />
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
    <>
      <PageShell>
        <PageHeader
          title="Announcements"
          description="Platform notices rendered as a dashboard banner, targeted at everyone, learners, or instructors."
        />
        <AnnouncementsBody />
      </PageShell>
    </>
  );
}
