import { describe, expect, it } from "vitest";
import { computeProgress } from "./progress";

describe("computeProgress", () => {
  it("is 0 when nothing is completed", () => {
    expect(computeProgress(0, 10)).toBe(0);
  });

  it("rounds to the nearest percent", () => {
    expect(computeProgress(1, 3)).toBe(33);
    expect(computeProgress(2, 3)).toBe(67);
    expect(computeProgress(2, 6)).toBe(33);
  });

  it("reaches exactly 100 when all lessons are done", () => {
    expect(computeProgress(10, 10)).toBe(100);
  });

  it("clamps at 100 even with inconsistent counts", () => {
    expect(computeProgress(12, 10)).toBe(100);
  });

  it("handles courses without lessons", () => {
    expect(computeProgress(0, 0)).toBe(0);
    expect(computeProgress(3, 0)).toBe(0);
  });
});
