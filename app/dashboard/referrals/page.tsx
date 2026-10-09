"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Copy, Gift, Users, UserPlus, UserCheck, Clock, Calendar, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { PageShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { cn } from "@/lib/utils";

/**
 * The learner's referral hub.
 *
 * Two tabs: "Overview" (code, stats, link, recent conversions) and "Rewards"
 * (the list of available referral credits). The UI reflects the schema in
 * `convex/referrals.ts`.
 */
export default function ReferrerPage() {
  return (
    <RoleGuard allow={(role) => role === "student" || role === "instructor" || role === "admin"}>
      <ReferrerPageContent />
    </RoleGuard>
  );
}

function ReferrerPageContent() {
  const summary = useQuery(api.referrals.getMyReferralSummary, {});
  const settings = useQuery(api.referrals.getSettings, {});

  if (summary === undefined || settings === undefined) {
    return <ReferrerSkeleton />;
  }

  const code = summary.code;
  const shareLink = code ? `${window.location.origin}/?ref=${code}` : "";

  return (
    <PageShell width="narrow" className="gap-6">
      <PageHeader
        title="Referrals"
        description={
          "Share your code to earn credits for your next paid course. Every successful referral gives you a discount on your next purchase."
        }
      />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Share code card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-brand/10 p-2 rounded-lg">
                  <Copy className="h-5 w-5 text-brand" />
                </div>
                <div>
                  <CardTitle>Your Referral Code</CardTitle>
                  <CardDescription>
                    This code lets people access your referral link. Anyone you invite can use your code on checkout.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {code ? (
                <div className="flex items-center gap-3">
                  <div className="font-mono text-lg font-semibold bg-muted px-4 py-3 rounded-md flex-1 text-center">
                    {code}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(code);
                      toast.success("Code copied to clipboard");
                    }}
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    You haven't generated a referral code yet.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Navigate to settings to generate referral code
                      window.location.href = "/dashboard/settings?tab=referral";
                    }}
                  >
                    Generate Code
                  </Button>
                </div>
              )}

              {code && (
                <div className="pt-2">
                  <div className="text-sm font-medium mb-2">Share this link</div>
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-sm bg-muted px-3 py-2 rounded flex-1 truncate">
                      {shareLink}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(shareLink);
                        toast.success("Link copied to clipboard");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        window.open(shareLink, "_blank");
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-brand/10 p-2 rounded-lg">
                    <UserPlus className="h-4 w-4 text-brand" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary.invitedCount}</div>
                    <div className="text-sm text-muted-foreground">Invited</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-success/10 p-2 rounded-lg">
                    <UserCheck className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary.convertedCount}</div>
                    <div className="text-sm text-muted-foreground">Converted</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Gift className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{(summary.totalRewardKobo / 1000).toFixed(1)}₦</div>
                    <div className="text-sm text-muted-foreground">Total earned</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="bg-warning/10 p-2 rounded-lg">
                    <Clock className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{(summary.availableCreditKobo / 1000).toFixed(1)}₦</div>
                    <div className="text-sm text-muted-foreground">Available credit</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent conversions */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-muted p-2 rounded-lg">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Recent Conversions</CardTitle>
                  <CardDescription>
                    People who've enrolled using your referral code.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {summary.recent.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-2">No conversions yet.</p>
                  <p className="text-sm text-muted-foreground">
                    Share your code and someone will get their first course free!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.recent.map((conv) => (
                    <div
                      key={conv._id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-brand/10 p-2 rounded-full">
                          <UserPlus className="h-3 w-3 text-brand" />
                        </div>
                        <div>
                          <div className="font-medium">{conv.inviteeName || "Someone"}</div>
                          <div className="text-xs text-muted-foreground">
                            {conv.convertedAt
                              ? `Enrolled ${formatRelativeTime(conv.convertedAt)}`
                              : "Invited today"}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {conv.convertedAt && conv.rewardKobo > 0 && (
                          <div className="text-xs font-medium text-success">
                            +{(conv.rewardKobo / 1000).toFixed(1)}₦ credit earned
                          </div>
                        )}
                        {conv.courseTitle && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Enrolled in: {conv.courseTitle}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards" className="space-y-6">
          {summary.activeGrantCount === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <div className="bg-muted p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <Gift className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Available Credits</h3>
                <p className="text-muted-foreground mb-4">
                  You don't have any referral credits available at this time.
                </p>
                <p className="text-sm text-muted-foreground">
                  Continue sharing your code to earn more credits!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="bg-brand/10 border border-brand/20 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-4 w-4 text-brand" />
                  <span className="text-sm font-medium text-brand">Your Credits</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  You have <span className="font-semibold">{(summary.availableCreditKobo / 1000).toFixed(1)}₦</span> in available credits that will be applied automatically to your next paid course purchase.
                </div>
              </div>

              <div className="space-y-3">
                {summary.grants.map((grant) => (
                  <Card key={grant._id} className={cn("transition-colors", grant.expiresAt && grant.expiresAt < Date.now() && "opacity-60")}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-brand/10 p-2 rounded-full">
                            <Gift className="h-3 w-3 text-brand" />
                          </div>
                          <div>
                            <div className="font-medium">Referral Credit</div>
                            <div className="text-xs text-muted-foreground">
                              {(grant.remainingKobo / 1000).toFixed(1)}₦ available
                              {grant.expiresAt && (
                                <span>
                                  {' '}• Expires {new Date(grant.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}

                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={grant.expiresAt && grant.expiresAt < Date.now() ? "destructive" : "default"}>
                            {grant.expiresAt && grant.expiresAt < Date.now() ? "Expired" : "Active"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-warning/5 border-warning/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-warning/10 p-2 rounded-full mt-0.5">
                      <Clock className="h-4 w-4 text-warning" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-warning-foreground">How Credits Work</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        • Credits are earned when someone you invite purchases a course<br/>
                        • They're applied automatically to your next paid course<br/>
                        • Discounts do not stack - whichever is larger applies<br/>
                        • Credits never expire but may be removed if your account is suspended
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ReferrerSkeleton() {
  return (
    <PageShell width="narrow" className="gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-80 w-full rounded-2xl" />
    </PageShell>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  return "Just now";
}