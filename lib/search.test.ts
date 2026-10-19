import { describe, expect, test } from "vitest";
import {
  compareRanked,
  instructorMatchRank,
  matchExcerpt,
  SEARCH_LIMITS,
  toCourseHit,
} from "./search";

describe("instructorMatchRank", () => {
  test("ranks an exact name above a prefix above a substring", () => {
    const profile = { name: "Ada Lovelace" };
    expect(instructorMatchRank(profile, "Ada Lovelace")).toBe(0);
    expect(instructorMatchRank(profile, "Ada")).toBe(1);
    expect(instructorMatchRank(profile, "Lovelace")).toBe(2);
  });

  test("matches the bio when the name does not", () => {
    const profile = {
      name: "Grace Hopper",
      bio: "Teaches compilers and the history of COBOL.",
    };
    expect(instructorMatchRank(profile, "compilers")).toBe(3);
    expect(instructorMatchRank(profile, "history")).toBe(3);
  });

  test("matches the location last of all", () => {
    const profile = { name: "Grace Hopper", location: "Lagos, Nigeria" };
    expect(instructorMatchRank(profile, "lagos")).toBe(4);
  });

  test("a name match outranks a bio match", () => {
    const profile = {
      name: "Grace Hopper",
      bio: "Grace teaches compilers.",
    };
    expect(instructorMatchRank(profile, "grace")).toBe(1);
  });

  test("returns null when nothing matches", () => {
    expect(instructorMatchRank({ name: "Grace Hopper" }, "ada")).toBeNull();
    expect(instructorMatchRank({}, "ada")).toBeNull();
    expect(instructorMatchRank({ name: "Ada" }, "   ")).toBeNull();
  });

  test("ignores case and surrounding whitespace", () => {
    expect(instructorMatchRank({ name: "Ada Lovelace" }, "  ADA  ")).toBe(1);
  });
});

describe("compareRanked", () => {
  test("orders by rank, then name, then id — deterministically", () => {
    const rows = [
      { rank: 2, name: "Zoe Ada", _id: "c" },
      { rank: 0, name: "Ada", _id: "b" },
      { rank: 0, name: "Ada", _id: "a" },
    ];
    expect([...rows].sort(compareRanked).map((r) => r._id)).toEqual(["a", "b", "c"]);
  });

  test("does not reshuffle when the input order changes", () => {
    const rows = [
      { rank: 0, name: "Ada", _id: "a" },
      { rank: 0, name: "Ada", _id: "b" },
    ];
    expect([...rows].sort(compareRanked)).toEqual(
      [...rows].reverse().sort(compareRanked),
    );
  });
});

describe("matchExcerpt", () => {
  test("marks the match and keeps the surrounding text", () => {
    const parts = matchExcerpt("She teaches Python and JavaScript.", "python");
    expect(parts.map((p) => p.text).join("")).toBe("She teaches Python and JavaScript.");
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(["Python"]);
  });

  test("marks every occurrence", () => {
    const parts = matchExcerpt("ada and ada again", "ada");
    expect(parts.filter((p) => p.match)).toHaveLength(2);
  });

  test("cuts a window around the hit and marks both ends", () => {
    const bio = `${"x".repeat(300)}needle${"y".repeat(300)}`;
    const parts = matchExcerpt(bio, "needle", 60);
    const text = parts.map((p) => p.text).join("");
    expect(text).toContain("needle");
    expect(text.length).toBeLessThanOrEqual(62); // the window plus two ellipses
    expect(text.startsWith("…")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
  });

  test("keeps the hit inside the window even when it sits at the very start", () => {
    const parts = matchExcerpt("needle in a haystack", "needle", 20);
    expect(parts.map((p) => p.text).join("")).toContain("needle");
  });

  test("falls back to the opening text when nothing matched", () => {
    const parts = matchExcerpt("Grace Hopper teaches compilers.", "ada");
    expect(parts).toEqual([
      { text: "Grace Hopper teaches compilers.", match: false },
    ]);
  });

  test("clips a long unmatched text with an ellipsis", () => {
    const parts = matchExcerpt("z".repeat(300), "ada", 50);
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe(`${"z".repeat(50)}…`);
  });

  test("returns nothing for empty text", () => {
    expect(matchExcerpt("", "ada")).toEqual([]);
    expect(matchExcerpt("   ", "ada")).toEqual([]);
  });

  test("never returns markup of its own — the parts are plain text", () => {
    const parts = matchExcerpt("<script>alert(1)</script> ada", "ada");
    // The function adds no markup: the parts are the source text, split at the
    // match. Escaping is React's job at render time, not this function's —
    // so the only tags in the output are the ones the author typed.
    expect(parts.map((p) => p.text).join("")).toBe("<script>alert(1)</script> ada");
    const tags = parts.flatMap((p) => p.text.match(/<[^>]+>/g) ?? []);
    expect(tags).toEqual(["<script>", "</script>"]);
  });
});

describe("toCourseHit", () => {
  test("carries only what a result card renders", () => {
    const hit = toCourseHit({
      _id: "c1" as never,
      title: "Compilers 101",
      slug: "compilers-101",
      description: "A course",
      thumbnailUrl: "/thumb.jpg",
      category: "Engineering",
      level: "Beginner",
      price: 500000,
      currency: "NGN",
    });
    expect(hit).toEqual({
      _id: "c1",
      title: "Compilers 101",
      slug: "compilers-101",
      description: "A course",
      thumbnailUrl: "/thumb.jpg",
      category: "Engineering",
      level: "Beginner",
      price: 500000,
      currency: "NGN",
    });
  });

  test("leaves absent fields absent rather than empty strings", () => {
    const hit = toCourseHit({
      _id: "c1" as never,
      title: "Free course",
      slug: "free-course",
      description: "A course",
    });
    expect(hit.thumbnailUrl).toBeUndefined();
    expect(hit.price).toBeUndefined();
  });
});

describe("SEARCH_LIMITS", () => {
  test("each section has its own bound", () => {
    expect(SEARCH_LIMITS.courses).toBeGreaterThan(0);
    expect(SEARCH_LIMITS.instructors).toBeGreaterThan(0);
    expect(SEARCH_LIMITS.people).toBeGreaterThan(0);
  });
});
