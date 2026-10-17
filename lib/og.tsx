/**
 * The generated OpenGraph cards.
 * ==============================
 *
 * Everything shared between the three image routes lives here so each route is
 * a thin wrapper: fetch the data, hand it to `renderOgCard`. Keeping the layout
 * pure is what makes it checkable in the node vitest env, and it means the
 * fallback card cannot drift from the rich one — they are the same component
 * with an optional image.
 *
 * Two failure modes are handled deliberately, because a card that throws is
 * worse than an ugly one: the route answers 500 and the link preview goes
 * blank for every share.
 *
 *   · **A missing or dead thumbnail** falls through to the image-less card.
 *   · **An unreachable remote image** does the same — see `resolveOgImage`,
 *     which resolves the picture to a data URI *before* rendering, so a signed
 *     Convex URL that has expired degrades instead of exploding. Resolution
 *     happens up front rather than via try/catch around the render because
 *     satori's error surfaces during response streaming, after the catch.
 */

import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site";
import {
  clampOgText,
  loadOgFonts,
  OG_FONT_FAMILY,
  OG_HEIGHT,
  OG_WIDTH,
  ogOnBrandSubtle,
  ogPalette,
} from "@/lib/og-brand";

/**
 * How long a remote thumbnail may take before the card gives up on it.
 *
 * 5s, not 2s: a cold fetch of a signed Convex storage URL measured past 2.5s
 * and silently dropped the picture from the card (warm fetches are fast, so
 * the degradation is intermittent and looks like "sometimes the thumbnail
 * is missing"). The card is not latency-critical — a crawler is fetching it —
 * and a 500 here would be worse than a slow 200.
 */
const IMAGE_TIMEOUT_MS = 5_000;

/**
 * Fetches an image to a data URI, or returns null.
 *
 * Null means "render the card without it" — an expired signed URL, a 404'd
 * thumbnail, or a slow origin all produce a good card rather than a 500.
 */
export async function resolveOgImage(
  url: string | undefined | null,
): Promise<string | null> {
  if (!url) return null;

  // Thumbnails are sometimes stored relative; the card is rendered
  // server-side with no request context, so the origin has to come from the
  // site config. `new URL` passes absolute URLs through untouched.
  let absolute: string;
  try {
    absolute = new URL(url, siteConfig.url).href;
  } catch {
    return null;
  }

  try {
    const response = await fetch(absolute, {
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      // The card is regenerated per render; a cached copy of a thumbnail that
      // has since been replaced is the wrong picture on a live course.
      cache: "no-store",
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    // Network error, timeout, or a body that is not decodable. All the same
    // answer: no picture on the card.
    return null;
  }
}

/** Small caps line above the title — a course's category, or a fixed label. */
function Eyebrow({ children }: { children: string }) {
  return (
    <span
      style={{
        fontFamily: OG_FONT_FAMILY,
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: ogPalette.brandSoft,
        marginBottom: 22,
      }}
    >
      {children}
    </span>
  );
}

/** Rounded pill for level / price / "Free". */
function Chip({ children }: { children: string }) {
  return (
    <span
      style={{
        fontFamily: OG_FONT_FAMILY,
        fontSize: 23,
        fontWeight: 600,
        color: ogPalette.white,
        background: "rgba(255, 255, 255, 0.16)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        borderRadius: 999,
        padding: "9px 22px",
      }}
    >
      {children}
    </span>
  );
}

/** The mark. Drawn rather than loaded as SVG: satori's SVG support is limited
 * and our logo files use `<defs>`/`<use>`, which it does not resolve. */
function Wordmark() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <span
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: "rgba(255, 255, 255, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.32)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: OG_FONT_FAMILY,
          fontSize: 28,
          fontWeight: 600,
          color: ogPalette.white,
        }}
      >
        G
      </span>
      <span
        style={{
          fontFamily: OG_FONT_FAMILY,
          fontSize: 27,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: ogPalette.white,
        }}
      >
        Glypha Learn
      </span>
    </span>
  );
}

export type OgCardProps = {
  /** The headline. Rendered in `clampOgText` before it reaches the layout. */
  title: string;
  /** Small caps line — a course category, or a fixed label like "Instructor". */
  eyebrow?: string;
  /** Supporting line: an instructor's name, or the site tagline. */
  subtitle?: string;
  /** Level / price / course count pills. Empty strings are dropped. */
  chips?: string[];
  /** A resolved data URI, or null for the plain brand card. */
  image?: string | null;
};

/**
 * The card itself.
 *
 * Fixed 1200×630. The title block is given a fixed height rather than being
 * allowed to grow, so a two-line title and a three-line title produce the same
 * card underneath it — otherwise the chips row jumps between shares and a
 * short title leaves the card looking unfinished.
 */
export function OgCard({
  title,
  eyebrow,
  subtitle,
  chips = [],
  image = null,
}: OgCardProps) {
  const chips_ = chips.filter(Boolean);
  const headline = clampOgText(title, image ? 78 : 96);

  return (
    <div
      style={{
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: "flex",
        flexDirection: "row",
        background: `linear-gradient(135deg, ${ogPalette.brand} 0%, ${ogPalette.brandInk} 100%)`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
        }}
      >
        <Wordmark />

        <div style={{ display: "flex", flexDirection: "column", height: 300, justifyContent: "center" }}>
          {eyebrow ? <Eyebrow>{clampOgText(eyebrow, 34)}</Eyebrow> : null}
          <span
            style={{
              fontFamily: OG_FONT_FAMILY,
              fontSize: image ? 56 : 64,
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: -1.2,
              color: ogPalette.white,
              wordBreak: "break-word",
            }}
          >
            {headline}
          </span>
          {subtitle ? (
            <span
              style={{
                fontFamily: OG_FONT_FAMILY,
                fontSize: 27,
                fontWeight: 400,
                color: ogOnBrandSubtle,
                marginTop: 20,
              }}
            >
              {clampOgText(subtitle, 62)}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {chips_.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
          <span
            style={{
              fontFamily: OG_FONT_FAMILY,
              fontSize: 22,
              fontWeight: 400,
              color: "rgba(255, 255, 255, 0.7)",
            }}
          >
            {new URL(siteConfig.url).host}
          </span>
        </div>
      </div>

      {image ? (
        // `display: flex` is mandatory here, not stylistic: satori errors on any
        // element with more than one child that is not explicitly flex, and
        // this panel holds both the picture and its scrim.
        //
        // The scrim is the SECOND child rather than being stacked with
        // `zIndex: 1` — positioned siblings paint in DOM order, so it lands on
        // top of the image without a z-index, and satori warns that a numeric
        // zIndex is being unit-ised.
        <div
          style={{
            width: 440,
            height: OG_HEIGHT,
            display: "flex",
            overflow: "hidden",
          }}
        >
          <img
            src={image}
            width={440}
            height={OG_HEIGHT}
            style={{ width: 440, height: OG_HEIGHT, objectFit: "cover" }}
          />
          {/* A translucent brand scrim over the photo's left edge so the
              picture reads as part of the card rather than pasted onto it. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              background:
                "linear-gradient(90deg, rgba(148, 93, 163, 0.55) 0%, rgba(148, 93, 163, 0) 42%)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Builds the response for one card.
 *
 * Fonts are loaded once per isolate (see `loadOgFonts`); the image is resolved
 * per render. Callers pass an already-fetched `image` data URI — or null, which
 * is exactly the brand fallback.
 */
export async function renderOgCard(props: OgCardProps): Promise<ImageResponse> {
  return new ImageResponse(<OgCard {...props} />, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await loadOgFonts(),
  });
}

/** The plain branded card — what the landing page shares, and what every other
 * card falls back to when it has no picture.
 *
 * The copy is curated rather than assembled from `siteConfig`: the wordmark at
 * the top of the card already says "Glypha Learn", so echoing it in the eyebrow
 * wastes the one line above the headline on a label the reader has just read,
 * and `siteConfig.description` is a 160-character paragraph that truncates
 * mid-word at card width ("…offering expert-l…"). */
export function renderOgBrandCard(): Promise<ImageResponse> {
  return renderOgCard({
    eyebrow: "Online learning platform",
    title: siteConfig.tagline,
    subtitle: "Expert-led courses, quizzes and verified certificates.",
    chips: ["Courses", "Quizzes", "Verified certificates"],
  });
}
