"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui";
import { Textarea } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Loader2,
  ShieldAlert,
  ExternalLink,
  EyeOff,
} from "lucide-react";

type Decision = "approved" | "rejected";

export default function AdminUnpublishRequestsPage() {
  const dbUser = useQuery(api.users.getCurrentUser);
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "rejected" | undefined
  >("pending");
  const requests = useQuery(api.courses.listUnpublishRequests, {
    status: statusFilter,
  });
  const reviewRequest = useMutation(api.courses.reviewUnpublishRequest);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (dbUser === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!dbUser || dbUser.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-md">
        <EmptyState
          icon={ShieldAlert}
          title="Admin only"
          description="This page is restricted to administrators. You do not have permission to review unpublish requests."
          tone="warning"
        />
      </div>
    );
  }

  const handleReview = async (requestId: string, decision: Decision) => {
    setIsProcessing(true);
    try {
      await reviewRequest({
        requestId: requestId as Id<"courseUnpublishRequests">,
        decision,
        reviewNote: reviewNote || undefined,
      });
      toast.success(
        decision === "approved"
          ? "Approved — the course is now off sale."
          : "Request rejected — the course stays on sale."
      );
      setReviewingId(null);
      setReviewNote("");
    } catch (error: unknown) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to process the request.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  /* Icon plus word on every status: this queue decides whether a paid course
     stays on sale, so the state must survive a greyscale print and a
     colour-blind reader. */
  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Unpublish Requests"
        description="Instructors cannot take a course that learners have already paid for off sale on their own. Approving a request here takes the course down; rejecting it leaves it selling."
      />

      <div
        className="flex w-max gap-0.5 overflow-x-auto rounded-md border border-rule bg-surface-sunken p-0.5"
        role="group"
        aria-label="Filter unpublish requests by status"
      >
        {(
          [
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: undefined, label: "All" },
          ] as const
        ).map((filter) => (
          <Button
            key={filter.label}
            aria-pressed={statusFilter === filter.value}
            variant={statusFilter === filter.value ? "secondary" : "ghost"}
            size="sm"
            className="rounded-sm"
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {requests === undefined ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={EyeOff}
          title="Nothing to review"
          description={
            statusFilter
              ? `No ${statusFilter} requests at the moment.`
              : "No instructor has asked to unpublish a sold course."
          }
          tone="brand"
        />
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>
                      <span className="truncate">
                        {request.course?.title ?? "Course no longer exists"}
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <User aria-hidden className="h-3 w-3 shrink-0" />
                          {request.requester?.name ??
                            request.requester?.email ??
                            "Unknown instructor"}
                        </span>
                        <span>
                          <span className="tabular">{request.paidSales}</span> paid sale
                          {request.paidSales === 1 ? "" : "s"} affected
                        </span>
                        {request.course && (
                          <a
                            href={`/courses/${request.course.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary link-quiet"
                          >
                            <ExternalLink aria-hidden className="h-3 w-3" />
                            View listing
                          </a>
                        )}
                      </span>
                    </CardDescription>
                  </div>
                  {statusBadge(request.status)}
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <p className="tabular text-xs text-muted-foreground">
                  Requested{" "}
                  {new Date(request.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>

                {request.reason ? (
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Instructor&apos;s reason:
                    </span>
                    <p className="mt-1 whitespace-pre-wrap leading-[1.6] text-foreground">
                      {request.reason}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No reason given.
                  </p>
                )}

                {request.reviewNote && request.status !== "pending" && (
                  <div className="mt-2 border border-rule bg-surface-sunken p-3">
                    <span className="eyebrow">Admin note</span>
                    <p className="mt-1 text-sm leading-[1.6]">{request.reviewNote}</p>
                  </div>
                )}
              </CardContent>

              {/* Unpublish takes a sold course off sale, so it is the
                  destructive plate and the only filled button in the row; "Keep
                  live" is outlined. The two words are what actually tell an
                  admin which is which. */}
              {request.status === "pending" && (
                <CardFooter className="flex-col gap-3">
                  {reviewingId === request._id ? (
                    <>
                      <Textarea
                        placeholder="Optional note for the instructor..."
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        rows={2}
                        className="w-full"
                      />
                      <div className="flex w-full gap-2">
                        <Button
                          className="flex-1"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReviewingId(null);
                            setReviewNote("");
                          }}
                          disabled={isProcessing}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1"
                          variant="outline"
                          size="sm"
                          onClick={() => handleReview(request._id, "rejected")}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Keep live
                        </Button>
                        <Button
                          className="flex-1"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleReview(request._id, "approved")}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                          Unpublish
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      className="w-full"
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewingId(request._id)}
                    >
                      Review request
                    </Button>
                  )}
                </CardFooter>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}