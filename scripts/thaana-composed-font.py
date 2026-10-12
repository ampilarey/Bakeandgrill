#!/usr/bin/env python3
"""
A Thaana font with every letter + vowel mark pair as one glyph, for dompdf.

dompdf draws glyphs one after another and never reads a font's GPOS table,
so a vowel mark (fili) that the font expects to be anchored over its letter
lands wherever the mark's outline sits relative to the pen instead. Noto
Sans Thaana's marks are drawn for anchoring: on a wide letter the fili ends
up a third of a letter to the left of where it belongs (checked 2026-10-12
on the pack stickers; the browser, which shapes, was fine). Faruma's marks
were drawn for renderers like dompdf and need none of this.

This writes a copy of the font with one extra glyph per (letter, mark) pair
in the Private Use Area, each a flattened outline of the letter with the
mark translated by the font's own anchors, and the letter's advance. The PDF
path maps each cluster to its pair glyph (ThaanaVisual::order with the
composed face) and dompdf draws it as one shape, exactly where a shaping
engine would. GPOS, GSUB and GDEF are dropped from the copy: nothing that
reads it uses them.

Pair code point: U+E000 + letter index × 16 + mark index, letters
U+0780..U+07B1 (0..49), marks U+07A6..U+07B0 (0..10). App\Support\ThaanaVisual
mirrors this; fixtures/thaana_pairs.json records it for the PHP test.

Usage: scripts/thaana-composed-font.py backend/public/fonts/pdf/NotoSansThaana-Regular.ttf
       (writes NotoSansThaana-Regular-composed.ttf beside it; repeat for the Bold)
"""
import json
import sys
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

LETTERS = list(range(0x0780, 0x07B2))   # HAA .. NAA (0x07A6..0x07B0 are the marks, skipped below)
MARKS = list(range(0x07A6, 0x07B1))     # ABAFILI .. SUKUN
PUA_BASE = 0xE000


def pair_codepoint(letter_index: int, mark_index: int) -> int:
    return PUA_BASE + letter_index * 16 + mark_index


def mark_anchors(font: TTFont):
    """{(base glyph, mark glyph): (dx, dy)} from every mark-to-base lookup, nested extensions included."""
    out = {}
    if 'GPOS' not in font:
        return out
    gpos = font['GPOS'].table

    def subtables(lookup):
        for st in lookup.SubTable:
            if lookup.LookupType == 9:  # extension
                yield st.ExtSubTable
            else:
                yield st

    for lookup in gpos.LookupList.Lookup:
        for st in subtables(lookup):
            if getattr(st, 'LookupType', lookup.LookupType) != 4:
                continue
            marks = st.MarkCoverage.glyphs
            bases = st.BaseCoverage.glyphs
            for mi, mark in enumerate(marks):
                rec = st.MarkArray.MarkRecord[mi]
                for bi, base in enumerate(bases):
                    anchor = st.BaseArray.BaseRecord[bi].BaseAnchor[rec.Class]
                    if anchor is None:
                        continue
                    out.setdefault((base, mark), (anchor.XCoordinate - rec.MarkAnchor.XCoordinate, anchor.YCoordinate - rec.MarkAnchor.YCoordinate))
    return out


def compose(src: Path) -> Path:
    font = TTFont(str(src))
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    glyf = font['glyf']
    hmtx = font['hmtx']
    anchors = mark_anchors(font)
    order = list(font.getGlyphOrder())
    added = {}

    def outline(name):
        rec = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(rec)
        return rec

    for li, letter in enumerate(LETTERS):
        if letter in MARKS or letter not in cmap:
            continue
        base = cmap[letter]
        base_adv, _ = hmtx[base]
        base_box = (glyf[base].xMin, glyf[base].xMax) if glyf[base].numberOfContours else (0, base_adv)
        for mi, mark in enumerate(MARKS):
            if mark not in cmap:
                continue
            mark_glyph = cmap[mark]
            if (base, mark_glyph) in anchors:
                dx, dy = anchors[(base, mark_glyph)]
            else:
                # No anchor: centre the mark over the letter's ink.
                mg = glyf[mark_glyph]
                dx = (base_box[0] + base_box[1]) / 2 - (mg.xMin + mg.xMax) / 2 if mg.numberOfContours else 0
                dy = 0
            pen = TTGlyphPen(glyph_set)
            outline(base).replay(pen)
            outline(mark_glyph).replay(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
            new_glyph = pen.glyph()
            new_glyph.recalcBounds(glyf)
            name = f'uni{pair_codepoint(li, mi):04X}'
            order.append(name)
            glyf[name] = new_glyph
            hmtx.metrics[name] = (base_adv, new_glyph.xMin if new_glyph.numberOfContours else 0)
            added[pair_codepoint(li, mi)] = name

    font.setGlyphOrder(order)
    font['maxp'].numGlyphs = len(order)
    for table in font['cmap'].tables:
        if table.isUnicode():
            for cp, name in added.items():
                table.cmap[cp] = name
    # Shaping tables nothing in the PDF path reads, and the vertical metrics
    # (Noto ships vhea/vmtx) the new glyphs would otherwise need entries in.
    for tag in ('GPOS', 'GSUB', 'GDEF', 'vhea', 'vmtx', 'VORG'):
        if tag in font:
            del font[tag]
    # No glyph names in the copy: shorter, and nothing reads them.
    font['post'].formatType = 3.0
    out = src.with_name(src.stem + '-composed.ttf')
    font.save(str(out))
    return out, len(added)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    for arg in sys.argv[1:]:
        out, n = compose(Path(arg))
        print(f'{out}: {n} letter+mark glyphs added')
    fixture = Path(__file__).resolve().parent.parent / 'fixtures' / 'thaana_pairs.json'
    fixture.write_text(json.dumps({
        'base': PUA_BASE, 'letters': [LETTERS[0], LETTERS[-1]], 'marks': [MARKS[0], MARKS[-1]], 'stride': 16,
        'examples': {f'{l:04X}+{m:04X}': f'{pair_codepoint(LETTERS.index(l), MARKS.index(m)):04X}' for l, m in [(0x0784, 0x07A6), (0x07B1, 0x07B0), (0x0780, 0x07A8)]},
    }, indent=2) + '\n')
    print(f'{fixture}: written')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
