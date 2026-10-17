"""
Builds the static display weights the OpenGraph cards render with.

Why this script exists
======================
`next/og` needs real TTF/OTF bytes, and two dead ends were checked first:

  1. Google's CSS API serves **woff2** to any modern UA, and satori cannot
     decompress woff2. The v1 API (`fonts.googleapis.com/css?family=…`) still
     serves TTF, but those files are the *latin subset* — a cmap walk over the
     downloaded bytes showed they contain **no U+20A6 (₦)**.
  2. `gwfh.mranftl.com` advertises per-weight TTFs but proxies the same
     subsetted gstatic files.

Outfit was the first choice (it is the site's body face) and is unusable here:
a cmap walk over upstream's own `Outfit[wght].ttf` confirms the family does not
contain U+20A6 at all, and `next/og`'s bundled fallback
(`noto-sans-v27-latin-regular.ttf`, also latin-only) has no ₦ either — so a
price chip would make satori fail to find a glyph and error the route. Archivo
is used instead: it is already the design system's `--font-display`
(`app/globals.css:12`) and its full character set covers the naira sign.

Weights are instanced out of upstream's variable font
(`ofl/archivo/Archivo[wdth,wght].ttf`, SIL OFL 1.1 — see `lib/og-brand.ts`) and
subset to Latin + currency + punctuation. Run this only when changing the
weights; the binaries are committed.

    PYTHONPATH=/tmp/opencode/pylibs python3 scripts/build-og-fonts.py

fontTools is a dev-only tool here and is deliberately NOT a project dependency.
"""

import sys
from pathlib import Path

sys.path.insert(0, "/tmp/opencode/pylibs")

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = Path("/tmp/opencode/ArchivoVar.ttf")
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# Latin, the general punctuation a title might contain (curly quotes, dashes,
# ellipsis, bullets), a few dingbats (trademark, degree, ×, minus), and — the
# whole point — U+20A6, the naira sign.
RANGES = [
    range(0x0020, 0x007F),  # Basic Latin, incl. space and ASCII punctuation
    range(0x00A0, 0x0100),  # Latin-1 Supplement + Latin Extended-A start
    range(0x2013, 0x2020),  # endash, emdash, quotes
    range(0x2039, 0x203B),  # single/double angle quotes
    [0x00D7, 0x2022, 0x2026, 0x20AC, 0x20A6, 0x2122, 0x2212],
]

WEIGHTS = {"Archivo-Regular.ttf": 400, "Archivo-SemiBold.ttf": 600}


def codepoints() -> set[int]:
    out: set[int] = set()
    for source in RANGES:
        out.update(source)
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, weight in WEIGHTS.items():
        font = TTFont(SOURCE)
        # Pinning every axis turns the variable font into a static one (fvar is
        # dropped), which is what satori expects: it selects a weight by matching
        # against the registered weight range, not by reading a variation axis.
        # Archivo carries a `wdth` axis as well, pinned to its normal 100.
        instancer.instantiateVariableFont(
            font, {"wght": weight, "wdth": 100}, inplace=True
        )

        options = subset.Options()
        options.flavor = None  # TTF, not woff2 — satori cannot read woff2.
        options.drop_tables += ["DSIG"]
        options.notdef_outline = True
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=codepoints())
        subsetter.subset(font)

        out = OUT_DIR / filename
        font.save(out)
        print(f"{out.relative_to(OUT_DIR.parent.parent)}  {out.stat().st_size / 1024:.1f} KB  wght={weight}")


if __name__ == "__main__":
    main()
