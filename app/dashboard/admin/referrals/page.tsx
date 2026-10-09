"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Gift, Users, UserPlus, BarChart3, Clock, Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/dashboard-shell";
import { AdminGuard } from "@/components/role-guard";

export default function ReferralStatsPage() {
  return (
    <AdminGuard>
      <ReferralStatsPageContent />
    </AdminGuard>
  );
}

function ReferralStatsPageContent() {
  const stats = useQuery(api.referrals.getProgramStats);

  if (stats === undefined) {
    return <ReferralStatsSkeleton />;
  }

  const conversionRate = stats.conversionRate === null ? null : `${stats.conversionRate}%`;

  return (
    <PageShell width="narrow" className="gap-6">
      <h1 className="text-2xl font-bold mb-4">Referral Program</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-brand/10 p-2 rounded-lg">
                <Users className="h-4 w-4 text-brand" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.invited}</div>
                <div className="text-sm text-muted-foreground">People Invited</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-success/10 p-2 rounded-lg">
                <UserPlus className="h-4 w-4 text-success" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.converted}</div>
                <div className="text-sm text-muted-foreground">Converted</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{conversionRate}</div>
                <div className="text-sm text-muted-foreground">Conversion Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-warning/10 p-2 rounded-lg">
                <Gift className="h-4 w-4 text-warning" />
              </div>
              <div>
                <div className="text-2xl font-bold">{(stats.rewardIssuedKobo / 1000).toFixed(1)}₦</div>
                <div className="text-sm text-muted-foreground">Rewards Issued</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Award className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{(stats.outstandingCreditKobo / 1000).toFixed(1)}₦</div>
                <div className="text-sm text-muted-foreground">Outstanding Credit</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-muted/10 p-2 rounded-lg">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-2xl font-bold">{(stats.expiringSoonKobo / 1000).toFixed(1)}₦</div>
                <div className="text-sm text-muted-foreground">Expiring Soon (30 days)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function ReferralStatsSkeleton() {
  return (
    <PageShell width="narrow" className="gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </PageShell>
  );
}