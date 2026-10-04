import { describe, expect, test } from "vitest";
import {
  buildMessagePreview,
  buildNotificationPreview,
  countUnreadMessages,
  formatUnreadBadge,
  groupNotificationsByDay,
  notificationDayBucket,
  notificationDayLabel,
} from "./inbox";

const NOW = new Date(2026, 2, 15, 12, 0, 0).getTime();

describe("buildMessagePreview", () => {
  test("leaves a short body alone", () => {
    expect(buildMessagePreview("see you then")).toBe("see you then");
  });

  test("collapses whitespace so a multi-line paste stays one line", () => {
    expect(buildMessagePreview("  hello\n\n  there \t you  ")).toBe(
      "hello there you",
    );
  });

  test("cuts on a word boundary and marks the cut with an ellipsis", () => {
    const body = `${"alpha ".repeat(30)}omega`;
    const preview = buildMessagePreview(body);

    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(90);
    // Not mid-word: the last visible token is a whole word.
    expect(preview.slice(0, -1).endsWith("alpha")).toBe(true);
  });

  test("falls back to a hard cut when one word is longer than the budget", () => {
    const preview = buildMessagePreview("x".repeat(200), 20);
    expect(preview).toBe(`${"x".repeat(19)}…`);
    expect(preview.length).toBe(20);
  });

  test("honours a custom budget, ellipsis included", () => {
    expect(buildMessagePreview("one two three four", 12)).toBe("one two…");
  });

  test("an empty body previews as an empty string", () => {
    expect(buildMessagePreview("   \n  ")).toBe("");
  });
});

describe("countUnreadMessages", () => {
  const messages = [
    { senderId: "them", createdAt: 100 },
    { senderId: "me", createdAt: 200 },
    { senderId: "them", createdAt: 300 },
    { senderId: "them", createdAt: 400 },
  ];

  test("counts messages newer than the marker written by somebody else", () => {
    expect(countUnreadMessages(messages, "me", 100)).toBe(2);
  });

  test("a marker of 0 makes the whole thread unread", () => {
    expect(countUnreadMessages(messages, "me", 0)).toBe(3);
  });

  test("the marker is a high-water mark, so it never moves backwards", () => {
    expect(countUnreadMessages(messages, "me", 400)).toBe(0);
    expect(countUnreadMessages(messages, "me", 10_000)).toBe(0);
  });

  test("your own messages are never unread for you", () => {
    const allMine = [
      { senderId: "me", createdAt: 1 },
      { senderId: "me", createdAt: 2 },
    ];
    expect(countUnreadMessages(allMine, "me", 0)).toBe(0);
  });

  test("an empty thread has nothing unread", () => {
    expect(countUnreadMessages([], "me", 0)).toBe(0);
  });
});

describe("formatUnreadBadge", () => {
  test("renders small counts verbatim", () => {
    expect(formatUnreadBadge(0)).toBe("0");
    expect(formatUnreadBadge(1)).toBe("1");
    expect(formatUnreadBadge(99)).toBe("99");
  });

  test("caps above the threshold so the badge cannot widen the layout", () => {
    expect(formatUnreadBadge(100)).toBe("99+");
    expect(formatUnreadBadge(4_000)).toBe("99+");
  });

  test("negative or nonsense counts collapse to zero rather than rendering NaN", () => {
    expect(formatUnreadBadge(-3)).toBe("0");
    expect(formatUnreadBadge(Number.NaN)).toBe("0");
  });
});

describe("notification day buckets", () => {
  test("today and yesterday are recognised by calendar day, not elapsed hours", () => {
    // 11pm last night is only thirteen hours ago but is still "Yesterday".
    const lateLastNight = new Date(2026, 2, 14, 23, 30, 0).getTime();
    expect(notificationDayBucket(lateLastNight, NOW)).toBe("yesterday");

    const earlyThisMorning = new Date(2026, 2, 15, 0, 5, 0).getTime();
    expect(notificationDayBucket(earlyThisMorning, NOW)).toBe("today");
  });

  test("older items get a stable local-calendar key", () => {
    const older = new Date(2025, 10, 4, 9, 30, 0).getTime();
    expect(notificationDayBucket(older, NOW)).toBe("2025-10-4");
  });

  test("labels spell out the relative days and date the rest", () => {
    expect(notificationDayLabel("today", NOW)).toBe("Today");
    expect(notificationDayLabel("yesterday", NOW)).toBe("Yesterday");
    // Same year: no year in the heading. (Month indices are zero-based, so 2
    // is March.)
    expect(notificationDayLabel("2026-2-18", NOW)).toBe("18 March");
    // Different year: the year is worth showing.
    expect(notificationDayLabel("2025-10-4", NOW)).toBe("4 November 2025");
  });

  test("a malformed bucket degrades to 'Earlier' instead of throwing", () => {
    expect(notificationDayLabel("not-a-date", NOW)).toBe("Earlier");
  });
});

describe("groupNotificationsByDay", () => {
  test("splits a newest-first list into day groups, newest group first", () => {
    const groups = groupNotificationsByDay(
      [
        { id: "a", createdAt: new Date(2026, 2, 15, 9, 0, 0).getTime() },
        { id: "b", createdAt: new Date(2026, 2, 14, 18, 0, 0).getTime() },
        { id: "c", createdAt: new Date(2026, 2, 15, 8, 0, 0).getTime() },
        { id: "d", createdAt: new Date(2026, 1, 20, 8, 0, 0).getTime() },
      ],
      NOW,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "20 February",
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "c"]);
    expect(groups[2]?.items.map((item) => item.id)).toEqual(["d"]);
  });

  test("an empty feed produces no groups at all", () => {
    expect(groupNotificationsByDay([], NOW)).toEqual([]);
  });
});

describe("buildNotificationPreview", () => {
  test("uses a longer budget than a message preview but the same cut", () => {
    const body = `${"word ".repeat(60)}end`;
    const preview = buildNotificationPreview(body);

    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(160);
    expect(buildNotificationPreview("short")).toBe("short");
  });
});
