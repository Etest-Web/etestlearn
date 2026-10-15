import { describe, expect, it } from "vitest";
import {
  payoutStatusLabel,
  summarizePayouts,
  type PayoutLedgerRow,
} from "./payouts";

const paid = (amountKobo: number): PayoutLedgerRow => ({
  amountKobo,
  status: "paid",
});
const requested = (amountKobo: number): PayoutLedgerRow => ({
  amountKobo,
  status: "requested",
});
const cancelled = (amountKobo: number): PayoutLedgerRow => ({
  amountKobo,
  status: "cancelled",
});

describe("summarizePayouts", () => {
  it("reports the whole balance as available when nothing has been paid or asked for", () => {
    expect(summarizePayouts(500_000, [])).toEqual({
      earnedKobo: 500_000,
      paidKobo: 0,
      pendingKobo: 0,
      availableKobo: 500_000,
    });
  });

  it("subtracts paid rows from what is available", () => {
    expect(summarizePayouts(500_000, [paid(200_000)])).toEqual({
      earnedKobo: 500_000,
      paidKobo: 200_000,
      pendingKobo: 0,
      availableKobo: 300_000,
    });
  });

  it("holds a pending request against the balance so it cannot be requested twice", () => {
    const balance = summarizePayouts(500_000, [requested(500_000)]);
    expect(balance.pendingKobo).toBe(500_000);
    expect(balance.availableKobo).toBe(0);
  });

  it("counts paid and pending together, not either alone", () => {
    expect(
      summarizePayouts(1_000_000, [paid(300_000), requested(200_000)]),
    ).toMatchObject({ paidKobo: 300_000, pendingKobo: 200_000, availableKobo: 500_000 });
  });

  it("ignores cancelled rows so a withdrawn request returns to the balance", () => {
    expect(summarizePayouts(500_000, [cancelled(500_000)])).toMatchObject({
      pendingKobo: 0,
      availableKobo: 500_000,
    });
  });

  it("never reports a negative balance after a refund drops earnings below payouts", () => {
    const balance = summarizePayouts(100_000, [paid(300_000)]);
    expect(balance.availableKobo).toBe(0);
    // The components are still reported honestly, only the remainder is floored.
    expect(balance.paidKobo).toBe(300_000);
    expect(balance.earnedKobo).toBe(100_000);
  });

  it("treats zero earnings with no ledger as zero available", () => {
    expect(summarizePayouts(0, []).availableKobo).toBe(0);
  });
});

describe("payoutStatusLabel", () => {
  it("labels every status in words, not the raw enum", () => {
    expect(payoutStatusLabel("requested")).toBe("Requested");
    expect(payoutStatusLabel("paid")).toBe("Paid");
    expect(payoutStatusLabel("cancelled")).toBe("Cancelled");
  });
});
