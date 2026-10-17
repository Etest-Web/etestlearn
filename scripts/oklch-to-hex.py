"""oklch -> sRGB hex, for the OG card constants.

satori's colour parser does not understand `oklch()`, so the card has to carry
hex literals. Rather than eyeballing them, this prints the exact hex for the
tokens the card uses (read out of app/globals.css).

    python3 scripts/oklch-to-hex.py
"""
import math

VALUES = [
    ("--background (light)", 0.992, 0.005, 318.82),
    ("--foreground (light)", 0.145, 0.012, 318.82),
    ("--brand (light)", 0.56556, 0.121, 318.82),
    ("--brand-ink (light)", 0.44, 0.109, 318.82),
    ("--muted (light)", 0.965, 0.01, 318.82),
    ("--background (dark)", 0.145, 0.01, 318.82),
    ("--foreground (dark)", 0.985, 0.006, 318.82),
    ("--brand (dark)", 0.72, 0.102, 318.82),
    ("--card (dark)", 0.205, 0.011, 318.82),
]


def oklch_to_linear_srgb(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )


def to_srgb8(v):
    # CSS Color 4: convert linear-light to sRGB, then encode with the gamma curve.
    v = max(0.0, min(1.0, v))
    enc = 12.92 * v if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055
    return round(max(0.0, min(1.0, enc)) * 255)


for name, L, C, H in VALUES:
    r, g, b = oklch_to_linear_srgb(L, C, H)
    hexv = "#{:02X}{:02X}{:02X}".format(to_srgb8(r), to_srgb8(g), to_srgb8(b))
    print(f"{name:22} oklch({L} {C} {H})  ->  {hexv}")
