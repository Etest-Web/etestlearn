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
        <Skeleton className="h-8 w-64" />
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <ShieldAlert className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Only</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page is restricted to administrators. You do not have permission
          to review unpublish requests.
        </p>
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

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="capitalize">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 capitalize">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive" className="capitalize">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Unpublish Requests
        </h2>
        <p className="text-muted-foreground">
          Instructors cannot take a course that learners have already paid for
          off sale on their own. Approving a request here takes the course down;
          rejecting it leaves it selling.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
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
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
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
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <EyeOff className="mb-4 h-10 w-10 text-muted-foreground" />
            <h3 className="font-semibold">Nothing to review</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {statusFilter
                ? `No ${statusFilter} requests at the moment.`
                : "No instructor has asked to unpublish a sold course."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span className="truncate">
                        {request.course?.title ?? "Course no longer exists"}
                      </span>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          {request.requester?.name ??
                            request.requester?.email ??
                            "Unknown instructor"}
                        </span>
                        <span>
                          {request.paidSales} paid sale
                          {request.paidSales === 1 ? "" : "s"} affected
                        </span>
                        {request.course && (
                          <a
                            href={`/courses/${request.course.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline"
                          >
                            <ExternalLink className="h-3 w-3" />
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
                <div className="text-xs text-muted-foreground">
                  Requested{" "}
                  {new Date(request.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>

                {request.reason ? (
                  <div>
                    <span className="font-medium text-muted-foreground">
                      Instructor&apos;s reason:
                    </span>{" "}
                    <p className="mt-1 whitespace-pre-wrap text-foreground">
                      {request.reason}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No reason given.
                  </p>
                )}

                {request.reviewNote && request.status !== "pending" && (
                  <div className="mt-2 rounded-md bg-muted/50 p-3">
                    <span className="text-xs font-medium text-muted-foreground">
                      Admin note:
                    </span>
                    <p className="mt-1 text-sm">{request.reviewNote}</p>
                  </div>
                )}
              </CardContent>

              {request.status === "pending" && (
                <CardFooter className="flex-col gap-3 border-t pt-4">
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
                          {isProcessing && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
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
                          {isProcessing && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
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