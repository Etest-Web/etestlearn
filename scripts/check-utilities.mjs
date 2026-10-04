/*
 * Proves a Tailwind utility actually emits CSS.
 *
 * A class like `text-success` or `shadow-raised` can typecheck perfectly while
 * producing no rule at all, because the token behind it was never registered in
 * the right `@theme` namespace. Nothing in the build or in tsc catches that —
 * the class is simply inert at runtime. This compiles globals.css with a probe
 * file containing the classes in question and greps the emitted CSS.
 *
 * Run: node scripts/check-utilities.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "tw-probe-"));

// Each entry must emit a rule; each `absent` entry must not.
const present = [
  "text-success", "bg-success/10", "border-success/30",
  "text-warning-foreground", "bg-warning/12", "border-warning/40",
  "text-info", "bg-info/10", "border-info/30",
  "shadow-raised", "shadow-overlay",
  "text-rule", "bg-rule", "border-rule", "border-rule-strong",
  "bg-surface-sunken", "bg-surface-raised",
  "tracking-editorial", "tracking-editorial-wide",
  "leading-display", "leading-display-tight", "leading-body",
  "text-brand", "bg-brand", "text-brand-ink", "border-brand",
];

const absent = [
  // The two bugs this probe was written for. Both typechecked and emitted
  // nothing, because `--elevation-*` is not a Tailwind namespace and
  // `--success` was never mapped into `--color-*`.
  "shadow-elevation-raised", "shadow-elevation-overlay",
];

writeFileSync(join(dir, "probe.html"), `<div class="${[...present, ...absent].join(" ")}"></div>`);
writeFileSync(
  join(dir, "probe.css"),
  `@import "${process.cwd()}/app/globals.css";`,
);

try {
  const out = execFileSync(
    "npx",
    [
      "@tailwindcss/cli",
      "-i", join(dir, "probe.css"),
      "-o", join(dir, "out.css"),
      "--content", join(dir, "probe.html"),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  void out;
} catch (err) {
  // @tailwindcss/cli may not be installed. Fall back to the PostCSS API, which
  // this repo already depends on via Next.
  const postcss = await import("postcss");
  const tailwind = await import("@tailwindcss/postcss");
  const fs = await import("node:fs");
  const css = fs.readFileSync(join(dir, "probe.css"), "utf8");
  fs.writeFileSync(
    join(dir, "in.css"),
    css.replace('@import "' + process.cwd() + '/app/globals.css";', ""),
  );
  // Inline the real globals so the @theme block is in scope.
  const real = fs.readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  fs.writeFileSync(
    join(dir, "in.css"),
    real + `\n@source "${join(dir, "probe.html")}";\n`,
  );
  const result = await postcss.default([
    tailwind.default(),
  ]).process(fs.readFileSync(join(dir, "in.css"), "utf8"), {
    from: join(dir, "in.css"),
  });
  fs.writeFileSync(join(dir, "out.css"), result.css);
}

const css = (await import("node:fs")).readFileSync(join(dir, "out.css"), "utf8");
const escaped = (c) => c.replace(/[/[\]().%]/g, "\\$&");

let bad = 0;
console.log("should EMIT:");
for (const cls of present) {
  const found = css.includes(`.${escaped(cls).replace(/\\-/g, "-")}`)
    || new RegExp(`\\.${escaped(cls)}(\\s|\\{|,|:|\\.)`).test(css);
  if (!found) { console.log(`  MISSING  ${cls}`); bad++; }
}
console.log("should NOT emit:");
for (const cls of absent) {
  const found = new RegExp(`\\.${escaped(cls)}(\\s|\\{|,|:|\\.)`).test(css);
  if (found) { console.log(`  UNEXPECTED ${cls}`); bad++; }
}

rmSync(dir, { recursive: true, force: true });
console.log(bad === 0 ? "\nALL OK" : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);