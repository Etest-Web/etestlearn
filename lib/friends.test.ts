import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import {
  clampCount,
  compareSearchResults,
  currentStreakDays,
  displayName,
  initialsFor,
  isSearchableTerm,
  MIN_SEARCH_LENGTH,
  mergeRelationship,
  normalizeSearchTerm,
  orderByBefriended,
  planSendRequest,
  relationshipLabel,
  roleLabel,
  searchMatchRank,
  sendRequestBlockedMessage,
  shiftDayKey,
  sortFriendsForDisplay,
  summarizeActivity,
  utcDayKey,
} from "./friends";

const DAY = 24 * 60 * 60 * 1000;
const NOON = Date.UTC(2026, 2, 15, 12, 0, 0);

describe("planSendRequest", () => {
  test("inserts when neither direction has a row", () => {
    expect(planSendRequest({ forward: null, reverse: null })).toEqual({
      kind: "insert",
    });
  });

  test("blocks a duplicate in the same direction", () => {
    expect(planSendRequest({ forward: "pending", reverse: null })).toEqual({
      kind: "blocked",
      reason: "request_sent",
    });
  });

  test("blocks when they already asked first — accepting is the way forward", () => {
    expect(planSendRequest({ forward: null, reverse: "pending" })).toEqual({
      kind: "blocked",
      reason: "request_received",
    });
  });

  test("blocks an existing friendship in either direction", () => {
    expect(planSendRequest({ forward: "accepted", reverse: null })).toEqual({
      kind: "blocked",
      reason: "already_friends",
    });
    expect(planSendRequest({ forward: null, reverse: "accepted" })).toEqual({
      kind: "blocked",
      reason: "already_friends",
    });
  });

  test("an accepted friendship wins over a pending row in the other direction", () => {
    // Defensive precedence: the state should be unreachable, but if it ever
    // happens, "already friends" is the honest message rather than "ask again".
    expect(planSendRequest({ forward: "pending", reverse: "accepted" })).toEqual({
      kind: "blocked",
      reason: "already_friends",
    });
  });

  test("re-opens a request I sent that was declined", () => {
    expect(planSendRequest({ forward: "declined", reverse: null })).toEqual({
      kind: "reopen",
    });
  });

  test("does not hijack a declined row belonging to their request", () => {
    // They asked, I declined. Now I ask. Flipping their row would silently
    // rewrite who asked whom, so a fresh forward row is inserted instead.
    expect(planSendRequest({ forward: null, reverse: "declined" })).toEqual({
      kind: "insert",
    });
  });

  test("prefers blocking when a re-ask races their fresh request", () => {
    expect(planSendRequest({ forward: "declined", reverse: "pending" })).toEqual({
      kind: "blocked",
      reason: "request_received",
    });
  });
});

describe("sendRequestBlockedMessage", () => {
  test("every refusal names the next action", () => {
    expect(sendRequestBlockedMessage("already_friends", "Ada")).toMatch(
      /already friends/,
    );
    expect(sendRequestBlockedMessage("request_sent", "Ada")).toMatch(
      /already sent Ada a friend request/,
    );
    expect(sendRequestBlockedMessage("request_received", "Ada")).toMatch(
      /Ada has already sent you a friend request/,
    );
  });
});

describe("mergeRelationship", () => {
  // The two rows for a pair, as they are stored. The id is a `friendships`
  // row id, but the rule only ever passes it through — so a stand-in is fine.
  const row = (status: "pending" | "accepted" | "declined", id: string) => ({
    status,
    friendshipId: id as Id<"friendships">,
  });

  test("no row in either direction means no relationship", () => {
    expect(mergeRelationship(null, null)).toEqual({ kind: "none" });
  });

  test("an accepted row in either direction wins", () => {
    expect(mergeRelationship(row("accepted", "f1"), null)).toEqual({
      kind: "accepted",
      friendshipId: "f1",
    });
    expect(mergeRelationship(null, row("accepted", "f2"))).toEqual({
      kind: "accepted",
      friendshipId: "f2",
    });
  });

  test("an accepted friendship beats a pending row in the other direction", () => {
    // Defensive precedence, same shape as `planSendRequest`: the state is
    // unreachable, but "friends" is the honest answer rather than "ask again".
    expect(mergeRelationship(row("declined", "f1"), row("accepted", "f2"))).toEqual({
      kind: "accepted",
      friendshipId: "f2",
    });
  });

  test("a pending row you sent is outgoing; one they sent is incoming", () => {
    expect(mergeRelationship(row("pending", "f1"), null)).toEqual({
      kind: "pending",
      direction: "outgoing",
      friendshipId: "f1",
    });
    expect(mergeRelationship(null, row("pending", "f2"))).toEqual({
      kind: "pending",
      direction: "incoming",
      friendshipId: "f2",
    });
  });

  test("a pending row you sent wins over one they sent", () => {
    // `planSendRequest` blocks this shape with "they asked first", so the
    // merge has to agree: the caller's own attempt is the one to report.
    expect(mergeRelationship(row("pending", "f1"), row("pending", "f2"))).toEqual({
      kind: "pending",
      direction: "outgoing",
      friendshipId: "f1",
    });
  });

  test("a declined row in either direction reads as declined, keeping the direction", () => {
    // The direction is what decides whether the request may be re-asked: one
    // you sent may, one they sent may not.
    expect(mergeRelationship(row("declined", "f1"), null)).toEqual({
      kind: "declined",
      direction: "outgoing",
      friendshipId: "f1",
    });
    expect(mergeRelationship(null, row("declined", "f2"))).toEqual({
      kind: "declined",
      direction: "incoming",
      friendshipId: "f2",
    });
  });

  test("a declined row outranks a pending one in the other direction", () => {
    // Unreachable in practice — `planSendRequest` refuses to create it — but
    // the priority must be total, or the same pair could read two ways.
    expect(mergeRelationship(row("declined", "f1"), row("pending", "f2"))).toEqual({
      kind: "pending",
      direction: "incoming",
      friendshipId: "f2",
    });
  });
});

describe("relationshipLabel", () => {
  // A stand-in row id — the label only ever reads `kind` and `direction`.
  const id = "f1" as Id<"friendships">;

  test("names every state, so the status is never colour-alone", () => {
    expect(relationshipLabel({ kind: "none" })).toBe("Not connected");
    expect(
      relationshipLabel({
        kind: "pending",
        direction: "outgoing",
        friendshipId: id,
      }),
    ).toBe("Request sent");
    expect(
      relationshipLabel({
        kind: "pending",
        direction: "incoming",
        friendshipId: id,
      }),
    ).toBe("Request received");
    expect(relationshipLabel({ kind: "accepted", friendshipId: id })).toBe(
      "Friends",
    );
    expect(
      relationshipLabel({ kind: "declined", direction: "incoming", friendshipId: id }),
    ).toBe("Not connected");
    expect(
      relationshipLabel({ kind: "declined", direction: "outgoing", friendshipId: id }),
    ).toBe("Not connected");
  });
});

describe("orderByBefriended", () => {
  test("puts the newest friendship first", () => {
    const items = [
      { name: "old", since: 1000, tiebreak: "a" },
      { name: "new", since: 3000, tiebreak: "b" },
      { name: "mid", since: 2000, tiebreak: "c" },
    ];
    expect(orderByBefriended(items).map((i) => i.name)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  test("is deterministic when two friendships share a timestamp", () => {
    const items = [
      { name: "b", since: 1000, tiebreak: "b" },
      { name: "a", since: 1000, tiebreak: "a" },
    ];
    // Without a tiebreak the sidebar would reshuffle on every read.
    expect(orderByBefriended(items).map((i) => i.name)).toEqual(["b", "a"]);
    expect(orderByBefriended([...items].reverse()).map((i) => i.name)).toEqual([
      "b",
      "a",
    ]);
  });

  test("does not mutate its input", () => {
    const items = [
      { name: "old", since: 1, tiebreak: "a" },
      { name: "new", since: 2, tiebreak: "b" },
    ];
    orderByBefriended(items);
    expect(items.map((i) => i.name)).toEqual(["old", "new"]);
  });
});

describe("sortFriendsForDisplay", () => {
  test("latest matches orderByBefriended — the order the server sends", () => {
    const items = [
      { name: "mid", since: 2000, tiebreak: "c" },
      { name: "new", since: 3000, tiebreak: "b" },
      { name: "old", since: 1000, tiebreak: "a" },
    ];
    expect(sortFriendsForDisplay(items, "latest").map((i) => i.name)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  test("alphabetical is case-insensitive", () => {
    const items = [
      { name: "zuri", since: 1, tiebreak: "a" },
      { name: "Ada", since: 2, tiebreak: "b" },
      { name: "bola", since: 3, tiebreak: "c" },
    ];
    expect(
      sortFriendsForDisplay(items, "alphabetical").map((i) => i.name),
    ).toEqual(["Ada", "bola", "zuri"]);
  });

  test("names equal apart from case fall back to tiebreak", () => {
    // "ada" and "Ada" compare equal under sensitivity:"base", so without the
    // tiebreak the two rows would reshuffle between reads. The boundary goes
    // the same way `orderByBefriended` draws it (larger row id first).
    const items = [
      { name: "Ada", since: 1, tiebreak: "b" },
      { name: "ada", since: 2, tiebreak: "a" },
    ];
    expect(
      sortFriendsForDisplay(items, "alphabetical").map((i) => i.tiebreak),
    ).toEqual(["b", "a"]);
    expect(
      sortFriendsForDisplay([...items].reverse(), "alphabetical").map(
        (i) => i.tiebreak,
      ),
    ).toEqual(["b", "a"]);
  });

  test("does not mutate its input", () => {
    const items = [
      { name: "zuri", since: 1, tiebreak: "a" },
      { name: "Ada", since: 2, tiebreak: "b" },
    ];
    sortFriendsForDisplay(items, "alphabetical");
    expect(items.map((i) => i.name)).toEqual(["zuri", "Ada"]);
  });
});

describe("utcDayKey / shiftDayKey", () => {
  test("buckets by UTC calendar day", () => {
    expect(utcDayKey(NOON)).toBe("2026-03-15");
    // 23:30 UTC on the 15th and 00:30 UTC on the 16th are different days.
    expect(utcDayKey(Date.UTC(2026, 2, 15, 23, 30))).toBe("2026-03-15");
    expect(utcDayKey(Date.UTC(2026, 2, 16, 0, 30))).toBe("2026-03-16");
  });

  test("walks backwards across a month boundary", () => {
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("walks forwards across a leap day", () => {
    expect(shiftDayKey("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("currentStreakDays", () => {
  const today = "2026-03-15";

  test("no activity means no streak", () => {
    expect(currentStreakDays([], today)).toBe(0);
  });

  test("counts consecutive days ending today", () => {
    expect(
      currentStreakDays(["2026-03-15", "2026-03-14", "2026-03-13"], today),
    ).toBe(3);
  });

  test("an active yesterday keeps the streak alive when today has not started", () => {
    expect(currentStreakDays(["2026-03-14", "2026-03-13"], today)).toBe(2);
  });

  test("two silent days end the streak — only today may be missing", () => {
    // Active on the 14th and 13th, then silent on the 15th and 16th. The grace
    // rule covers "today has not started yet", not "I skipped yesterday", so
    // the run is over. Matches `statistics.calculateCurrentStreak`.
    expect(currentStreakDays(["2026-03-14", "2026-03-13"], "2026-03-16")).toBe(0);
  });

  test("one gap in the middle truncates the run", () => {
    expect(
      currentStreakDays(["2026-03-15", "2026-03-13", "2026-03-12"], today),
    ).toBe(1);
  });

  test("ignores unsorted and duplicated input", () => {
    const unsorted = ["2026-03-13", "2026-03-15", "2026-03-14", "2026-03-14"];
    expect(currentStreakDays(unsorted, today)).toBe(3);
  });

  test("is bounded by maxDays", () => {
    // A 40-day run ending yesterday: today misses but the grace rule lets the
    // walk continue, so the unbounded answer would be 40.
    const fortyDays = Array.from({ length: 40 }, (_, i) =>
      utcDayKey(Date.UTC(2026, 0, 1 + i)),
    );
    expect(currentStreakDays(fortyDays, utcDayKey(Date.UTC(2026, 0, 40)))).toBe(
      40,
    );
    // Without the bound a sparse history could walk back for years.
    expect(
      currentStreakDays(fortyDays, utcDayKey(Date.UTC(2026, 0, 40)), 10),
    ).toBe(10);
  });
});

describe("summarizeActivity", () => {
  test("counts only non-revoked certificates", () => {
    const summary = summarizeActivity({
      certificates: [{}, {}, { revokedAt: NOON }],
      enrollments: [],
      activityTimestamps: [],
      todayKey: "2026-03-15",
    });
    expect(summary.certificatesEarned).toBe(2);
  });

  test("counts only enrollments strictly between 0 and 100 as in progress", () => {
    const summary = summarizeActivity({
      certificates: [],
      enrollments: [
        { progressPercent: 0 },
        { progressPercent: 40 },
        { progressPercent: 99.5 },
        { progressPercent: 100 },
      ],
      activityTimestamps: [],
      todayKey: "2026-03-15",
    });
    expect(summary.coursesInProgress).toBe(2);
  });

  test("reports the newest activity as lastActiveAt, or null when never studied", () => {
    // Two consecutive days of activity, newest first as the index returns them.
    const withActivity = summarizeActivity({
      certificates: [],
      enrollments: [],
      activityTimestamps: [NOON - 1000, NOON - DAY],
      todayKey: "2026-03-15",
    });
    expect(withActivity.lastActiveAt).toBe(NOON - 1000);
    expect(withActivity.currentStreak).toBe(2);

    const never = summarizeActivity({
      certificates: [],
      enrollments: [],
      activityTimestamps: [],
      todayKey: "2026-03-15",
    });
    expect(never.lastActiveAt).toBeNull();
    expect(never.currentStreak).toBe(0);
  });
});

describe("search", () => {
  test("normalises case and runs of whitespace", () => {
    expect(normalizeSearchTerm("  Ada   Lovelace ")).toBe("ada lovelace");
    expect(normalizeSearchTerm("")).toBe("");
  });

  test("refuses terms shorter than the minimum", () => {
    expect(MIN_SEARCH_LENGTH).toBe(2);
    expect(isSearchableTerm("a")).toBe(false);
    expect(isSearchableTerm("  a  ")).toBe(false);
    expect(isSearchableTerm("ad")).toBe(true);
  });

  test("ranks an exact name above a prefix above a substring", () => {
    expect(searchMatchRank({ name: "Ada" }, "ada")).toBe(0);
    expect(searchMatchRank({ name: "Ada Lovelace" }, "ada")).toBe(1);
    expect(searchMatchRank({ name: "Bertrand Ada" }, "ada")).toBe(2);
  });

  test("ranks email matches below every name match", () => {
    expect(searchMatchRank({ name: "Ada", email: "ada@x.com" }, "ada@x.com")).toBe(3);
    expect(searchMatchRank({ email: "ada@x.com" }, "ada@x")).toBe(4);
    expect(searchMatchRank({ email: "a@b.com" }, "ada")).toBeNull();
  });

  test("returns null when neither field matches", () => {
    expect(searchMatchRank({ name: "Grace Hopper", email: "g@h.io" }, "ada")).toBeNull();
    expect(searchMatchRank({}, "ada")).toBeNull();
    expect(searchMatchRank({ name: "Ada" }, "   ")).toBeNull();
  });

  test("sorts by rank, then name, then email — deterministically", () => {
    const rows = [
      { rank: 2, name: "Zoe Ada", email: "z@x.com" },
      { rank: 0, name: "Ada", email: "b@x.com" },
      { rank: 0, name: "Ada", email: "a@x.com" },
    ];
    expect([...rows].sort(compareSearchResults)).toEqual([
      { rank: 0, name: "Ada", email: "a@x.com" },
      { rank: 0, name: "Ada", email: "b@x.com" },
      { rank: 2, name: "Zoe Ada", email: "z@x.com" },
    ]);
  });
});

describe("displayName", () => {
  test("prefers the real name", () => {
    expect(displayName({ name: "Ada Lovelace", email: "ada@x.com" })).toBe(
      "Ada Lovelace",
    );
  });

  test("falls back through email to a neutral label", () => {
    expect(displayName({ email: "ada@x.com" })).toBe("ada@x.com");
    expect(displayName({})).toBe("Learner");
    expect(displayName({ name: "   " })).toBe("Learner");
  });
});

describe("initialsFor", () => {
  test("uses first and last word", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
    expect(initialsFor("Ada Byron King Lovelace")).toBe("AL");
  });

  test("handles a single word and degenerate input", () => {
    expect(initialsFor("Ada")).toBe("A");
    expect(initialsFor("  ")).toBe("?");
    expect(initialsFor("")).toBe("?");
  });
});

describe("roleLabel", () => {
  test("renders a word for every role, so status is never colour-only", () => {
    expect(roleLabel("student")).toBe("Student");
    expect(roleLabel("instructor")).toBe("Instructor");
    expect(roleLabel("admin")).toBe("Admin");
  });
});

describe("clampCount", () => {
  test("keeps a caller-supplied limit inside the declared bounds", () => {
    expect(clampCount(5, 1, 10, 6)).toBe(5);
    expect(clampCount(0, 1, 10, 6)).toBe(1);
    expect(clampCount(999, 1, 10, 6)).toBe(10);
  });

  test("falls back when the value is missing or unusable", () => {
    expect(clampCount(undefined, 1, 10, 6)).toBe(6);
    expect(clampCount(Number.NaN, 1, 10, 6)).toBe(6);
    expect(clampCount(Number.POSITIVE_INFINITY, 1, 10, 6)).toBe(6);
  });

  test("floors fractional limits so a limit is always a whole number of rows", () => {
    expect(clampCount(5.9, 1, 10, 6)).toBe(5);
  });
});
