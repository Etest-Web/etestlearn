/**
 * The payout ledger's arithmetic, on its own so the numbers an instructor sees
 * and the numbers an admin acts on come from one place.
 *
 * This is deliberately the same single-source shape as `lib/publishing.ts` and
 * `lib/certificates.ts`: the rule lives here, the Convex layer stores rows and
 * enforces identity, and the pages only format the result.
 *
 * ## Why this is not a stored balance
 *
 * A payout is money that a human moved by hand (see the "no payout automation"
 * note in `lib/instructor-earnings.ts`), so the table records *events* — "this
 * instructor asked for their balance", "an admin sent ₦X on this date" — and
 * what is still owed is derived by subtracting those events from earnings.
 *
 * The alternative, a running `balance` column, breaks the moment a refund lands
 * after a payout: there is no event to subtract it from, so the balance either
 * silently drifts or someone has to hand-edit money. Deriving it from the same
 * `summarizeEarnings` total the Earnings page shows means the two can never
 * disagree.
 */

/** The three states a ledger row can be in. */
export type PayoutStatus = "requested" | "paid" | "cancelled";

/** Just enough of a ledger row to do the money arithmetic. */
export interface PayoutLedgerRow {
  amountKobo: number;
  status: PayoutStatus;
}

/**
 * What an instructor has earned, been paid, and can still ask for.
 *
 * Every figure is in kobo, matching `courses.price` and `purchases.amount`.
 */
export interface PayoutBalance {
  /** Lifetime net earnings — the same total the Earnings page calls "All time". */
  earnedKobo: number;
  /** Sum of rows that reached `paid`. */
  paidKobo: number;
  /** Sum of requests still awaiting an admin decision. */
  pendingKobo: number;
  /**
   * What can be requested right now: `earned − paid − pending`.
   *
   * Floored at zero, because a refund can arrive *after* a payout and push the
   * arithmetic negative. "You owe us ₦0.00" is not a useful thing to show an
   * instructor; the earnings total dropping is the honest signal, and this
   * simply refuses to promise money that is no longer there.
   */
  availableKobo: number;
}

/**
 * Folds a lifetime earnings figure and the instructor's ledger rows into the
 * four numbers the UI needs.
 *
 * `cancelled` rows are ignored on purpose: a withdrawn request must return the
 * money to what is requestable, which is exactly what not counting it does.
 */
export function summarizePayouts(
  earnedKobo: number,
  payouts: readonly PayoutLedgerRow[],
): PayoutBalance {
  let paidKobo = 0;
  let pendingKobo = 0;

  for (const payout of payouts) {
    if (payout.status === "paid") paidKobo += payout.amountKobo;
    else if (payout.status === "requested") pendingKobo += payout.amountKobo;
  }

  return {
    earnedKobo,
    paidKobo,
    pendingKobo,
    availableKobo: Math.max(0, earnedKobo - paidKobo - pendingKobo),
  };
}

/** Display label for a status, used by both consoles. */
export function payoutStatusLabel(status: PayoutStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      return "Requested";
  }
}
