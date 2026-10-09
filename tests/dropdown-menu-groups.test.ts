import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

/**
 * Guards a class of bug that no other check in this repo catches.
 *
 * Base UI's `MenuGroupLabel` reads `MenuGroupRootContext`, which only
 * `Menu.Group` provides. Rendering a label without that ancestor throws at
 * runtime — error #31 in a production build — the moment the popup opens. That
 * is how the dashboard's mode switcher broke: `DropdownMenuLabel` sat bare
 * inside `DropdownMenuContent>`, so every click on the switcher threw before
 * the menu could appear.
 *
 * It is invisible to `tsc --noEmit` (a valid element in a valid slot, as far as
 * JSX types are concerned) and to eslint (a structural question about ancestor
 * relationships, not a rule about identifiers). And this suite is node-only with
 * no DOM renderer, so nothing mounts a dropdown to find out.
 */

const REPO_ROOT = process.cwd();

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
          walk(rel);
        }
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push(rel);
      }
    }
  };
  walk("components");
  walk("app");
  return found;
}

/**
 * Whether every `DropdownMenuLabel` in the file has a `DropdownMenuGroup`
 * ancestor.
 *
 * Walks the real AST rather than matching text, so a nested conditional, a
 * fragment, or an item inside a sub-menu cannot fool it.
 */
function everyLabelHasGroupAncestor(sourceFile: ts.SourceFile): boolean {
  let ok = true;

  const visit = (node: ts.Node, groupDepth: number) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = ts.isJsxElement(node)
        ? node.openingElement.tagName.getText(sourceFile)
        : node.tagName.getText(sourceFile);

      if (tag === "DropdownMenuLabel" && groupDepth === 0) {
        ok = false;
      }

      const nextDepth =
        tag === "DropdownMenuGroup" ? groupDepth + 1 : groupDepth;
      node.forEachChild((child) => visit(child, nextDepth));
      return;
    }

    node.forEachChild((child) => visit(child, groupDepth));
  };

  visit(sourceFile, 0);
  return ok;
}

describe("Base UI menu group usage", () => {
  const files = sourceFiles();

  test("actually walks the source tree", () => {
    // Guards against the walk above silently descending nowhere, which would
    // let the real assertion pass vacuously.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.includes("mode-switcher"))).toBe(true);
  });

  test("DropdownMenuLabel is never rendered without a DropdownMenuGroup ancestor", () => {
    const offenders: string[] = [];

    for (const rel of files) {
      const text = readFileSync(join(REPO_ROOT, rel), "utf8");
      if (!text.includes("DropdownMenuLabel")) continue;

      const sourceFile = ts.createSourceFile(
        rel,
        text,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      );
      if (!everyLabelHasGroupAncestor(sourceFile)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  test("DropdownMenuGroup is exported, so the fix is available", () => {
    const wrapper = readFileSync(
      join(REPO_ROOT, "components/ui/dropdown-menu.tsx"),
      "utf8",
    );
    expect(wrapper).toMatch(/function DropdownMenuGroup/);
    expect(wrapper).toMatch(/^  DropdownMenuGroup,$/m);
  });

  test("the theme toggle needs no group — labels are the only constraint", () => {
    // Documents why `mode-toggle.tsx` required no change: it renders
    // DropdownMenuItem only. If someone later adds a label there, the assertion
    // above catches it.
    const toggle = readFileSync(
      join(REPO_ROOT, "components/ui/mode-toggle.tsx"),
      "utf8",
    );
    expect(toggle).not.toContain("DropdownMenuLabel");
    expect(toggle).toContain("DropdownMenuItem");
  });

  test("the mode switcher's label is inside its group", () => {
    // The specific component that shipped broken. Kept as its own assertion so
    // a failure names the component rather than just a file path.
    const switcher = readFileSync(
      join(REPO_ROOT, "components/mode-switcher.tsx"),
      "utf8",
    );
    expect(switcher).toMatch(/<DropdownMenuGroup>/);
    expect(switcher).toMatch(/<DropdownMenuLabel/);
  });
});