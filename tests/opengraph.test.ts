import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { isPathAllowedDuringMaintenance } from "@/lib/maintenance";
import { clampOgText, ogPalette } from "@/lib/og-brand";

/**
 * OpenGraph: the failure modes that do not fail loudly.
 * ====================================================
 *
 * Generated share cards break in ways a build will never catch — a 500 on an
 * `og:image` is a blank preview for every link already shared, and a card
 * suppressed by an unrelated metadata key looks identical from the outside.
 * These assertions cover the three that are invisible until a stranger shares
 * a link:
 *
 *   1. The image routes must be publicly reachable. They carry no file
 *      extension, so `proxy.ts`'s matcher does not skip them, and the crawler
 *      fetching one has no Clerk session. Miss this and `auth.protect()`
 *      answers a share-card fetch with a 307 to sign-in.
 *   2. The card's fonts must actually contain the naira sign. Outfit does not,
 *      and neither does `next/og`'s bundled Noto Sans fallback — see
 *      `scripts/build-og-fonts.py`. Re-running that script against the wrong
 *      family turns every priced course's card into a 500, and the only
 *      symptom is a missing thumbnail in a feed.
 *   3. No metadata layout may set `openGraph.images`. Next gates the file-based
 *      card on `hasOwnProperty("images")`, so even `images: undefined`
 *      suppresses it silently.
 *
 * The proxy check is a source assertion rather than an import: pulling
 * `proxy.ts` into a node test executes `clerkMiddleware(...)` at module scope.
 * `lib/maintenance.ts` is pure by design and imported directly instead.
 */

const REPO_ROOT = process.cwd();

const IMAGE_ROUTES = ["/opengraph-image", "/twitter-image"];

/** The entries of `isPublicRoute`, read out of proxy.ts's source. */
function publicRouteEntries(): string[] {
  const source = readFileSync(join(REPO_ROOT, "proxy.ts"), "utf8");
  const start = source.indexOf("const isPublicRoute = createRouteMatcher([");
  expect(start, "proxy.ts no longer declares isPublicRoute").toBeGreaterThan(-1);

  const open = source.indexOf("[", start);
  const close = source.indexOf("])", open);
  const block = source.slice(open + 1, close);

  return [...block.matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

/**
 * The codepoints a TTF actually maps, walking its `cmap` subtables.
 *
 * Supports format 4 (BMP) and format 12 (full Unicode) — the two shapes
 * fontTools and fontmake emit. Deliberately minimal: this is an assertion
 * about glyph coverage, not a font library.
 */
function ttfCodepoints(path: string): Set<number> {
  const buf = readFileSync(path);
  const found = new Set<number>();

  const tableCount = buf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < tableCount; i++) {
    const record = 12 + i * 16;
    if (buf.toString("ascii", record, record + 4) === "cmap") {
      cmapOffset = buf.readUInt32BE(record + 8);
      break;
    }
  }
  expect(cmapOffset, `${path} has no cmap table`).toBeGreaterThan(-1);

  const subtableCount = buf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtableCount; i++) {
    const record = cmapOffset + 4 + i * 8;
    const base = cmapOffset + buf.readUInt32BE(record + 4);
    const format = buf.readUInt16BE(base);

    if (format === 12) {
      const groups = buf.readUInt32BE(base + 12);
      for (let g = 0; g < groups; g++) {
        const group = base + 16 + g * 12;
        for (let cp = buf.readUInt32BE(group); cp <= buf.readUInt32BE(group + 4); cp++) {
          found.add(cp);
        }
      }
    } else if (format === 4) {
      const segCount = buf.readUInt16BE(base + 6) / 2;
      const endBase = base + 14;
      const startBase = endBase + segCount * 2 + 2;
      for (let s = 0; s < segCount; s++) {
        const start = buf.readUInt16BE(startBase + s * 2);
        const end = buf.readUInt16BE(endBase + s * 2);
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) found.add(cp);
      }
    }
  }
  return found;
}

const NairaSign = 0x20a6;

describe("OpenGraph image routes stay reachable", () => {
  test.each(IMAGE_ROUTES)("%s is a public route", (route) => {
    expect(publicRouteEntries()).toContain(route);
  });

  test("the crawler surfaces survive maintenance mode", () => {
    // A 503 on an og:image takes the preview down on every link already shared,
    // for the whole length of the outage.
    for (const route of IMAGE_ROUTES) {
      expect(
        isPathAllowedDuringMaintenance(route, { allowInstructorApplications: false }),
      ).toBe(true);
    }
  });
});

describe("OpenGraph card fonts", () => {
  const fonts = ["Archivo-Regular.ttf", "Archivo-SemiBold.ttf"];

  test.each(fonts)("%s contains the naira sign", (font) => {
    // The whole reason the weights are generated rather than downloaded: a
    // latin-subset font has no U+20A6, satori cannot find the glyph, and the
    // route errors instead of rendering "₦15,000".
    expect(ttfCodepoints(join(REPO_ROOT, "assets/fonts", font)).has(NairaSign)).toBe(true);
  });

  test.each(fonts)("%s is a subset, not a whole family", (font) => {
    const size = readFileSync(join(REPO_ROOT, "assets/fonts", font)).byteLength;
    // Upstream's variable font is ~640KB. A committed instance of that means
    // the subsetting step in scripts/build-og-fonts.py was skipped.
    expect(size).toBeLessThan(150 * 1024);
  });
});

describe("OpenGraph metadata does not suppress the generated card", () => {
  const layouts = [
    "app/layout.tsx",
    "app/courses/[slug]/layout.tsx",
    "app/instructors/[instructorId]/layout.tsx",
  ];

  test.each(layouts)("%s leaves openGraph.images absent", (layout) => {
    const source = readFileSync(join(REPO_ROOT, layout), "utf8");
    // `images: undefined` still satisfies hasOwnProperty and would silently
    // stop Next applying the file-based card. Absent, not empty. Anchored to a
    // line start so prose in a comment ("no `images`: see …") does not trip it.
    expect(source).not.toMatch(/^\s*images\s*:/m);
  });
});

describe("OpenGraph brand constants", () => {
  test("the palette still matches the documented brand values", () => {
    // Cross-checked against two comments that already exist in the codebase:
    // the themeColor note in app/layout.tsx and the token note in
    // app/globals.css. If these fail, `scripts/oklch-to-hex.py` is stale.
    expect(ogPalette.brand).toBe("#945DA3");
    expect(ogPalette.brandInk).toBe("#6C3C78");
  });

  test("clampOgText collapses whitespace and caps in code points", () => {
    expect(clampOgText("  a   b  ", 10)).toBe("a b");
    expect(clampOgText("short", 10)).toBe("short");
    expect(clampOgText("abcdefghij", 5)).toBe("abcd…");
    expect(clampOgText(undefined, 5)).toBe("");
    // Code-point slicing: a surrogate pair must not be cut in half into a
    // lone surrogate, which renders as a replacement glyph.
    expect(clampOgText("👍👍👍👍👍", 3)).toBe("👍👍…");
  });
});
