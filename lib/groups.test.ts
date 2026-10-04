import { describe, expect, test } from "vitest";
import {
  BROWSE_GROUPS_LIMIT,
  GROUP_NAME_MAX,
  MESSAGE_BODY_MAX,
  clampLimit,
  compareMembers,
  decideLeave,
  derivePermissions,
  deriveRelationship,
  displayName,
  groupPrimaryAction,
  initials,
  isBeforeCursor,
  lastMemberBlockedMessage,
  messagePreview,
  relationshipBadgeLabel,
  splitPage,
  validateGroupDescription,
  validateGroupName,
  validateJoinRequestMessage,
  validateMessageBody,
} from "./groups";

/**
 * The pure rules behind study groups.
 *
 * `convex/groups.ts` owns the database half; everything it decides *about* the
 * caller — what they may do, what a button should say, whether leaving is
 * allowed — lives in `lib/groups.ts` so it can be pinned here without a Convex
 * harness. The edges below are the ones the UI depends on.
 */

describe("relationship derivation", () => {
  test("a seat beats everything else", () => {
    expect(
      deriveRelationship({
        memberRole: "moderator",
        hasPendingRequest: true,
        wasDeclined: true,
      }),
    ).toBe("moderator");
    expect(
      deriveRelationship({
        memberRole: "member",
        hasPendingRequest: false,
        wasDeclined: true,
      }),
    ).toBe("member");
  });

  test("a pending request outranks a past decline", () => {
    expect(
      deriveRelationship({
        memberRole: null,
        hasPendingRequest: true,
        wasDeclined: true,
      }),
    ).toBe("pending");
  });

  test("a decline is remembered separately from a pending request", () => {
    expect(
      deriveRelationship({
        memberRole: null,
        hasPendingRequest: false,
        wasDeclined: true,
      }),
    ).toBe("request_pending");
  });

  test("a stranger can join", () => {
    expect(
      deriveRelationship({
        memberRole: null,
        hasPendingRequest: false,
        wasDeclined: false,
      }),
    ).toBe("can_join");
  });
});

describe("primary action copy", () => {
  test("open groups join instantly, invite-only ones queue", () => {
    expect(
      groupPrimaryAction({ relationship: "can_join", isPrivate: false }),
    ).toEqual({ kind: "join", label: "Join" });
    expect(
      groupPrimaryAction({ relationship: "can_join", isPrivate: true }),
    ).toEqual({ kind: "request", label: "Request to join" });
  });

  test("members see no join button at all", () => {
    expect(
      groupPrimaryAction({ relationship: "member", isPrivate: false }),
    ).toEqual({ kind: "none", label: "Joined" });
    expect(
      groupPrimaryAction({ relationship: "moderator", isPrivate: true }),
    ).toEqual({ kind: "none", label: "Joined" });
  });

  test("a pending request offers cancellation, a decline offers a fresh ask", () => {
    expect(
      groupPrimaryAction({ relationship: "pending", isPrivate: true }),
    ).toEqual({ kind: "cancel_request", label: "Cancel request" });
    expect(
      groupPrimaryAction({ relationship: "request_pending", isPrivate: false }),
    ).toEqual({ kind: "request", label: "Request to join" });
  });

  test("every relationship has a non-empty badge label", () => {
    for (const relationship of [
      "member",
      "moderator",
      "pending",
      "can_join",
      "request_pending",
    ] as const) {
      expect(relationshipBadgeLabel(relationship).length).toBeGreaterThan(0);
    }
  });
});

describe("leaving a group", () => {
  test("an ordinary member walks away", () => {
    expect(
      decideLeave({ memberRole: "member", memberCount: 4, moderatorCount: 1 }),
    ).toBe("leave");
  });

  test("the last moderator promotes somebody first", () => {
    expect(
      decideLeave({ memberRole: "moderator", memberCount: 3, moderatorCount: 1 }),
    ).toBe("promote_then_leave");
  });

  test("a moderator can walk away when another moderator remains", () => {
    expect(
      decideLeave({ memberRole: "moderator", memberCount: 5, moderatorCount: 2 }),
    ).toBe("leave");
  });

  test("the last member is refused rather than leaving a group nobody can close", () => {
    expect(
      decideLeave({ memberRole: "moderator", memberCount: 1, moderatorCount: 1 }),
    ).toBe("blocked_last_member");
    expect(
      decideLeave({ memberRole: "member", memberCount: 1, moderatorCount: 1 }),
    ).toBe("blocked_last_member");
  });

  test("a non-member is refused", () => {
    expect(
      decideLeave({ memberRole: null, memberCount: 3, moderatorCount: 1 }),
    ).toBe("blocked_last_member");
  });

  test("the refusal names the way out", () => {
    expect(lastMemberBlockedMessage()).toMatch(/archive/i);
  });
});

describe("permissions", () => {
  const owner = {
    memberRole: null,
    isArchived: false,
    isCourseOwner: true,
    leaveBlocked: false,
  };

  test("the course instructor can archive and manage members even without a seat", () => {
    const permissions = derivePermissions(owner);
    expect(permissions.canArchive).toBe(true);
    expect(permissions.canManageMembers).toBe(true);
    expect(permissions.canPost).toBe(false);
    expect(permissions.canReadMessages).toBe(true);
  });

  test("a group moderator runs the conversation but cannot close it or mint peers", () => {
    const permissions = derivePermissions({
      memberRole: "moderator",
      isArchived: false,
      isCourseOwner: false,
      leaveBlocked: false,
    });
    expect(permissions.canPost).toBe(true);
    expect(permissions.canApprove).toBe(true);
    expect(permissions.canEdit).toBe(true);
    expect(permissions.canArchive).toBe(false);
    expect(permissions.canManageMembers).toBe(false);
  });

  test("an archived group still accepts readers but takes no new messages", () => {
    const permissions = derivePermissions({
      memberRole: "moderator",
      isArchived: true,
      isCourseOwner: false,
      leaveBlocked: false,
    });
    expect(permissions.canPost).toBe(false);
    expect(permissions.canReadMessages).toBe(true);
    expect(permissions.canLeave).toBe(true);
  });

  test("a blocked leave is reported as blocked", () => {
    const permissions = derivePermissions({
      memberRole: "moderator",
      isArchived: false,
      isCourseOwner: false,
      leaveBlocked: true,
    });
    expect(permissions.canLeave).toBe(false);
  });
});

describe("validation", () => {
  test("group names have a floor and a ceiling", () => {
    expect(validateGroupName("ab")).toMatch(/at least/);
    expect(validateGroupName("abc")).toBeNull();
    expect(validateGroupName("  abc  ")).toBeNull();
    expect(validateGroupName("x".repeat(GROUP_NAME_MAX))).toBeNull();
    expect(validateGroupName("x".repeat(GROUP_NAME_MAX + 1))).toMatch(/under/);
  });

  test("descriptions are optional but bounded", () => {
    expect(validateGroupDescription(undefined)).toBeNull();
    expect(validateGroupDescription("")).toBeNull();
    expect(validateGroupDescription("x".repeat(501))).toMatch(/under/);
  });

  test("message bodies reject whitespace-only and over-long input", () => {
    expect(validateMessageBody("   \n  ")).toMatch(/Write something/);
    expect(validateMessageBody("hello")).toBeNull();
    expect(validateMessageBody("x".repeat(MESSAGE_BODY_MAX))).toBeNull();
    expect(validateMessageBody("x".repeat(MESSAGE_BODY_MAX + 1))).toMatch(/under/);
  });

  test("join-request notes are optional but bounded", () => {
    expect(validateJoinRequestMessage(undefined)).toBeNull();
    expect(validateJoinRequestMessage("x".repeat(401))).toMatch(/under/);
  });
});

describe("limits", () => {
  test("a missing or nonsense limit falls back to the server bound", () => {
    expect(clampLimit(undefined, BROWSE_GROUPS_LIMIT)).toBe(BROWSE_GROUPS_LIMIT);
    expect(clampLimit(Number.NaN, 10)).toBe(10);
    expect(clampLimit(5, 10)).toBe(5);
  });

  test("a client cannot ask for more than the bound, or fewer than one", () => {
    expect(clampLimit(9999, 10)).toBe(10);
    expect(clampLimit(0, 10)).toBe(1);
    expect(clampLimit(-5, 10)).toBe(1);
  });
});

describe("message-feed pagination", () => {
  const cursor = { createdAt: 1000, id: "m" };

  test("older timestamps come before the cursor", () => {
    expect(isBeforeCursor({ createdAt: 999, _id: "z" }, cursor)).toBe(true);
    expect(isBeforeCursor({ createdAt: 1000, _id: "z" }, cursor)).toBe(false);
    expect(isBeforeCursor({ createdAt: 1001, _id: "a" }, cursor)).toBe(false);
  });

  test("ties break on _id, so a shared millisecond cannot skip a message", () => {
    expect(isBeforeCursor({ createdAt: 1000, _id: "a" }, cursor)).toBe(true);
    // The cursor itself is excluded…
    expect(isBeforeCursor({ createdAt: 1000, _id: "m" }, cursor)).toBe(false);
    // …and so is anything indexed after it in that same millisecond.
    expect(isBeforeCursor({ createdAt: 1000, _id: "z" }, cursor)).toBe(false);
  });

  test("splitPage reports more only when the over-fetch found one more", () => {
    expect(splitPage([1, 2, 3], 2)).toEqual({ items: [1, 2], hasMore: true });
    expect(splitPage([1, 2], 2)).toEqual({ items: [1, 2], hasMore: false });
    expect(splitPage([], 2)).toEqual({ items: [], hasMore: false });
  });
});

describe("roster ordering", () => {
  test("moderators first, then longest-tenured", () => {
    const rows = [
      { role: "member" as const, joinedAt: 1, name: "Zoe" },
      { role: "moderator" as const, joinedAt: 90, name: "Ann" },
      { role: "member" as const, joinedAt: 2, name: "Bob" },
      { role: "moderator" as const, joinedAt: 5, name: "Cyd" },
    ];
    expect([...rows].sort(compareMembers).map((r) => r.name)).toEqual([
      "Cyd",
      "Ann",
      "Zoe",
      "Bob",
    ]);
  });
});

describe("display helpers", () => {
  test("a missing name falls back to the mailbox, then to 'Member'", () => {
    expect(displayName({ name: "Ada Lovelace" })).toBe("Ada Lovelace");
    // Never an empty string: an empty author line reads as a broken message.
    expect(displayName({ name: "   " })).toBe("Member");
    expect(displayName({ name: null, email: "grace@example.com" })).toBe("grace");
    expect(displayName(null)).toBe("Member");
    expect(displayName({ name: "", email: "" })).toBe("Member");
  });

  test("initials come from the first and last word", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada")).toBe("A");
    expect(initials("  ")).toBe("?");
    expect(initials("ada mid love")).toBe("AL");
  });

  test("previews take the first line, collapse whitespace and clip", () => {
    expect(messagePreview("  hello\nworld  ")).toBe("hello");
    expect(messagePreview("a     b")).toBe("a b");
    expect(messagePreview("x".repeat(200), 10)).toHaveLength(10);
  });
});