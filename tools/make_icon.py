#!/usr/bin/env python3
"""Regenerates build/icon.icns and build/icon.png from a full-bleed source image.

macOS does not mask app icons the way iOS does — whatever shape the artwork is, is the shape the
Dock shows. Our source art is a full-bleed square, so on most systems it rendered as a hard
square next to every rounded neighbour. (Newer macOS shapes some icons itself, which is why it
looked right on some installations and not others.) This bakes the shape in, so it is a squircle
everywhere.

Two things make an icon sit correctly on the Dock:

  * The shape is a SUPERELLIPSE, not a rounded rectangle. Apple's squircle has continuous
    curvature — the straight edge eases into the corner instead of meeting an arc tangentially.
    |x|^n + |y|^n = 1 with n = 5 is the usual approximation and is visually indistinguishable at
    icon sizes.
  * The artwork occupies 824 of the 1024pt canvas, centred. That inset is Apple's grid; every
    system icon follows it, so an icon that fills its canvas looks oversized beside them.

Usage: python3 tools/make_icon.py [source.png]

Defaults to build/icon-source.png, which is the original full-bleed artwork and is kept in the
repo precisely so this is repeatable — the script must never be pointed at its own output, or the
icon would be inset again on every run. It refuses a source that already has transparent corners.

Requires Pillow, and iconutil (macOS built-in) to assemble the .icns.
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"

CANVAS = 1024
BODY = 824
INSET = (CANVAS - BODY) // 2
EXPONENT = 5.0
SUPERSAMPLE = 4

# Subtle, and deliberately much lighter than a UI shadow — it exists so the icon reads as sitting
# on the Dock rather than pasted onto it.
SHADOW_OFFSET = 8
SHADOW_BLUR = 14
SHADOW_ALPHA = 60

ICNS_SIZES = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]


def squircle_mask(size: int, exponent: float = EXPONENT, supersample: int = SUPERSAMPLE) -> Image.Image:
    """An 8-bit alpha mask of a superellipse, drawn large and downscaled so the edge is smooth."""
    hi = size * supersample
    mask = Image.new("L", (hi, hi), 0)
    px = mask.load()
    half = hi / 2.0
    for y in range(hi):
        ny = abs((y + 0.5 - half) / half)
        ny_e = ny**exponent
        if ny_e > 1.0:
            continue
        # Solve |x|^n = 1 - |y|^n for the row's half-width, and fill that span directly — far
        # cheaper than testing every pixel, and exact.
        nx = (1.0 - ny_e) ** (1.0 / exponent)
        span = int(nx * half)
        for x in range(int(half - span), int(half + span)):
            px[x, y] = 255
    return mask.resize((size, size), Image.LANCZOS)


def build_icon(source_path: Path, shadow: bool = True) -> Image.Image:
    art = Image.open(source_path).convert("RGBA").resize((BODY, BODY), Image.LANCZOS)

    # Intersect the squircle with whatever alpha the source already has, rather than replacing it.
    existing = art.getchannel("A")
    mask = squircle_mask(BODY)
    combined = Image.new("L", (BODY, BODY))
    combined.putdata([min(a, m) for a, m in zip(existing.getdata(), mask.getdata())])
    art.putalpha(combined)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))

    if shadow:
        layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        silhouette = Image.new("RGBA", (BODY, BODY), (0, 0, 0, SHADOW_ALPHA))
        silhouette.putalpha(combined.point(lambda v: v * SHADOW_ALPHA // 255))
        layer.paste(silhouette, (INSET, INSET + SHADOW_OFFSET), silhouette)
        canvas = Image.alpha_composite(canvas, layer.filter(ImageFilter.GaussianBlur(SHADOW_BLUR)))

    top = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    top.paste(art, (INSET, INSET), art)
    return Image.alpha_composite(canvas, top)


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else BUILD / "icon-source.png"
    if not source.exists():
        print(f"No source image at {source}", file=sys.stderr)
        return 1

    # The source must be the ORIGINAL full-bleed artwork, never this script's own output —
    # re-shaping an already-inset icon would inset it a second time and shrink it every run.
    probe = Image.open(source).convert("RGBA")
    if probe.getpixel((2, 2))[3] < 250:
        print(
            f"{source} has transparent corners, so it looks like it has already been shaped.\n"
            "Point this at the original full-bleed artwork instead.",
            file=sys.stderr
        )
        return 1

    icon = build_icon(source)

    iconset = BUILD / "icon.iconset"
    if iconset.exists():
        for f in iconset.iterdir():
            f.unlink()
    else:
        iconset.mkdir()

    for name, size in ICNS_SIZES:
        icon.resize((size, size), Image.LANCZOS).save(iconset / name)

    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(BUILD / "icon.icns")], check=True
    )
    for f in iconset.iterdir():
        f.unlink()
    iconset.rmdir()

    # The Dock icon during `npm run dev` comes from this one (see main/index.ts) — keep the two in
    # step so development and a packaged build look the same.
    icon.resize((512, 512), Image.LANCZOS).save(BUILD / "icon.png")

    print(f"Wrote {BUILD / 'icon.icns'} and {BUILD / 'icon.png'} ({BODY}/{CANVAS} squircle)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
