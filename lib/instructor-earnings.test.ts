import { describe, expect, test } from "vitest";
import { settleSale } from "./settlement";
import {
  formatNaira,
  INSTRUCTOR_REVENUE_SHARE,
  monthBuckets,
  monthlyEarnings,
  netEarningsKobo,
  percentChange,
  platformFeeKobo,
  summarizeEarnings,
  trendLabel,
  type EarningsSale,
} from "./instructor-earnings";

const NOW = Date.UTC(2026, 9, 9, 12, 0, 0); // 9 Oct 2026

function sale(amount: number, daysAgo: number, refunded = false): EarningsSale {
  return { amount, refunded, paidAt: NOW - daysAgo * 86_400_000 };
}

describe("platform fee and earnings", () => {
  test("splits gross revenue at the configured share", () => {
    expect(platformFeeKobo(100_000)).toBe(20_000); // ₦1,000 → ₦200 fee
    expect(netEarningsKobo(100_000)).toBe(80_000);
  });

  test("fee plus earnings always reconciles back to gross", () => {
    // The whole reason the fee is rounded once, in one place: a dashboard whose
    // fee column and earnings column do not sum to the headline is the classic
    // "which number is right?" bug.
    //
    // Also holds for snapshotted sales — see the settlement tests below, which
    // cover per-sale rounding explicitly.
    for (const gross of [1, 7, 99, 100, 333, 4_999, 123_457, 100_000_000]) {
      expect(platformFeeKobo(gross) + netEarningsKobo(gross)).toBe(gross);
    }
  });

  test("treats junk and non-positive amounts as no money", () => {
    for (const value of [0, -500, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(platformFeeKobo(value)).toBe(0);
      expect(netEarningsKobo(value)).toBe(0);
    }
  });

  test("the share and the fee rate are complementary", () => {
    expect(INSTRUCTOR_REVENUE_SHARE).toBeGreaterThan(0);
    expect(INSTRUCTOR_REVENUE_SHARE).toBeLessThan(1);
    expect(platformFeeKobo(100_000) / 100_000).toBeCloseTo(
      1 - INSTRUCTOR_REVENUE_SHARE,
      10,
    );
  });

  test("the legacy share agrees with the settlement snapshot", () => {
    // `INSTRUCTOR_REVENUE_SHARE` is now only a fallback for rows settled before
    // the snapshot existed. If the two ever disagreed, a course's earnings would
    // depend on which code path rendered it.
    for (const amount of [1, 999, 4_999, 500_000]) {
      expect(netEarningsKobo(amount)).toBe(
        settleSale({ listAmount: amount, discountAmount: 0 }).instructorShareKobo,
      );
    }
  });
});

describe("settlement snapshots", () => {
  const NOW_MS = Date.UTC(2026, 9, 9);

  /** A sale carrying the stored split, as a settled purchase row does. */
  function snapshotted(
    listAmount: number,
    daysAgo: number,
    shareKobo: number,
    refunded = false,
  ): EarningsSale {
    return {
      amount: listAmount,
      refunded,
      paidAt: NOW_MS - daysAgo * 86_400_000,
      instructorShareKobo: shareKobo,
    };
  }

  test("sums the stored shares rather than re-deriving them", () => {
    const totals = summarizeEarnings([
      snapshotted(500_000, 2, 400_000),
      snapshotted(500_000, 1, 400_000),
    ]);

    expect(totals.grossKobo).toBe(1_000_000);
    expect(totals.netEarningsKobo).toBe(800_000);
    expect(totals.platformFeeKobo).toBe(200_000);
  });

  // The reason the snapshot exists. Under the old read-time derivation these
  // numbers moved the moment the share constant changed.
  test("history does not move when the share rate changes", () => {
    const sales = [snapshotted(333, 1, 266), snapshotted(667, 1, 534)];

    const totals = summarizeEarnings(sales);
    expect(totals.netEarningsKobo).toBe(800);
    expect(totals.platformFeeKobo).toBe(200);

    // Nothing here depends on a rate, so there is no rate to change. The
    // equivalent derived figure would be netEarningsKobo(1000) === 800 too,
    // but only because this particular total divides evenly.
    expect(totals.platformFeeKobo + totals.netEarningsKobo).toBe(totals.grossKobo);
  });

  test("per-sale snapshots reconcile with the gross total", () => {
    const amounts = [1, 3, 7, 999, 1001, 33333];
    const sales = amounts.map((amount, i) =>
      snapshotted(amount, i + 1, settleSale({ listAmount: amount, discountAmount: 0 }).instructorShareKobo),
    );

    const totals = summarizeEarnings(sales);
    expect(totals.platformFeeKobo + totals.netEarningsKobo).toBe(totals.grossKobo);
  });

  // A referral discount is funded by the platform: the sale's `amount` is the
  // pre-discount list price, so the instructor still earns their full share.
  test("a discounted sale does not reduce the instructor's earnings", () => {
    const listAmount = 500_000;
    const settlement = settleSale({ listAmount, discountAmount: 100_000 });

    const totals = summarizeEarnings([
      snapshotted(listAmount, 1, settlement.instructorShareKobo),
    ]);

    expect(totals.netEarningsKobo).toBe(400_000);
    expect(totals.platformFeeKobo).toBe(100_000);
  });

  test("falls back to the derived split for legacy rows with no snapshot", () => {
    const totals = summarizeEarnings([sale(500_000, 1)]);

    expect(totals.netEarningsKobo).toBe(400_000);
    expect(totals.platformFeeKobo).toBe(100_000);
  });

  test("a refunded snapshot is reported and excluded from income", () => {
    const totals = summarizeEarnings([
      snapshotted(500_000, 2, 400_000),
      snapshotted(500_000, 1, 400_000, true),
    ]);

    expect(totals.sales).toBe(1);
    expect(totals.refunds).toBe(1);
    expect(totals.grossKobo).toBe(500_000);
    expect(totals.refundedKobo).toBe(500_000);
    expect(totals.netEarningsKobo).toBe(400_000);
  });
});

describe("summarizeEarnings", () => {
  test("counts a refund out of income but still reports it", () => {
    const totals = summarizeEarnings([
      sale(50_000, 1),
      sale(50_000, 2),
      sale(20_000, 3, true),
    ]);

    expect(totals.grossKobo).toBe(100_000);
    expect(totals.refundedKobo).toBe(20_000);
    expect(totals.sales).toBe(2);
    expect(totals.refunds).toBe(1);
    expect(totals.platformFeeKobo).toBe(20_000);
    expect(totals.netEarningsKobo).toBe(80_000);
    // Mean of the *settled* sales only — a refund is not a sale to average.
    expect(totals.averageOrderKobo).toBe(50_000);
  });

  test("an empty ledger is all zeroes, not NaN", () => {
    const totals = summarizeEarnings([]);
    expect(totals).toMatchObject({
      grossKobo: 0,
      refundedKobo: 0,
      sales: 0,
      refunds: 0,
      platformFeeKobo: 0,
      netEarningsKobo: 0,
      averageOrderKobo: 0,
    });
  });

  test("ignores zero and negative amounts rather than subtracting them", () => {
    const totals = summarizeEarnings([sale(10_000, 1), sale(0, 1), sale(-5_000, 1)]);
    expect(totals.grossKobo).toBe(10_000);
    expect(totals.sales).toBe(1);
  });

  test("an entirely refunded ledger earns nothing", () => {
    const totals = summarizeEarnings([sale(40_000, 1, true)]);
    expect(totals.grossKobo).toBe(0);
    expect(totals.refundedKobo).toBe(40_000);
    expect(totals.netEarningsKobo).toBe(0);
  });
});

describe("monthBuckets", () => {
  test("returns calendar months oldest first, ending with the current one", () => {
    const buckets = monthBuckets(3, NOW);
    expect(buckets.map((b) => b.label)).toEqual(["Aug", "Sep", "Oct"]);
    expect(buckets[2].key).toBe("2026-10");
    expect(buckets[0].key).toBe("2026-08");
  });

  test("buckets are contiguous and half-open", () => {
    const buckets = monthBuckets(12, NOW);
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i].start).toBe(buckets[i - 1].end);
    }
    const last = buckets[buckets.length - 1];
    expect(last.end).toBe(Date.UTC(2026, 10, 1));
  });

  test("rolls the year over correctly", () => {
    const buckets = monthBuckets(3, Date.UTC(2026, 0, 15));
    expect(buckets.map((b) => b.key)).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  test("clamps to a chart-shaped range", () => {
    expect(monthBuckets(0, NOW)).toHaveLength(1);
    expect(monthBuckets(-5, NOW)).toHaveLength(1);
    expect(monthBuckets(999, NOW)).toHaveLength(24);
  });
});

describe("monthlyEarnings", () => {
  test("buckets a sale into the month it settled in", () => {
    const buckets = monthBuckets(3, NOW);
    // 9 Oct, 9 Sep, 9 Aug.
    const points = monthlyEarnings(
      [sale(10_000, 0), sale(20_000, 30), sale(30_000, 61)],
      buckets,
    );

    expect(points.map((p) => p.grossKobo)).toEqual([30_000, 20_000, 10_000]);
    expect(points.map((p) => p.sales)).toEqual([1, 1, 1]);
    expect(points.map((p) => p.netEarningsKobo)).toEqual([24_000, 16_000, 8_000]);
  });

  test("a month with no sales is a zero point, not a gap", () => {
    const points = monthlyEarnings([sale(10_000, 0)], monthBuckets(6, NOW));
    expect(points).toHaveLength(6);
    expect(points.filter((p) => p.grossKobo === 0)).toHaveLength(5);
    expect(points.reduce((sum, p) => sum + p.grossKobo, 0)).toBe(10_000);
  });

  test("drops sales outside the window instead of clamping them to an edge", () => {
    const points = monthlyEarnings([sale(99_000, 400)], monthBuckets(3, NOW));
    expect(points.reduce((sum, p) => sum + p.grossKobo, 0)).toBe(0);
  });

  test("excludes refunds from the month's income but keeps them visible", () => {
    const points = monthlyEarnings(
      [sale(50_000, 0), sale(10_000, 1, true)],
      monthBuckets(1, NOW),
    );
    expect(points[0].grossKobo).toBe(50_000);
    expect(points[0].refundedKobo).toBe(10_000);
    expect(points[0].netEarningsKobo).toBe(40_000);
  });
});

describe("percentChange", () => {
  test("computes a signed percentage", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
  });

  test("returns null with no baseline rather than Infinity", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(Number.NaN, 100)).toBeNull();
  });

  test("labels trends, and stays silent when there is nothing to compare", () => {
    expect(trendLabel(50)).toBe("up 50% on the previous period");
    expect(trendLabel(-25)).toBe("down 25% on the previous period");
    expect(trendLabel(0)).toBe("level with the previous period");
    expect(trendLabel(null)).toBeNull();
  });
});

describe("formatNaira", () => {
  test("converts kobo and groups thousands", () => {
    expect(formatNaira(100_000)).toBe("₦1,000");
    expect(formatNaira(1_234_567)).toBe("₦12,345.67");
    expect(formatNaira(0)).toBe("₦0");
  });

  test("drops the decimals for whole-naira amounts", () => {
    expect(formatNaira(500)).toBe("₦5");
    expect(formatNaira(50_000)).toBe("₦500");
  });

  test("handles missing and non-finite values as zero", () => {
    expect(formatNaira(null)).toBe("₦0");
    expect(formatNaira(undefined)).toBe("₦0");
    expect(formatNaira(Number.NaN)).toBe("₦0");
  });
});
