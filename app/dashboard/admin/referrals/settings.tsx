"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Gift, Percent, Wallet, Clock, Save, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from "@/components/ui";
import { PageHeader } from "@/components/ui/page-header";
import { AdminGuard } from "@/components/role-guard";

/**
 * Referral settings editor.
 *
 * Allows admins to configure the referral program:
 * - Program enabled/disabled
 * - Invitee discount: percentage and absolute caps
 * - Referrer grant: percentage and absolute caps
 * - Grant expiration window
 */
export default function ReferralSettingsPage() {
  return (
    <AdminGuard>
      <ReferralSettingsPageContent />
    </AdminGuard>
  );
}

function ReferralSettingsPageContent() {
  const settings = useQuery(api.referrals.getSettings);
  const updateSettings = useMutation(api.referrals.updateSettings);

  const [form, setForm] = useState({
    enabled: true,
    inviteeDiscountBps: 2000,
    maxInviteeDiscountKobo: 500000,
    referrerGrantBps: 4000,
    maxReferrerGrantKobo: 200000,
    grantExpiryDays: 90,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled,
        inviteeDiscountBps: settings.inviteeDiscountBps,
        maxInviteeDiscountKobo: settings.maxInviteeDiscountKobo,
        referrerGrantBps: settings.referrerGrantBps,
        maxReferrerGrantKobo: settings.maxReferrerGrantKobo,
        grantExpiryDays: settings.grantExpiryDays ?? 90,
      });
    }
  }, [settings]);

  if (settings === undefined) {
    return (
      <div className="min-h-[400px] p-6">
        <h1 className="text-2xl font-bold mb-4">Referral Settings</h1>
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-24"><span className="h-4 bg-muted rounded animate-pulse" /></div>
              <div className="flex-1"><span className="h-8 w-32 bg-muted rounded animate-pulse" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings(form);
      setIsDirty(false);
      toast.success("Referral settings updated successfully");
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error("Failed to update settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (settings) {
      setForm({
        enabled: settings.enabled,
        inviteeDiscountBps: settings.inviteeDiscountBps,
        maxInviteeDiscountKobo: settings.maxInviteeDiscountKobo,
        referrerGrantBps: settings.referrerGrantBps,
        maxReferrerGrantKobo: settings.maxReferrerGrantKobo,
        grantExpiryDays: settings.grantExpiryDays ?? 90,
      });
      toast.info("Settings reset to current values");
    }
  };

  const isOverCap = form.grantExpiryDays < 0 || form.grantExpiryDays > 3650;

  return (
    <div className="min-h-[400px] p-6">
      <h1 className="text-2xl font-bold mb-4">Referral Settings</h1>

      <Card className="space-y-6">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-brand/10 p-2 rounded-lg">
              <Gift className="h-5 w-5 text-brand" />
            </div>
            <h2 className="font-medium">Program Control</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="enabled-toggle">Program Enabled</Label>
              <p className="text-sm text-muted-foreground">
                When disabled, referral codes won't grant discounts or credits.
              </p>
            </div>
            <Input
              id="enabled-toggle"
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => {
                setForm({ ...form, enabled: e.target.checked });
                setIsDirty(true);
              }}
              className="w-12 h-6"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-brand/10 p-2 rounded-lg">
              <Percent className="h-5 w-5 text-brand" />
            </div>
            <h2 className="font-medium">Invitee Discount Settings</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <Label htmlFor="inviteeDiscountBps">Percentage Discount (basis points)</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  id="inviteeDiscountBps"
                  type="number"
                  min={0}
                  max={10000}
                  value={form.inviteeDiscountBps}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setForm({
                      ...form,
                      inviteeDiscountBps: Math.min(10000, Math.max(0, value)),
                    });
                    setIsDirty(true);
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  = {(form.inviteeDiscountBps / 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Percentage of course price that invitees receive as a discount.
              </div>
            </div>

            <div>
              <Label htmlFor="maxInviteeDiscountKobo">Absolute Maximum (kobo)</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  id="maxInviteeDiscountKobo"
                  type="number"
                  min={0}
                  max={100000000}
                  value={form.maxInviteeDiscountKobo}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setForm({
                      ...form,
                      maxInviteeDiscountKobo: Math.min(100000000, Math.max(0, value)),
                    });
                    setIsDirty(true);
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  = ₦{(form.maxInviteeDiscountKobo / 1000).toFixed(1)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Cap applied even if the percentage would yield more.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-brand/10 p-2 rounded-lg">
              <Wallet className="h-5 w-5 text-brand" />
            </div>
            <h2 className="font-medium">Referrer Grant Settings</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <Label htmlFor="referrerGrantBps">Grant Percentage (basis points)</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  id="referrerGrantBps"
                  type="number"
                  min={0}
                  max={10000}
                  value={form.referrerGrantBps}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setForm({
                      ...form,
                      referrerGrantBps: Math.min(10000, Math.max(0, value)),
                    });
                    setIsDirty(true);
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  = {(form.referrerGrantBps / 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Percentage of course price that referrers earn as a credit.
              </div>
            </div>

            <div>
              <Label htmlFor="maxReferrerGrantKobo">Grant Maximum (kobo)</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  id="maxReferrerGrantKobo"
                  type="number"
                  min={0}
                  max={100000000}
                  value={form.maxReferrerGrantKobo}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setForm({
                      ...form,
                      maxReferrerGrantKobo: Math.min(100000000, Math.max(0, value)),
                    });
                    setIsDirty(true);
                  }}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">
                  = ₦{(form.maxReferrerGrantKobo / 1000).toFixed(1)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Cap applied even if the percentage would yield more.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="bg-brand/10 p-2 rounded-lg">
              <Clock className="h-5 w-5 text-brand" />
            </div>
            <h2 className="font-medium">Grant Expiration</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="grantExpiryDays">Expiration Window (days)</Label>
            <div className="flex items-center gap-4 mt-2">
              <Input
                id="grantExpiryDays"
                type="number"
                min={0}
                max={3650}
                value={form.grantExpiryDays}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setForm({
                    ...form,
                    grantExpiryDays: Math.min(3650, Math.max(0, value)),
                  });
                  setIsDirty(true);
                }}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                days (0 = no expiry, 90 = default)
              </span>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Grants expire after this many days. Set to 0 for credits that never expire.
            </div>
            {isOverCap && (
              <div className="flex items-center gap-2 mt-2 text-warning-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  Value exceeds system maximum of 3650 days.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium mb-1">Danger Zone</h3>
              <p className="text-sm text-muted-foreground">
                Reset settings to current deployment values.
              </p>
            </div>
            <Button variant="outline" onClick={handleReset} disabled={!isDirty || isSaving}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reset to Current
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-4">
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
        >
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}