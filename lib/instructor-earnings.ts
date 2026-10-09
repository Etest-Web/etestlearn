/**
 * Instructor earnings arithmetic.
 *
 * Why this file exists: the instructor dashboard has to answer "how much money
 * did I make", and there are three ways to get that wrong — counting checkouts
 * that were never paid, counting refunds as income, and rounding the platform
 * fee per-sale so the parts no longer sum to the whole. All three are pure
 * arithmetic, so they live here, are unit-tested, and are called from both the
 * Convex query that builds the numbers and (for formatting) the client that
 * renders them. Same shape as `lib/publishing.ts` and `lib/certificates.ts`:
 * one rule, one place, no re-derivation in the browser.
 *
 * The numbers are all in **kobo** (1 Naira = 100 kobo), matching
 * `courses.price` and `purchases.amount`. Floating-point naira is never
 * introduced: every function here takes and returns integers.
 *
 * ── What "earnings" does and does not mean ─────────────────────────────────
 * Money collected on an instructor's courses is *gross* revenue for the
 * platform, not money in the instructor's pocket. There is no payout
 * automation in this codebase — the same reason `payments.markRefunded` is
 * annotation-only and the refund itself happens in the Paystack dashboard (see
 * that mutation's comment). So this module reports what the instructor has
 * *earned* (gross minus the platform's share) and the UI must not imply a
 * transfer happened. `INSTRUCTOR_REVENUE_SHARE` is the single knob: change it
 * here and every total, chart and table on the instructor dashboard follows.
 */

/**
 * Fraction of collected revenue an instructor earns; the remainder is the
 * platform's share. Stated here rather than per-call site so the fee can never
 * be applied at two different rates on two different screens.
 */
export const INSTRUCTOR_REVENUE_SHARE = 0.8;

/** The platform's cut. Derived, never typed in twice. */
export const PLATFORM_FEE_RATE = 1 - INSTRUCTOR_REVENUE_SHARE;

/**
 * A sale, reduced to the three fields the arithmetic needs. Kept structural so
 * a Convex `Doc<"purchases">` satisfies it directly.
 */
export interface EarningsSale {
  /** Kobo. */
  amount: number;
  /** `true` when an admin annotated this purchase as refunded. */
  refunded: boolean;
  /** Epoch ms the purchase settled — what the monthly series buckets on. */
  paidAt: number;
}

export interface EarningsTotals {
  /** Paid, non-refunded kobo. This is the base for both fee and earnings. */
  grossKobo: number;
  /** Paid *and* annotated refunded — reported, never counted as income. */
  refundedKobo: number;
  /** Settled purchases counted. */
  sales: number;
  /** Refunded purchases counted. */
  refunds: number;
  platformFeeKobo: number;
  netEarningsKobo: number;
  /** Mean value of a settled sale in kobo; 0 when there are none. */
  averageOrderKobo: number;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface MonthBucket {
  /** `YYYY-MM`, stable across locales — safe as a key or an id. */
  key: string;
  /** Three-letter month label for a chart axis. */
  label: string;
  /** Inclusive start, exclusive end, epoch ms, UTC. */
  start: number;
  end: number;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * The last `count` calendar months ending with the month containing `now`,
 * oldest first. UTC throughout, so a sale at the end of a month in one
 * timezone cannot land in the next bucket on another.
 *
 * Clamped to 1–24 buckets: this feeds a chart, and an unbounded or empty series
 * is a rendering bug rather than a data problem.
 */
export function monthBuckets(count: number, now: number): MonthBucket[] {
  const size = Math.max(1, Math.min(24, Math.floor(count)));
  const anchor = new Date(now);
  const buckets: MonthBucket[] = [];

  for (let back = size - 1; back >= 0; back -= 1) {
    const start = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() - back,
      1,
    );
    const end = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() - back + 1,
      1,
    );
    const month = new Date(start);
    buckets.push({
      key: `${month.getUTCFullYear()}-${pad2(month.getUTCMonth() + 1)}`,
      label: MONTH_LABELS[month.getUTCMonth()],
      start,
      end,
    });
  }

  return buckets;
}

/**
 * Platform fee on `grossKobo`, rounded once. Because the earnings figure below
 * is computed as gross minus this exact number, the two always reconcile —
 * per-sale rounding is what makes dashboards disagree with their own
 * transaction tables.
 */
export function platformFeeKobo(grossKobo: number): number {
  if (!Number.isFinite(grossKobo) || grossKobo <= 0) return 0;
  return Math.round(grossKobo * PLATFORM_FEE_RATE);
}

/** What the instructor earns from `grossKobo`, after the platform's share. */
export function netEarningsKobo(grossKobo: number): number {
  if (!Number.isFinite(grossKobo) || grossKobo <= 0) return 0;
  return Math.max(0, Math.round(grossKobo) - platformFeeKobo(grossKobo));
}

/**
 * Rolls a set of sales up into the money summary the dashboard renders.
 *
 * Only `paid` purchases reach here (the caller filters), and a refunded sale
 * contributes to `refundedKobo` but never to `grossKobo` — the same ledger rule
 * `admin.getPlatformOverview` applies, so an instructor's total and the
 * platform's total cannot drift apart.
 */
export function summarizeEarnings(sales: EarningsSale[]): EarningsTotals {
  let grossKobo = 0;
  let refundedKobo = 0;
  let salesCount = 0;
  let refunds = 0;

  for (const sale of sales) {
    if (!Number.isFinite(sale.amount) || sale.amount <= 0) continue;
    if (sale.refunded) {
      refundedKobo += sale.amount;
      refunds += 1;
      continue;
    }
    grossKobo += sale.amount;
    salesCount += 1;
  }

  const fee = platformFeeKobo(grossKobo);

  return {
    grossKobo,
    refundedKobo,
    sales: salesCount,
    refunds,
    platformFeeKobo: fee,
    netEarningsKobo: Math.max(0, grossKobo - fee),
    averageOrderKobo: salesCount === 0 ? 0 : Math.round(grossKobo / salesCount),
  };
}

export interface MonthPoint extends MonthBucket {
  grossKobo: number;
  refundedKobo: number;
  sales: number;
  platformFeeKobo: number;
  netEarningsKobo: number;
}

/**
 * Buckets sales into the monthly series the earnings chart plots.
 *
 * Sales outside the window are ignored rather than clamped into an edge bucket:
 * a chart that attributes an old sale to the current month is worse than one
 * that omits it, because the total on the card would not match the chart.
 */
export function monthlyEarnings(
  sales: EarningsSale[],
  buckets: MonthBucket[],
): MonthPoint[] {
  return buckets.map((bucket) => {
    const inWindow = sales.filter(
      (sale) => sale.paidAt >= bucket.start && sale.paidAt < bucket.end,
    );
    const totals = summarizeEarnings(inWindow);
    return { ...bucket, ...totals };
  });
}

/**
 * Percentage change from `previous` to `current`, or `null` when there is no
 * meaningful baseline.
 *
 * Returning `null` rather than `Infinity` or `0` is the point: the UI must be
 * able to say "no sales last month" instead of printing "+∞%", which is the
 * single most common way an earnings dashboard lies on its first day of use.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Human label for a trend, or `null` when there is nothing to compare. */
export function trendLabel(change: number | null): string | null {
  if (change === null) return null;
  if (change === 0) return "level with the previous period";
  const magnitude = Math.abs(change);
  const direction = change > 0 ? "up" : "down";
  return `${direction} ${magnitude}% on the previous period`;
}

/**
 * Formats kobo as Nigerian naira.
 *
 * `toLocaleString("en-NG")` rather than a hand-rolled grouping so the
 * thousands separators match what a learner sees everywhere else in the app.
 * Fractional naira only appears when the amount genuinely has kobo precision —
 * every price in this codebase is a round number of naira, so the common case
 * stays free of trailing `.00`.
 */
export function formatNaira(kobo: number | null | undefined): string {
  if (kobo === null || kobo === undefined || !Number.isFinite(kobo)) return "₦0";
  const negative = kobo < 0;
  const naira = Math.abs(kobo) / 100;
  const hasFraction = Math.abs(kobo) % 100 !== 0;
  const text = naira.toLocaleString("en-NG", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
  return `${negative ? "−" : ""}₦${text}`;
}
