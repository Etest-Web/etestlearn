"use client";

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { BadgeCheck, Lock, Search, ShieldAlert } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { BANKS } from "@/lib/banks";
import { supportEmail, supportMailto } from "@/lib/support";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/dashboard-shell";

/**
 * Instructor payout details — the one page that decides where money goes.
 *
 * Two states, deliberately not one: the **form** while nothing is on file,
 * and a **read-only summary** afterwards. The absence of an edit button is
 * the product decision from `convex/instructorBank.ts` made visible — the
 * account is one-shot, so this page's job after saving is to display the
 * verified detail and point at support for changes, not to invite a second
 * attempt that the server would refuse anyway. Showing the disabled truth is
 * better than showing a form that fails on submit.
 *
 * The bank list is `lib/banks.ts`, a generated snapshot of Paystack's
 * directory (see `scripts/generate-banks.mjs`), so the dropdown works even
 * when Paystack is only needed for the actual resolve call on submit.
 */

const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;

export default function BankDetailsPage() {
  const bankInfo = useQuery(api.instructorBank.getBankInfo);
  const verifyAndSave = useAction(
    api.bankVerification.verifyAndSaveBankAccount,
  );

  const [bankCode, setBankCode] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justVerified, setJustVerified] = useState<{
    accountName: string;
    accountNumberMasked: string;
  } | null>(null);

  const selectedBank = useMemo(
    () => BANKS.find((bank) => bank.code === bankCode) ?? null,
    [bankCode],
  );

  // 284 banks is too many to scan cold, so the filter narrows the dropdown.
  // The current selection is always pinned back in, otherwise filtering it
  // out would empty the trigger's label while it still holds a value.
  const visibleBanks = useMemo(() => {
    const query = bankFilter.trim().toLowerCase();
    const matches = query
      ? BANKS.filter(
          (bank) =>
            bank.name.toLowerCase().includes(query) ||
            bank.code.includes(query),
        )
      : BANKS;
    if (bankCode && !matches.some((bank) => bank.code === bankCode)) {
      const chosen = BANKS.find((bank) => bank.code === bankCode);
      return chosen ? [chosen, ...matches] : matches;
    }
    return matches;
  }, [bankFilter, bankCode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const accountNumberValue = accountNumber.trim();
    if (!selectedBank) {
      toast.error("Choose the bank your account is with");
      return;
    }
    if (!ACCOUNT_NUMBER_PATTERN.test(accountNumberValue)) {
      toast.error("Account number must be exactly 10 digits");
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifyAndSave({
        accountNumber: accountNumberValue,
        bankCode: selectedBank.code,
      });
      // The resolved name is the proof the check happened — show it
      // immediately while the query catches up.
      setJustVerified({
        accountName: result.accountName,
        accountNumberMasked: result.accountNumberMasked,
      });
      setAccountNumber("");
      setBankCode("");
      setBankFilter("");
      // Clear the toast state after the user sees it; the query will
      // render the full VerifiedAccount view once it updates.
      setTimeout(() => setJustVerified(null), 3000);
    } catch (error) {
      // Server messages are written for humans (rate limit, already saved,
      // Paystack's own reason), so they are shown verbatim.
      toast.error(
        error instanceof Error
          ? error.message
          : "We could not verify that account. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell className="max-w-3xl">
      <PageHeader
        eyebrow="Payouts"
        title="Bank details"
        description="Where Glypha Learn sends your course earnings. Verify once — the account is locked in place afterwards."
      />

      {bankInfo === undefined ? (
        <Skeleton className="h-72" />
      ) : bankInfo.verified ? (
        <VerifiedAccount
          accountName={bankInfo.accountName ?? "Your account"}
          accountNumberMasked={bankInfo.accountNumberMasked ?? "********"}
          bankName={
            BANKS.find((bank) => bank.code === bankInfo.bankCode)?.name ??
            bankInfo.bankCode ??
            "—"
          }
          updatedAt={bankInfo.updatedAt}
        />
      ) : justVerified ? (
        <JustVerified
          accountName={justVerified.accountName}
          accountNumberMasked={justVerified.accountNumberMasked}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Add your payout account</CardTitle>
            <CardDescription>
              We check your details against your bank via Paystack before
              saving anything.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="bank-select">Bank</Label>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={bankFilter}
                      onChange={(event) => setBankFilter(event.target.value)}
                      placeholder="Search banks…"
                      className="pl-9"
                      aria-label="Filter banks"
                      disabled={submitting}
                    />
                  </div>
                  <Select
                    value={bankCode}
                    onValueChange={(value) => setBankCode(value ?? "")}
                    disabled={submitting}
                  >
                    <SelectTrigger
                      id="bank-select"
                      className="h-10 w-full"
                      aria-label="Bank"
                    >
                      <SelectValue
                        placeholder="Select your bank"
                        children={(value) =>
                          value
                            ? BANKS.find((bank) => bank.code === value)?.name ??
                              value
                            : "Select your bank"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleBanks.map((bank) => (
                        <SelectItem key={bank.code} value={bank.code}>
                          {bank.name}
                        </SelectItem>
                      ))}
                      {visibleBanks.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          No bank matches “{bankFilter.trim()}”.
                        </p>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="account-number">Account number</Label>
                <Input
                  id="account-number"
                  value={accountNumber}
                  onChange={(event) =>
                    setAccountNumber(
                      event.target.value.replace(/\D/g, "").slice(0, 10),
                    )
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="10 digits"
                  className="tabular"
                  maxLength={10}
                  disabled={submitting}
                />
              </div>

              <div
                className="flex items-start gap-3 rounded-xl border border-warning bg-warning/5 p-3.5"
                role="note"
              >
                <ShieldAlert
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden
                />
                <p className="text-sm leading-[1.5] text-muted-foreground">
                  This can only be done <strong>once</strong>. Check the bank
                  and account number carefully — changing the account later
                  means contacting support.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Paystack confirms the account name before anything is saved.
                </p>
                <Button
                  type="submit"
                  disabled={submitting || !bankCode || accountNumber.length !== 10}
                >
                  {submitting ? "Verifying…" : "Verify & save"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function JustVerified({
  accountName,
  accountNumberMasked,
}: {
  accountName: string;
  accountNumberMasked: string;
}) {
  return (
    <Card className="border-success">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-success/5 p-4">
          <BadgeCheck className="size-6 text-success" aria-hidden />
          <div>
            <p className="font-semibold text-success">Account verified</p>
            <p className="text-sm text-muted-foreground">
              Paystack confirmed this account belongs to <strong>{accountName}</strong>
            </p>
          </div>
        </div>
        <div className="rounded-lg border bg-surface-sunken p-4 text-center">
          <p className="text-sm text-muted-foreground">Account number</p>
          <p className="tabular text-2xl font-semibold text-foreground">
            {accountNumberMasked}
          </p>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          This will be your payout destination. The page will refresh shortly with
          the full details.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * The post-verification view. Reads as a receipt rather than a settings form:
 * every field is plain text, and the only affordance is the support link —
 * because there is nothing else the instructor is allowed to do here.
 */
function VerifiedAccount({
  accountName,
  accountNumberMasked,
  bankName,
  updatedAt,
}: {
  accountName: string;
  accountNumberMasked: string;
  bankName: string;
  updatedAt: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="size-5 text-success" aria-hidden />
              Payout account verified
            </CardTitle>
            <CardDescription>
              Earnings are paid to this account.
              {updatedAt ? ` Saved ${formatRelativeTime(updatedAt)}.` : ""}
            </CardDescription>
          </div>
          <Badge>Verified</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Account holder</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {accountName}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Bank</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {bankName}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Account number</dt>
            <dd className="tabular mt-1 text-sm font-medium text-foreground">
              {accountNumberMasked}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Status</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              Locked — no self-service changes
            </dd>
          </div>
        </dl>

        <div className="flex items-start gap-3 rounded-xl border border-rule bg-surface-sunken p-3.5">
          <Lock
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm leading-[1.5] text-muted-foreground">
            For your security this detail is locked in place. To change the
            account we pay into, email{" "}
            <a
              href={supportMailto("Change my payout bank account")}
              className="font-medium text-brand link-quiet"
            >
              {supportEmail()}
            </a>{" "}
            from the address on your account.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
