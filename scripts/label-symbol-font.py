#!/usr/bin/env python3
"""
The label symbol font (wrap-around labels, 2026-10-12): the recycling marks a
bottle or pack label carries, as glyphs rather than drawings, so the browser
sheet, dompdf's PDF and the thermal bitmap (GD) all set them the same way.

DejaVu Sans (Bitstream Vera licence, backend/public/fonts/DEJAVU-LICENSE.txt)
carries the Unicode recycling symbols U+2672–U+267D: the universal loop, the
seven plastic resin codes, generic materials, the black loop, and the two
paper marks. This subsets that range (plus space, digits and the capitals the
captions might ride on) into a small TTF for the PDF and GD and a WOFF2 for
the web sheet. Run once; the outputs are committed:

    python3 scripts/label-symbol-font.py

Needs fontTools and brotli (scripts/install-fonttools.sh) and DejaVu Sans on
the machine (/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf, or SRC=...).
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get('SRC', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
TTF_OUT = os.path.join(ROOT, 'backend/public/fonts/pdf/LabelSymbols.ttf')
WOFF2_OUT = os.path.join(ROOT, 'backend/public/fonts/label-symbols.woff2')
UNICODES = list(range(0x2672, 0x267E)) + [0x0020] + list(range(0x0030, 0x003A)) + list(range(0x0041, 0x005B))


def build(flavor):
    options = subset.Options()
    options.flavor = flavor
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.recalc_bounds = True
    options.layout_features = ['*']
    font = subset.load_font(SRC, options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=UNICODES)
    subsetter.subset(font)
    return font


def main():
    if not os.path.exists(SRC):
        print(f'DejaVu Sans not found at {SRC}; set SRC=', file=sys.stderr)
        return 1
    ttf = build(None)
    ttf.save(TTF_OUT)
    woff2 = build('woff2')
    woff2.save(WOFF2_OUT)
    check = TTFont(TTF_OUT)
    cmap = check.getBestCmap()
    missing = [hex(u) for u in range(0x2672, 0x267E) if u not in cmap]
    if missing:
        print('missing glyphs:', missing, file=sys.stderr)
        return 1
    print(f"{TTF_OUT}: {os.path.getsize(TTF_OUT)} bytes, {len(cmap)} glyphs; "
          f"ascent {check['hhea'].ascent / check['head'].unitsPerEm:.3f}, descent {-check['hhea'].descent / check['head'].unitsPerEm:.3f}")
    print(f'{WOFF2_OUT}: {os.path.getsize(WOFF2_OUT)} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
