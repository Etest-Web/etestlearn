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
import { EmptyState, PageHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Mail,
  Briefcase,
  ExternalLink,
  Loader2,
  ShieldAlert,
} from "lucide-react";

export default function AdminApplicationsPage() {
  const dbUser = useQuery(api.users.getCurrentUser);
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "rejected" | undefined
  >("pending");
  const applications = useQuery(api.instructorApplications.listApplications, {
    status: statusFilter,
  });
  const reviewApplication = useMutation(
    api.instructorApplications.reviewApplication
  );

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Loading
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

  // Not admin
  if (!dbUser || dbUser.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-md">
        <EmptyState
          icon={ShieldAlert}
          title="Admin only"
          description="This page is restricted to administrators. You do not have permission to review instructor applications."
          tone="warning"
        />
      </div>
    );
  }

  const handleReview = async (
    applicationId: string,
    decision: "approved" | "rejected"
  ) => {
    setIsProcessing(true);
    try {
      await reviewApplication({
        applicationId: applicationId as Id<"instructorApplications">,
        decision,
        reviewNote: reviewNote || undefined,
      });
      toast.success(
        decision === "approved"
          ? "Application approved — user promoted to instructor!"
          : "Application rejected."
      );
      setReviewingId(null);
      setReviewNote("");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to process application.");
    } finally {
      setIsProcessing(false);
    }
  };

  /* Every status carries an icon and a word, so the queue can be read without
     relying on the tint: pending is a recessed plate, approved a hairline, and
     rejected the one destructive plate in the set. */
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
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Instructor Applications"
        description="Review and manage instructor applications."
      />

      {/* Filter strip — wraps so all four stay reachable on a narrow phone, and
          reads as one control so the active filter is unambiguous. */}
      <div
        className="flex w-max gap-0.5 overflow-x-auto rounded-md border border-rule bg-surface-sunken p-0.5"
        role="group"
        aria-label="Filter applications by status"
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

      {/* Applications List */}
      {applications === undefined ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No applications found"
          description={
            statusFilter
              ? `No ${statusFilter} applications at the moment.`
              : "No applications have been submitted yet."
          }
          tone="brand"
        />
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => (
            <Card key={app._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <User aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{app.fullName}</span>
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1">
                      <Mail aria-hidden className="h-3 w-3 shrink-0" />
                      <span className="break-all">{app.email}</span>
                    </CardDescription>
                  </div>
                  {statusBadge(app.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">
                    Area of expertise:
                  </span>{" "}
                  <span>{app.expertise}</span>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Bio:
                  </span>
                  <p className="mt-1 whitespace-pre-wrap leading-[1.6] text-foreground">
                    {app.bio}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Motivation:
                  </span>
                  <p className="mt-1 whitespace-pre-wrap leading-[1.6] text-foreground">
                    {app.motivation}
                  </p>
                </div>
                {app.portfolioUrl && (
                  <div className="flex items-start gap-1">
                    <ExternalLink aria-hidden className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                    <a
                      href={app.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-quiet break-all text-xs text-primary"
                    >
                      {app.portfolioUrl}
                    </a>
                  </div>
                )}
                <p className="tabular text-xs text-muted-foreground">
                  Applied{" "}
                  {new Date(app.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>

                {/* Review Note (for already-reviewed) */}
                {app.reviewNote && app.status !== "pending" && (
                  <div className="mt-2 border border-rule bg-surface-sunken p-3">
                    <span className="eyebrow">Admin note</span>
                    <p className="mt-1 text-sm leading-[1.6]">{app.reviewNote}</p>
                  </div>
                )}
              </CardContent>

              {/* Review Actions (only for pending). Approve and Reject keep
                  their own words, icons and plates — the decision must not rest
                  on a colour difference between two adjacent buttons. */}
              {app.status === "pending" && (
                <CardFooter className="flex-col gap-3">
                  {reviewingId === app._id ? (
                    <>
                      <Textarea
                        placeholder="Add an optional note for the applicant..."
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
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            handleReview(app._id, "rejected")
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          Reject
                        </Button>
                        <Button
                          className="flex-1"
                          size="sm"
                          onClick={() =>
                            handleReview(app._id, "approved")
                          }
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Button
                      className="w-full"
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewingId(app._id)}
                    >
                      Review Application
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