"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye, EyeOff, Megaphone, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ANNOUNCEMENT_LIMITS,
} from "@/lib/announcements";
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
  Textarea,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The instructor's console for a course's announcements.
 *
 * One form does both jobs — the author writes a notice once, and "Edit" loads an
 * existing row back into the same fields rather than opening a second surface
 * that could drift from the first. Publishing is a separate action from saving,
 * because a draft is the default and broadcasting is the deliberate step.
 */
export function CourseAnnouncementsManager({
  courseId,
}: {
  courseId: Id<"courses">;
}) {
  const announcements = useQuery(api.courseAnnouncements.listForAuthor, {
    courseId,
  });
  const create = useMutation(api.courseAnnouncements.create);
  const update = useMutation(api.courseAnnouncements.update);
  const setPublished = useMutation(api.courseAnnouncements.setPublished);
  const remove = useMutation(api.courseAnnouncements.remove);

  const [editingId, setEditingId] = useState<Id<"courseAnnouncements"> | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
  }

  async function save(publish: boolean) {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await update({ announcementId: editingId, title, body });
        if (publish) {
          await setPublished({ announcementId: editingId, published: true });
        }
        toast.success(publish ? "Announcement updated and published" : "Draft updated");
      } else {
        await create({ courseId, title, body, publish });
        toast.success(publish ? "Announcement published" : "Draft saved");
      }
      resetForm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save the announcement",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublished(id: Id<"courseAnnouncements">, published: boolean) {
    try {
      await setPublished({ announcementId: id, published });
      toast.success(published ? "Published" : "Moved back to draft");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function handleRemove(id: Id<"courseAnnouncements">) {
    try {
      await remove({ announcementId: id });
      if (editingId === id) resetForm();
      toast.success("Announcement deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-brand" aria-hidden />
            {editingId ? "Edit announcement" : "New announcement"}
          </CardTitle>
          <CardDescription>
            Published notices appear on this course&apos;s page for every enrolled
            learner. Drafts stay private to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="course-announcement-title">Title</Label>
            <Input
              id="course-announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={ANNOUNCEMENT_LIMITS.title}
              placeholder="Live session moved to Thursday"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-announcement-body">Message</Label>
            <Textarea
              id="course-announcement-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={ANNOUNCEMENT_LIMITS.body}
              rows={6}
              placeholder="What this cohort should know…"
            />
            <p className="text-xs text-muted-foreground">
              {body.length}/{ANNOUNCEMENT_LIMITS.body}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => save(false)}
              variant="outline"
              disabled={!canSubmit || submitting}
            >
              {editingId ? "Save changes" : "Save draft"}
            </Button>
            <Button onClick={() => save(true)} disabled={!canSubmit || submitting}>
              {editingId ? "Save & publish" : "Publish now"}
            </Button>
            {editingId ? (
              <Button variant="ghost" onClick={resetForm} disabled={submitting}>
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            Posted notices (
            <span className="tabular">{announcements?.length ?? 0}</span>)
          </CardTitle>
          <CardDescription>Newest first. Drafts are only visible to you.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {announcements === undefined ? (
            <div className="p-5">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : announcements.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              tone="brand"
              title="No announcements yet"
              description="Write one on the left to tell this cohort about a schedule change, a new resource, or anything else they should not miss."
            />
          ) : (
            <ul className="divide-y divide-rule">
              {announcements.map((announcement) => (
                <li key={announcement._id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {announcement.title}
                        </p>
                        {announcement.published ? (
                          <Badge variant="success">Published</Badge>
                        ) : (
                          <Badge variant="secondary">Draft</Badge>
                        )}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {announcement.body}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {announcement.published
                          ? `Published ${new Date(
                              announcement.publishedAt ?? announcement.createdAt,
                            ).toLocaleDateString("en-NG", { dateStyle: "medium" })}`
                          : `Draft saved ${new Date(
                              announcement.updatedAt,
                            ).toLocaleDateString("en-NG", { dateStyle: "medium" })}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          togglePublished(announcement._id, !announcement.published)
                        }
                      >
                        {announcement.published ? (
                          <>
                            <EyeOff className="h-4 w-4" aria-hidden />
                            Unpublish
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4" aria-hidden />
                            Publish
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(announcement._id);
                          setTitle(announcement.title);
                          setBody(announcement.body);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemove(announcement._id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
