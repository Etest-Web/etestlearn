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
        <Skeleton className="h-8 w-64" />
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <ShieldAlert className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Admin Only</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This page is restricted to administrators. You do not have
          permission to review instructor applications.
        </p>
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
      case "rejected":
        return (
          <Badge variant="destructive" className="capitalize">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Instructor Applications
        </h2>
        <p className="text-muted-foreground">
          Review and manage instructor applications.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
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

      {/* Applications List */}
      {applications === undefined ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="font-semibold">No applications found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter
                ? `No ${statusFilter} applications at the moment.`
                : "No applications have been submitted yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => (
            <Card key={app._id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {app.fullName}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <Mail className="h-3 w-3" />
                      {app.email}
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
                  <p className="mt-1 text-foreground whitespace-pre-wrap">
                    {app.bio}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">
                    Motivation:
                  </span>
                  <p className="mt-1 text-foreground whitespace-pre-wrap">
                    {app.motivation}
                  </p>
                </div>
                {app.portfolioUrl && (
                  <div className="flex items-center gap-1">
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    <a
                      href={app.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline text-xs"
                    >
                      {app.portfolioUrl}
                    </a>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Applied:{" "}
                  {new Date(app.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>

                {/* Review Note (for already-reviewed) */}
                {app.reviewNote && app.status !== "pending" && (
                  <div className="rounded-md bg-muted/50 p-3 mt-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Admin note:
                    </span>
                    <p className="text-sm mt-1">{app.reviewNote}</p>
                  </div>
                )}
              </CardContent>

              {/* Review Actions (only for pending) */}
              {app.status === "pending" && (
                <CardFooter className="flex flex-col gap-3 border-t pt-4">
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
                          {isProcessing && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
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
                          {isProcessing && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
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
