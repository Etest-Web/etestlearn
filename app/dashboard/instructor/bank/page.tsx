"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { BadgeCheck, Lock, Search, ShieldAlert, X } from "lucide-react";

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
 * Three states:
 * 1. **Form** — enter bank + account number, click "Verify" to resolve the
 *    account name via Paystack (no save yet).
 * 2. **Confirm** — Paystack returned the account name; the instructor reviews
 *    it and clicks "Save" to commit.
 * 3. **Verified** — read-only summary with the support link for changes.
 *
 * The bank list is `lib/banks.ts`, a generated snapshot of Paystack's
 * directory (see `scripts/generate-banks.mjs`), so the dropdown works even
 * when Paystack is only needed for the actual resolve call on verify.
 */

const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;

export default function BankDetailsPage() {
  const bankInfo = useQuery(api.instructorBank.getBankInfo);
  const verify = useAction(api.bankVerification.verifyBankAccount);
  const confirm = useMutation(api.instructorBank.confirmBankAccount);

  const [bankCode, setBankCode] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifiedPreview, setVerifiedPreview] = useState<{
    accountName: string;
    accountNumber: string;
    bankCode: string;
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

  async function handleVerify(event: React.FormEvent) {
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

    setVerifying(true);
    try {
      const result = await verify({
        accountNumber: accountNumberValue,
        bankCode: selectedBank.code,
      });
      // Store the resolved details for the confirm step.
      setVerifiedPreview({
        accountName: result.accountName,
        accountNumber: accountNumberValue,
        bankCode: selectedBank.code,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "We could not verify that account. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleConfirm() {
    if (!verifiedPreview) return;

    setSaving(true);
    try {
      await confirm(verifiedPreview);
      // Clear form; the query will render the full VerifiedAccount view.
      setVerifiedPreview(null);
      setAccountNumber("");
      setBankCode("");
      setBankFilter("");
      toast.success("Bank details saved");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the account. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setVerifiedPreview(null);
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
      ) : verifiedPreview ? (
        <ConfirmAccount
          accountName={verifiedPreview.accountName}
          accountNumber={verifiedPreview.accountNumber}
          bankName={
            BANKS.find((bank) => bank.code === verifiedPreview.bankCode)?.name ??
            verifiedPreview.bankCode
          }
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          saving={saving}
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
            <form onSubmit={handleVerify} className="flex flex-col gap-5">
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
                      disabled={verifying}
                    />
                  </div>
                  <Select
                    value={bankCode}
                    onValueChange={(value) => setBankCode(value ?? "")}
                    disabled={verifying}
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
                  disabled={verifying}
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
                  disabled={verifying || !bankCode || accountNumber.length !== 10}
                >
                  {verifying ? "Verifying…" : "Verify account"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function ConfirmAccount({
  accountName,
  accountNumber,
  bankName,
  onConfirm,
  onCancel,
  saving,
}: {
  accountName: string;
  accountNumber: string;
  bankName: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  // Mask: keep only last 4 digits
  const masked = accountNumber.length > 4
    ? "*".repeat(accountNumber.length - 4) + accountNumber.slice(-4)
    : "*".repeat(accountNumber.length);

  return (
    <Card className="border-success">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 rounded-xl bg-success/5 p-4">
            <BadgeCheck className="size-6 text-success" aria-hidden />
            <div>
              <p className="font-semibold text-success">Account verified</p>
              <p className="text-sm text-muted-foreground">
                Paystack confirmed this account belongs to <strong>{accountName}</strong>
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="eyebrow">Account holder</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{accountName}</dd>
          </div>
          <div>
            <dt className="eyebrow">Bank</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">{bankName}</dd>
          </div>
          <div>
            <dt className="eyebrow">Account number</dt>
            <dd className="tabular mt-1 text-sm font-medium text-foreground">{masked}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Please confirm these details are correct. This can only be done once.
          </p>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? "Saving…" : "Save account"}
          </Button>
        </div>
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