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
  Textarea,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Search, Star, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";

function formatNaira(kobo: number) {
  if (!kobo) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function CoursesBody() {
  const courses = useQuery(api.courses.adminListCourses);
  const bulkSetPublished = useMutation(api.courses.bulkSetPublished);
  const setFeatured = useMutation(api.courses.setFeatured);
  const reviewRequests = useQuery(api.courses.listPublishReviewRequests);
  const reviewPublishRequest = useMutation(api.courses.reviewPublishRequest);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewNote, setReviewNote] = useState("");

  const filtered = useMemo(() => {
    if (!courses) return [];
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.instructor ?? "").toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q),
    );
  }, [courses, search]);

  if (courses === undefined || reviewRequests === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  function toggle(courseId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  async function applyBulk(published: boolean) {
    try {
      const result = await bulkSetPublished({
        courseIds: [...selected] as never[],
        published,
      });
      toast.success(
        `${published ? "Published" : "Unpublished"} ${result.changed} course${result.changed === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    }
  }

  async function handleFeature(courseId: string, featured: boolean) {
    try {
      await setFeatured({ courseId: courseId as never, featured });
      toast.success(featured ? "Course featured" : "Course removed from featured");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function review(requestId: string, decision: "approved" | "rejected") {
    try {
      await reviewPublishRequest({
        requestId: requestId as never,
        decision,
        reviewNote: reviewNote.trim() || undefined,
      });
      toast.success(decision === "approved" ? "Course approved and published" : "Review rejected");
      setReviewNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Review failed");
    }
  }

  return (
    <div className="space-y-6">
      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            Publish review queue (<span className="tabular">{reviewRequests.length}</span>)
          </CardTitle>
          <CardDescription>
            Instructors who asked for admin sign-off before going live. Approval publishes
            immediately; rejection returns the course to draft with your note.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {reviewRequests.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No courses are waiting for review.
            </p>
          ) : (
            <ul className="divide-y divide-rule">
              {reviewRequests.map((request) => (
                <li key={request._id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="font-semibold">{request.courseTitle ?? "Unknown course"}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {request.requesterName ?? "unknown"} ·{" "}
                      {new Date(request.createdAt).toLocaleDateString("en-NG")}
                    </p>
                    {request.note && (
                      <p className="mt-1.5 max-w-xl rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                        “{request.note}”
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder="Optional note to the instructor…"
                      className="w-full min-w-[200px] sm:w-[240px]"
                    />
                    <Button size="sm" onClick={() => review(request._id, "approved")}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => review(request._id, "rejected")}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            All courses (<span className="tabular">{courses.length}</span>)
          </CardTitle>
          <CardDescription>
            Bulk publish/unpublish and the featured flag that leads the public catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-rule p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, instructor or category…"
                className="pl-9"
              />
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  {selected.size} selected
                </span>
                <Button size="sm" onClick={() => applyBulk(true)}>
                  Publish
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyBulk(false)}>
                  Unpublish
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">
                Every course with instructor, price, sales, publish state and featured flag.
              </caption>
              <thead>
                <tr className="border-b border-rule bg-surface-sunken">
                  <th scope="col" className="w-10 px-3 py-2.5 pl-5" />
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Course</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Instructor</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Price</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Sales</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-left">Status</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 pr-5 text-right">Featured</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((course) => (
                  <tr
                    key={course._id}
                    className="border-b border-rule transition-colors last:border-0 hover:bg-surface-sunken/60"
                  >
                    <td className="px-3 py-2.5 pl-5">
                      <Checkbox
                        aria-label={`Select ${course.title}`}
                        checked={selected.has(course._id)}
                        onCheckedChange={() => toggle(course._id)}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{course.title}</p>
                      <p className="text-xs text-muted-foreground">{course.category ?? "Uncategorized"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{course.instructor ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatNaira(course.price)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{course.paidSales}</td>
                    <td className="px-3 py-2.5">
                      {course.published ? (
                        <Badge className="bg-success/10 text-success">Published</Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 pr-5 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                          course.featured
                            ? `Remove ${course.title} from featured`
                            : `Feature ${course.title}`
                        }
                        onClick={() => handleFeature(course._id, !course.featured)}
                      >
                        <Star
                          className={
                            course.featured
                              ? "h-4 w-4 fill-warning text-warning"
                              : "h-4 w-4 text-muted-foreground"
                          }
                        />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No courses match “{search}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-rule px-5 py-3 text-xs text-muted-foreground">
            <Undo2 className="h-3.5 w-3.5" />
            Unpublishing a sold course as an admin is always allowed and audited per course.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminCoursesPage() {
  return (
    <AdminGuard>
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <PageHeader
          title="Courses"
          description="Moderate listings: review queue, bulk publish actions, and the featured catalog order."
        />
        <CoursesBody />
      </div>
    </AdminGuard>
  );
}