import { renderOgBrandCard } from "@/lib/og";
import { OG_HEIGHT, OG_WIDTH } from "@/lib/og-brand";

/**
 * The site-wide card: what `/`, `/courses` and `/become-instructor` share.
 *
 * It also serves as the fallback image for every dynamic card — a course with
 * no thumbnail and an instructor with no photo both end up here, because Next
 * walks the route tree from the root segment and the leaf-most `opengraph-image`
 * that exists wins (`resolve-metadata.js`, `mergeStaticMetadata`).
 *
 * `runtime` is node, not edge, because the fonts are read off disk — see
 * `loadOgFonts` in `lib/og-brand.ts` for why they are files rather than a
 * remote fetch.
 */
export const runtime = "nodejs";

export const alt = "Glypha Learn — Learn skills that move you forward";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";

export default function Image() {
  return renderOgBrandCard();
}
