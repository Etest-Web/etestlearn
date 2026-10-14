"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { BadgeCheck, Search, ShieldAlert } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { BANKS } from "@/lib/banks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Payout account setup — the dialog, and the context that opens it.
 *
 * This used to be a page (`/dashboard/instructor/bank`). It is a dialog now
 * because the thing it collects is one-shot: an instructor fills it in once,
 * and every later visit is a read-only receipt that lives on the Earnings
 * page (`#payout-account`). A page that is only correct for five minutes of a
 * user's life is a page with nothing on it for the rest of it.
 *
 * Three states, in order:
 * 1. **Form**: bank + account number. "Verify" resolves the account name via
 *    Paystack, and nothing is saved yet.
 * 2. **Confirm**: Paystack returned a name, so the instructor reviews it and
 *    saves.
 * 3. **Saved**: a short confirmation. The receipt itself is on Earnings.
 *
 * The dialog is **setup-only**. There is no read-only mode here, because the
 * Earnings section is that receipt, and rendering the same three facts twice
 * means two places to keep in sync. Deep links (the nudge notification, the
 * confirmation email) therefore point at Earnings, never at this dialog.
 *
 * `BankSetupProvider` mounts once in the instructor console layout and owns
 * the open state, so the banner on Overview and the empty state on Earnings
 * can both open the same dialog. It auto-opens **once per full page load**
 * when `needsPayoutSetup` reports true. The dialog is always dismissible, and
 * the banner is the persistent reminder for anyone who dismisses it.
 */

const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;

type BankSetupContextValue = {
  /** Open the setup dialog. Calling it while open does nothing harmful. */
  openBankSetup: () => void;
};

const BankSetupContext = createContext<BankSetupContextValue | null>(null);

/**
 * Open the payout-account setup dialog from anywhere inside the instructor
 * console. Throws outside the provider, which is deliberate: a silent no-op
 * would look like a broken button rather than a wiring mistake.
 */
export function useBankSetup(): BankSetupContextValue {
  const value = useContext(BankSetupContext);
  if (value === null) {
    throw new Error("useBankSetup must be used inside <BankSetupProvider>");
  }
  return value;
}

export function BankSetupProvider({ children }: { children: ReactNode }) {
  // False for everyone who is not staff without a saved account, so this
  // subscription never opens the dialog for a learner.
  const needsSetup = useQuery(api.instructorBank.needsPayoutSetup);

  // Open state is derived, not driven by an effect. Three inputs:
  // · `suppressed` — dismissed this page load. A reload or a fresh sign-in
  //   resets it, which is what makes the prompt come back "on login".
  // · `forced` — someone asked for it (the banner, or the Earnings empty
  //   state), or a save just landed and the confirmation step must survive
  //   `needsSetup` flipping to false.
  // · otherwise it follows `needsSetup`.
  const [suppressed, setSuppressed] = useState(false);
  const [forced, setForced] = useState(false);
  const open = forced || (needsSetup === true && !suppressed);

  const value = useMemo<BankSetupContextValue>(
    () => ({ openBankSetup: () => setForced(true) }),
    [],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setForced(true);
      return;
    }
    setForced(false);
    setSuppressed(true);
  }

  function handleSaved() {
    // `needsSetup` is about to go false, which would close the dialog out
    // from under the confirmation step. Hold it open until "Done".
    setForced(true);
  }

  return (
    <BankSetupContext.Provider value={value}>
      {children}
      <BankSetupDialog
        open={open}
        onOpenChange={handleOpenChange}
        onSaved={handleSaved}
      />
    </BankSetupContext.Provider>
  );
}

type VerifiedPreview = {
  accountName: string;
  accountNumber: string;
  bankCode: string;
};

function BankSetupDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told the provider a save landed, so the confirmation step survives. */
  onSaved: () => void;
}) {
  const verify = useAction(api.bankVerification.verifyBankAccount);
  const confirm = useMutation(api.instructorBank.confirmBankAccount);

  const [bankCode, setBankCode] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifiedPreview, setVerifiedPreview] =
    useState<VerifiedPreview | null>(null);
  // Kept separately from `verifiedPreview` (cleared on save) because the
  // success step still has to name the account it just saved.
  const [savedAccountName, setSavedAccountName] = useState<string | null>(null);

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

  /** Closing must not leak a half-filled form into the next opening. */
  function reset() {
    setBankCode("");
    setBankFilter("");
    setAccountNumber("");
    setVerifiedPreview(null);
    setSavedAccountName(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

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
      const { accountName } = verifiedPreview;
      await confirm(verifiedPreview);
      setVerifiedPreview(null);
      setSavedAccountName(accountName);
      // Hold the dialog open through the `needsSetup` flip.
      onSaved();
      toast.success("Payout account saved");
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Wider than the stock `sm:max-w-md`: the bank select and the
          "once only" warning need the room, and this is a form people
          should be able to read at a glance before committing. */}
      <DialogContent className="gap-5 sm:max-w-lg">
        {savedAccountName !== null ? (
          <SavedStep
            accountName={savedAccountName}
            onDone={() => handleOpenChange(false)}
          />
        ) : verifiedPreview ? (
          <ConfirmStep
            accountName={verifiedPreview.accountName}
            accountNumber={verifiedPreview.accountNumber}
            bankName={
              BANKS.find((bank) => bank.code === verifiedPreview.bankCode)
                ?.name ?? verifiedPreview.bankCode
            }
            onConfirm={handleConfirm}
            onBack={() => setVerifiedPreview(null)}
            saving={saving}
          />
        ) : (
          <FormStep
            bankCode={bankCode}
            bankFilter={bankFilter}
            accountNumber={accountNumber}
            visibleBanks={visibleBanks}
            verifying={verifying}
            onBankCodeChange={setBankCode}
            onBankFilterChange={setBankFilter}
            onAccountNumberChange={setAccountNumber}
            onSubmit={handleVerify}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormStep({
  bankCode,
  bankFilter,
  accountNumber,
  visibleBanks,
  verifying,
  onBankCodeChange,
  onBankFilterChange,
  onAccountNumberChange,
  onSubmit,
}: {
  bankCode: string;
  bankFilter: string;
  accountNumber: string;
  visibleBanks: typeof BANKS;
  verifying: boolean;
  onBankCodeChange: (value: string) => void;
  onBankFilterChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add your payout account</DialogTitle>
        <DialogDescription>
          Where Glypha Learn sends your course earnings. We check the details
          against your bank via Paystack before saving anything.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
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
                onChange={(event) => onBankFilterChange(event.target.value)}
                placeholder="Search banks…"
                className="pl-9"
                aria-label="Filter banks"
                disabled={verifying}
              />
            </div>
            <Select
              value={bankCode}
              onValueChange={(value) => onBankCodeChange(value ?? "")}
              disabled={verifying}
            >
              <SelectTrigger
                id="bank-select"
                className="h-10 w-full"
                aria-label="Bank"
              >
                <SelectValue placeholder="Select your bank">
                  {(value: string | null) =>
                    value
                      ? BANKS.find((bank) => bank.code === value)?.name ?? value
                      : "Select your bank"
                  }
                </SelectValue>
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
              onAccountNumberChange(
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
            This can only be done <strong>once</strong>. Check the bank and
            account number carefully — changing the account later means
            contacting support.
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
    </>
  );
}

function ConfirmStep({
  accountName,
  accountNumber,
  bankName,
  onConfirm,
  onBack,
  saving,
}: {
  accountName: string;
  accountNumber: string;
  bankName: string;
  onConfirm: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const masked = maskNumber(accountNumber);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm your payout account</DialogTitle>
        <DialogDescription>
          Paystack resolved this name from the details you entered. If it is
          not the account holder, go back and correct them.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl bg-success/5 p-4">
          <BadgeCheck className="size-6 text-success" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Verified as <strong className="text-foreground">{accountName}</strong>
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
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
              {masked}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Saving locks this in — later changes go through support.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onBack} disabled={saving}>
              Back
            </Button>
            <Button onClick={onConfirm} disabled={saving}>
              {saving ? "Saving…" : "Save account"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function SavedStep({
  accountName,
  onDone,
}: {
  accountName: string;
  onDone: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Payout account verified</DialogTitle>
        <DialogDescription>
          We will send your course earnings to this account.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl bg-success/5 p-4">
          <BadgeCheck className="size-6 text-success" aria-hidden />
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{accountName}</strong> is on
            file and verified.
          </p>
        </div>

        <p className="text-sm leading-[1.5] text-muted-foreground">
          Your payout account is now locked in place — a change needs a person
          on our side to check it. You can review these details any time on
          the Earnings page.
        </p>

        <div className="flex justify-end">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    </>
  );
}

/** Last four visible, everything else masked — the same mask Earnings shows. */
function maskNumber(accountNumber: string): string {
  return accountNumber.length > 4
    ? "*".repeat(accountNumber.length - 4) + accountNumber.slice(-4)
    : "*".repeat(accountNumber.length);
}
