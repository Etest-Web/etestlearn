import { describe, expect, test } from "vitest";
import {
  isPaidCourse,
  unpublishBlockedMessage,
  unpublishNotGatedMessage,
  unpublishPolicy,
} from "./publishing";

describe("isPaidCourse", () => {
  test("treats absent, zero and junk prices as free", () => {
    expect(isPaidCourse(undefined)).toBe(false);
    expect(isPaidCourse(0)).toBe(false);
    expect(isPaidCourse(-500)).toBe(false);
    // A NaN price would otherwise fall through every comparison and read as
    // "paid" by accident, so it is explicitly not money.
    expect(isPaidCourse(Number.NaN)).toBe(false);
  });

  test("treats any positive kobo amount as paid", () => {
    expect(isPaidCourse(1)).toBe(true);
    expect(isPaidCourse(50000)).toBe(true);
  });
});

describe("unpublishPolicy", () => {
  test("a free course is always the owner's to unpublish", () => {
    expect(unpublishPolicy({ paidSales: 0 })).toBe("free");
    expect(unpublishPolicy({ price: 0, paidSales: 12 })).toBe("free");
  });

  test("a paid course with no buyers is unpublishable directly", () => {
    // Nobody has handed over money, so there is no buyer to strand.
    expect(unpublishPolicy({ price: 50000, paidSales: 0 })).toBe("paid_unsold");
  });

  test("a paid course with a buyer needs approval", () => {
    expect(unpublishPolicy({ price: 50000, paidSales: 1 })).toBe("needs_approval");
    expect(unpublishPolicy({ price: 50000, paidSales: 400 })).toBe("needs_approval");
  });

  test("one paid sale is enough to gate it", () => {
    // The scam is per-buyer, not per-volume: a single learner who paid and
    // then finds the listing gone is the exact case being protected.
    expect(unpublishPolicy({ price: 100, paidSales: 1 })).toBe("needs_approval");
  });
});

describe("messages", () => {
  test("the block message names the number of affected learners and the way out", () => {
    const message = unpublishBlockedMessage(3);
    expect(message).toContain("3 learners have already paid");
    expect(message).toContain("admin approval");
  });

  test("the block message reads correctly for a single learner", () => {
    const message = unpublishBlockedMessage(1);
    expect(message).toContain("1 learner has already paid");
    expect(message).not.toContain("1 learners");
  });

  test("the not-gated message points back at the direct action", () => {
    expect(unpublishNotGatedMessage()).toMatch(/unpublish it directly/i);
  });
});