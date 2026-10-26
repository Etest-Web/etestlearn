"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui";
import {
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
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNaira } from "@/lib/instructor-earnings";
import {
  COUPON_CODE_MAX_LENGTH,
  type CouponKind,
  type CouponState,
} from "@/lib/coupons";

/** Badge colour per lifecycle state. */
const STATE_TONE: Record<CouponState, string> = {
  active: "bg-success/10 text-success",
  inactive: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  exhausted: "bg-warning/10 text-warning",
};

const STATE_TEXT: Record<CouponState, string> = {
  active: "Active",
  inactive: "Paused",
  expired: "Expired",
  exhausted: "Fully redeemed",
};

/**
 * Instructor-side coupon management for one course: create a code, watch how
 * many times it has been used, pause it, or delete it while it is still unused.
 *
 * Ownership is enforced in `convex/coupons.ts` against the course, not here — a
 * manager rendered for a course you do not own gets an authorization error from
 * the query rather than a table of somebody else's codes.
 */
export function CourseCouponsManager({ courseId }: { courseId: Id<"courses"> }) {
  const coupons = useQuery(api.coupons.listForCourse, { courseId });
  const create = useMutation(api.coupons.create);
  const setActive = useMutation(api.coupons.setActive);
  const remove = useMutation(api.coupons.remove);

  const [code, setCode] = useState("");
  const [kind, setKind] = useState<CouponKind>("percent");
  const [percent, setPercent] = useState("20");
  const [amountNaira, setAmountNaira] = useState("500");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);

  if (coupons === undefined) {
    return <Skeleton className="h-48 w-full rounded-sm" />;
  }

  async function handleCreate() {
    setBusy(true);
    try {
      await create({
        courseId,
        code: code.trim() || undefined,
        kind,
        percentOff: kind === "percent" ? Number(percent) : undefined,
        amountOffKobo: kind === "amount" ? Math.round(Number(amountNaira) * 100) : undefined,
        maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : undefined,
        // A date input gives a day; a coupon should last to the end of it.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).getTime() : undefined,
      });
      toast.success("Coupon created");
      setCode("");
      setPercent("20");
      setAmountNaira("500");
      setMaxRedemptions("");
      setExpiresAt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the coupon");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(id: Id<"coupons">, active: boolean) {
    try {
      await setActive({ couponId: id, active });
      toast.success(active ? "Coupon resumed" : "Coupon paused");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleRemove(id: Id<"coupons">) {
    try {
      await remove({ couponId: id });
      toast.success("Coupon deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the coupon");
    }
  }

  const amountValid =
    kind === "percent"
      ? Number(percent) >= 1 && Number(percent) <= 100
      : Number(amountNaira) > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-brand" /> New coupon
          </CardTitle>
          <CardDescription>
            A code a learner types at checkout. The discount comes out of your
            earnings for that sale, not the platform&apos;s cut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="coupon-code">Code (optional)</Label>
            <Input
              id="coupon-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={COUPON_CODE_MAX_LENGTH}
              placeholder="Leave blank to generate one"
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coupon-kind">Discount type</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as CouponKind)}>
                <SelectTrigger id="coupon-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="amount">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-value">
                {kind === "percent" ? "Percent off (max 30%)" : "Amount off (₦)"}
              </Label>
              {kind === "percent" ? (
                <Input
                  id="coupon-value"
                  type="number"
                  min={1}
                  max={30}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
              ) : (
                <Input
                  id="coupon-value"
                  type="number"
                  min={1}
                  value={amountNaira}
                  onChange={(e) => setAmountNaira(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coupon-limit">Redemption limit (optional)</Label>
              <Input
                id="coupon-limit"
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon-expiry">Expires (optional)</Label>
              <Input
                id="coupon-expiry"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleCreate} disabled={busy || !amountValid}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create coupon
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-0 p-0">
        <CardHeader className="border-b border-rule p-5">
          <CardTitle>
            Coupons (<span className="tabular">{coupons.length}</span>)
          </CardTitle>
          <CardDescription>
            Usage is counted when a sale is paid, so an abandoned checkout does
            not use up a code.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-rule">
            {coupons.map((coupon) => (
              <li key={coupon._id} className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono font-semibold">{coupon.code}</p>
                    <Badge className={STATE_TONE[coupon.state]}>
                      {STATE_TEXT[coupon.state]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {coupon.label} ·{" "}
                    <span className="tabular">
                      {coupon.redemptionCount}
                      {coupon.maxRedemptions !== undefined
                        ? `/${coupon.maxRedemptions}`
                        : ""}
                    </span>{" "}
                    used
                    {coupon.expiresAt !== undefined
                      ? ` · expires ${new Date(coupon.expiresAt).toLocaleDateString("en-NG")}`
                      : ""}
                  </p>
                  {coupon.kind === "amount" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Worth {formatNaira(coupon.amountOffKobo ?? 0)} off
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(coupon._id, !coupon.active)}
                  >
                    {coupon.active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={coupon.redemptionCount > 0}
                    onClick={() => handleRemove(coupon._id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </li>
            ))}
            {coupons.length === 0 && (
              <li>
                <EmptyState
                  icon={Tag}
                  tone="brand"
                  title="No coupons yet"
                  description="Create a code above to run a discount on this course. Codes are unique to this course and can be paused at any time."
                />
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
