import { describe, expect, it } from "vitest";
import { Square } from "lucide-react";

import {
  NAV_GROUPS,
  activeGroupFor,
  badgeCountFor,
  capBadge,
  groupsForRole,
  currentItemHref,
  isCurrentPath,
  landingForMode,
  matchingItem,
  modeForPath,
  modeLabel,
  modesForRole,
  roleCanUseMode,
  type NavItem,
} from "@/components/dashboard-nav";

/**
 * Pure logic, no DOM. The sidebar's whole correctness argument is "exactly one
 * item is current, and it is the right one" — which is a claim about strings and
 * prefixes, and therefore cheap to pin here rather than only to check by eye.
 */

const adminGroup = NAV_GROUPS.find((g) => g.id === "admin")!;
const teachGroup = NAV_GROUPS.find((g) => g.id === "teach")!;
const learnGroup = NAV_GROUPS.find((g) => g.id === "learn")!;

describe("modesForRole", () => {
  it("gives a student exactly one mode", () => {
    expect(modesForRole("student")).toEqual(["student"]);
  });

  it("lets an instructor teach and learn", () => {
    expect(modesForRole("instructor")).toEqual(["student", "instructor"]);
  });

  it("gives an admin all three", () => {
    expect(modesForRole("admin")).toEqual(["student", "instructor", "admin"]);
  });

  it("degrades to the learner view when the role is unknown", () => {
    // While `getCurrentUser` is in flight the sidebar must not flash a console
    // the user may not have.
    expect(modesForRole(undefined)).toEqual(["student"]);
    expect(modesForRole(null)).toEqual(["student"]);
  });
});

describe("roleCanUseMode", () => {
  it("refuses a mode above the role", () => {
    // The check that keeps a stale `glypha_mode=admin` cookie from bouncing a
    // demoted account into a console it can no longer open.
    expect(roleCanUseMode("instructor", "admin")).toBe(false);
    expect(roleCanUseMode("student", "instructor")).toBe(false);
  });

  it("allows a mode at or below the role", () => {
    expect(roleCanUseMode("admin", "admin")).toBe(true);
    expect(roleCanUseMode("admin", "student")).toBe(true);
    expect(roleCanUseMode("instructor", "student")).toBe(true);
    expect(roleCanUseMode("student", "student")).toBe(true);
  });
});

describe("groupsForRole", () => {
  it("shows a student only Learn", () => {
    expect(groupsForRole("student").map((g) => g.id)).toEqual(["learn"]);
  });

  it("shows an instructor Learn and Teach but not Admin", () => {
    expect(groupsForRole("instructor").map((g) => g.id)).toEqual([
      "learn",
      "teach",
    ]);
  });

  it("shows an admin all three", () => {
    expect(groupsForRole("admin").map((g) => g.id)).toEqual([
      "learn",
      "teach",
      "admin",
    ]);
  });

  it("never shows a console group to a student, whatever the order", () => {
    for (const group of NAV_GROUPS.filter((g) => g.mode !== "student")) {
      expect(groupsForRole("student")).not.toContain(group);
    }
  });
});

describe("isCurrentPath", () => {
  it("matches /dashboard exactly, never by prefix", () => {
    // The one exception the whole function exists for: every dashboard route
    // starts with "/dashboard/", so a prefix match here would leave "Dashboard"
    // lit on every page in the app.
    expect(isCurrentPath("/dashboard", "/dashboard")).toBe(true);
    expect(isCurrentPath("/dashboard", "/dashboard/courses")).toBe(false);
    expect(isCurrentPath("/dashboard", "/dashboard/admin")).toBe(false);
  });

  it("prefix-matches sub-sections so their sub-pages stay marked", () => {
    expect(isCurrentPath("/dashboard/courses", "/dashboard/courses")).toBe(true);
    expect(
      isCurrentPath("/dashboard/courses", "/dashboard/courses/some-slug"),
    ).toBe(true);
    expect(isCurrentPath("/dashboard/courses", "/dashboard/certificates")).toBe(
      false,
    );
  });

  it("prefix-matches a parent section, which is why resolution is longest-first", () => {
    // `isCurrentPath` is deliberately a pure prefix test, so `/dashboard/instructor`
    // DOES match `/dashboard/instructor/courses/new`. That is fine on its own —
    // a section should stay marked on its sub-pages — and it is exactly why
    // `currentItemHref` picks the longest match instead of the first hit. See
    // "never lights a parent section for a child's route" above.
    expect(
      isCurrentPath("/dashboard/instructor", "/dashboard/instructor/courses/new"),
    ).toBe(true);
    expect(
      isCurrentPath("/dashboard/instructor/courses", "/dashboard/instructor/courses/new"),
    ).toBe(true);
  });

  it("does not match a sibling that shares a name but not a path segment", () => {
    // A segment boundary, not a raw string prefix: "/dashboard/instructor-X"
    // is not under "/dashboard/instructor".
    expect(
      isCurrentPath("/dashboard/instructor", "/dashboard/instructors"),
    ).toBe(false);
    expect(
      isCurrentPath("/dashboard/courses", "/dashboard/courses-archive"),
    ).toBe(false);
  });
});

describe("matchingItem", () => {
  // `matchingItem` walks groups, which is what lets it be reused for either a
  // single group (the sidebar resolves within the open one) or the whole nav.
  const allGroups = groupsForRole("admin");
  const allItems = allGroups.flatMap((g) => g.items);

  it("returns exactly one item for every route in the nav", () => {
    // The invariant the sidebar's highlighting rests on: for any href in the
    // nav, the item it resolves to is itself. A prefix-only matcher fails this
    // for `/dashboard/instructor`, which claims its own children.
    for (const group of groupsForRole("admin")) {
      for (const item of group.items) {
        expect(
          matchingItem(item.href, allGroups)?.href,
          `${item.href} resolved elsewhere`,
        ).toBe(item.href);
      }
    }
  });

  it("never lights a parent section for a child's route", () => {
    // The regression this rule exists for. Prefix matching alone makes
    // `/dashboard/instructor` claim `/dashboard/instructor/courses/new`, so both
    // Overview and Courses would render as current.
    expect(currentItemHref("/dashboard/instructor/courses/new", allItems)).toBe(
      "/dashboard/instructor/courses",
    );
    expect(
      currentItemHref(
        "/dashboard/instructor/courses/c1/lessons/l1",
        allItems,
      ),
    ).toBe("/dashboard/instructor/courses");
  });

  it("resolves a section's own page to itself", () => {
    expect(currentItemHref("/dashboard/instructor", allItems)).toBe(
      "/dashboard/instructor",
    );
    expect(currentItemHref("/dashboard/instructor/earnings", allItems)).toBe(
      "/dashboard/instructor/earnings",
    );
  });

  it("claims /dashboard for the Dashboard link and nothing else", () => {
    // `/dashboard` matches exactly one item, and it is the exact-match-only
    // Dashboard entry rather than a longer sibling.
    expect(currentItemHref("/dashboard", allItems)).toBe("/dashboard");
  });

  it("returns null when nothing matches", () => {
    expect(currentItemHref("/dashboard/settings", allItems)).toBeNull();
    expect(currentItemHref("/", allItems)).toBeNull();
  });

  it("resolves deep routes to their section, not to a sibling", () => {
    expect(
      matchingItem("/dashboard/instructor/courses/new", allGroups)?.href,
    ).toBe("/dashboard/instructor/courses");
    expect(
      matchingItem("/dashboard/instructor/courses/c123/lessons/l9", allGroups)
        ?.href,
    ).toBe("/dashboard/instructor/courses");
    expect(
      matchingItem("/dashboard/admin/unpublish-requests", allGroups)?.href,
    ).toBe("/dashboard/admin/unpublish-requests");
    expect(matchingItem("/dashboard/admin", allGroups)?.href).toBe(
      "/dashboard/admin",
    );
  });

  it("returns null for a route outside the nav", () => {
    // `/dashboard/settings` is reached from the sidebar footer, not the groups,
    // so no item claims it and nothing highlights.
    expect(matchingItem("/dashboard/settings", allGroups)).toBeNull();
    expect(matchingItem("/", allGroups)).toBeNull();
  });
});

describe("modeForPath", () => {
  it("reads the console off the URL, so the nav can never disagree with the page", () => {
    expect(modeForPath("/dashboard/admin")).toBe("admin");
    expect(modeForPath("/dashboard/admin/users")).toBe("admin");
    expect(modeForPath("/dashboard/instructor")).toBe("instructor");
    expect(modeForPath("/dashboard/instructor/earnings")).toBe("instructor");
  });

  it("treats every learner route as the student console", () => {
    expect(modeForPath("/dashboard")).toBe("student");
    expect(modeForPath("/dashboard/courses")).toBe("student");
    expect(modeForPath("/dashboard/search")).toBe("student");
  });

  it("does not mistake a path containing 'admin' for the admin console", () => {
    expect(modeForPath("/dashboard/administrator")).toBe("student");
    expect(modeForPath("/dashboard/instructors")).toBe("student");
  });
});

describe("landingForMode", () => {
  it("sends each mode to its own console", () => {
    expect(landingForMode("student")).toBe("/dashboard");
    expect(landingForMode("instructor")).toBe("/dashboard/instructor");
    expect(landingForMode("admin")).toBe("/dashboard/admin");
  });
});

describe("modeLabel", () => {
  it("says 'Learning' for the learner mode, not 'Student'", () => {
    // Nobody is a "student" as an identity on this platform — they are learning.
    expect(modeLabel("student")).toBe("Learning");
    expect(modeLabel("instructor")).toBe("Instructor");
    expect(modeLabel("admin")).toBe("Admin");
  });
});

describe("capBadge", () => {
  it("caps at 99+", () => {
    expect(capBadge(0)).toBe("0");
    expect(capBadge(99)).toBe("99");
    expect(capBadge(100)).toBe("99+");
    expect(capBadge(200)).toBe("99+");
  });
});

describe("badgeCountFor", () => {
  const noBadge: NavItem = { href: "/x", label: "X", icon: Square };
  const badged: NavItem = {
    href: "/y",
    label: "Y",
    icon: Square,
    badge: "pendingApplications",
  };

  it("is zero when the item declares no badge", () => {
    expect(badgeCountFor(noBadge, { pendingApplications: 4 })).toBe(0);
  });

  it("is zero for a declared badge with no count yet", () => {
    // The query is still loading, or was skipped because the role does not
    // reach it. Either way: render nothing rather than a misleading 0.
    expect(badgeCountFor(badged, {})).toBe(0);
  });

  it("returns the count for a declared badge", () => {
    expect(badgeCountFor(badged, { pendingApplications: 7 })).toBe(7);
  });
});

describe("nav data", () => {
  it("gives every group a landing that is one of its own items", () => {
    // Otherwise switching to a mode would land you somewhere the switcher
    // immediately shows as "not in this console".
    for (const group of NAV_GROUPS) {
      expect(
        group.items.some((i) => i.href === group.landing),
        `${group.id} lands on ${group.landing}, which is not in the group`,
      ).toBe(true);
    }
  });

  it("routes each mode's landing to itself", () => {
    for (const mode of modesForRole("admin")) {
      expect(modeForPath(landingForMode(mode))).toBe(mode);
    }
  });

  it("has no duplicate hrefs", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the instructor-application queue reachable from the sidebar", () => {
    // It used to have no nav entry at all — the only path to it was an <a>
    // inside a sentence on the Users page, which also did a full page load.
    expect(adminGroup.items.map((i) => i.href)).toContain(
      "/dashboard/admin/applications",
    );
  });

  it("badges both admin review queues", () => {
    const badged = adminGroup.items.filter((i) => i.badge).map((i) => i.badge);
    expect(badged).toContain("pendingApplications");
    expect(badged).toContain("pendingUnpublish");
  });

  it("gives the learner console a Search entry", () => {
    // /dashboard/search previously lit up nothing in the sidebar.
    expect(learnGroup.items.map((i) => i.href)).toContain("/dashboard/search");
  });

  it("keeps the teach group inside /dashboard/instructor", () => {
    for (const item of teachGroup.items) {
      expect(item.href.startsWith("/dashboard/instructor")).toBe(true);
    }
  });
});

describe("activeGroupFor", () => {
  const all = groupsForRole("admin");
  const instructor = groupsForRole("instructor");
  const student = groupsForRole("student");

  it("shows exactly one group, chosen by the URL — switching mode swaps the nav", () => {
    // The reported bug: the sidebar rendered every accessible group stacked, so
    // switching to a console appended its links *below* the learner pages
    // instead of replacing them. One group at a time is the whole fix.
    expect(activeGroupFor(all, "/dashboard/instructor")?.id).toBe("teach");
    expect(activeGroupFor(all, "/dashboard/admin")?.id).toBe("admin");
    expect(activeGroupFor(all, "/dashboard")?.id).toBe("learn");
    expect(activeGroupFor(all, "/dashboard/courses")?.id).toBe("learn");
  });

  it("follows a console into its sub-pages", () => {
    expect(activeGroupFor(all, "/dashboard/instructor/courses/new")?.id).toBe(
      "teach",
    );
    expect(activeGroupFor(all, "/dashboard/admin/users")?.id).toBe("admin");
  });

  it("never hands a student a group they cannot open", () => {
    // /dashboard/admin is role-gated, so the admin group is not in a student's
    // set. Falling back to the first group they *can* use is what keeps the
    // sidebar honest while the page itself denies access.
    expect(activeGroupFor(student, "/dashboard/admin")?.id).toBe("learn");
    expect(activeGroupFor(student, "/dashboard/instructor")?.id).toBe("learn");
  });

  it("an instructor is offered their own console but never admin", () => {
    expect(activeGroupFor(instructor, "/dashboard/admin")?.id).toBe("learn");
    expect(activeGroupFor(instructor, "/dashboard/instructor")?.id).toBe("teach");
    expect(activeGroupFor(instructor, "/dashboard")?.id).toBe("learn");
  });

  it("an admin gets the admin console at /dashboard/admin", () => {
    expect(activeGroupFor(all, "/dashboard/admin")?.id).toBe("admin");
  });

  it("returns null for an empty set rather than throwing", () => {
    // The sidebar treats null as "no nav to paint", which is the right answer
    // for a suspended or not-yet-provisioned account.
    expect(activeGroupFor([], "/dashboard")).toBeNull();
  });

  it("picks the group whose landing matches the mode the switcher would pick", () => {
    // Keeps the switcher and the sidebar from disagreeing: choosing "Admin"
    // lands on /dashboard/admin, which must then paint the admin group.
    for (const mode of modesForRole("admin")) {
      const group = activeGroupFor(all, landingForMode(mode));
      expect(group?.mode).toBe(mode);
    }
  });

  it("only ever surfaces one group for staff, never two stacked", () => {
    // Direct assertion of the property the bug violated.
    for (const path of [
      "/dashboard",
      "/dashboard/inbox",
      "/dashboard/instructor",
      "/dashboard/admin/audit",
    ]) {
      const active = activeGroupFor(all, path);
      const matches = all.filter((g) => g.mode === modeForPath(path));
      expect(matches).toHaveLength(1);
      expect(matches[0]).toBe(active);
    }
  });
});