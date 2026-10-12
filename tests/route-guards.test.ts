import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The role-gated consoles must be gated in one place per console.
 *
 * Both `/dashboard/admin` and `/dashboard/instructor` are UX-gated by a segment
 * layout, not by each page wrapping itself. That is the shape that survives a
 * new page being added: the gate cannot be forgotten, because there is no
 * per-page gate to remember. The admin console previously did the opposite —
 * eleven pages each wrapping `<AdminGuard>` — and one route had already slipped
 * out of the sidebar because of the same "remember every time" tax.
 *
 * This is a source-structure assertion, the same tool
 * `tests/dropdown-menu-groups.test.ts` uses, because the suite is node-only and
 * mounts nothing.
 */

const REPO_ROOT = process.cwd();

function pageFiles(dir: string): string[] {
  const found: string[] = [];
  if (!existsSync(join(REPO_ROOT, dir))) return found;

  for (const entry of readdirSync(join(REPO_ROOT, dir), {
    withFileTypes: true,
  })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...pageFiles(rel));
    } else if (entry.name === "page.tsx") {
      found.push(rel);
    }
  }
  return found;
}

describe("console segment guards", () => {
  test("the admin console is gated by its layout, not by each page", () => {
    const layout = readFileSync(
      join(REPO_ROOT, "app/dashboard/admin/layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/import \{ AdminGuard \}/);
    expect(layout).toMatch(/<AdminGuard>/);

    // No page may re-wrap itself: duplication is what let a route go unguarded
    // in the first place, and a second gate here would be false comfort.
    const duplicated = pageFiles("app/dashboard/admin").filter((rel) =>
      readFileSync(join(REPO_ROOT, rel), "utf8").includes("AdminGuard"),
    );
    expect(duplicated).toEqual([]);
  });

  test("the instructor console stays gated by its layout", () => {
    const layout = readFileSync(
      join(REPO_ROOT, "app/dashboard/instructor/layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/import \{ InstructorGuard \}/);
    expect(layout).toMatch(/<InstructorGuard>/);
  });

  test("there is at least one admin page under the guard", () => {
    // Guards against the walk above silently finding nothing, which would let
    // the "no duplicated guard" assertion pass vacuously.
    expect(pageFiles("app/dashboard/admin").length).toBeGreaterThan(5);
  });
});
