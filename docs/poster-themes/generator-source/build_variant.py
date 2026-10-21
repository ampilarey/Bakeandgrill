"""Build one variant (POSTER_VARIANT=large|small) for all templates:
   print PDFs for its two sizes, and its half of every theme (files suffixed -large / -small + variant-<v>.json).
   usage: POSTER_VARIANT=small python3 build_variant.py OUT [filter]"""
import os, sys, io, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cairosvg
from PIL import Image
from svgelements import Path as SPath
import lib, kit5
from catalog import entries
from flatten import flatten, grads, ops_of

V = lib.VARIANT
OUT = sys.argv[1]
ONLY = sys.argv[2] if len(sys.argv) > 2 else ''
THEMES = os.path.join(OUT, 'repo/backend/resources/poster-themes')
MONEY = re.compile(r'(MVR|\d+\s*%|\d+X\b|^\d+$|FREE|HALF PRICE|2 FOR 1|BUY 1|GET 1|ONLY)', re.I)


def size_svg(svg, trim_mm):
    """Crop the variant canvas to one paper size: trim + 3 mm bleed, physical mm."""
    s = trim_mm / 420.0
    th = {420.0: 594.0, 297.0: 420.0, 210.0: 297.0, 148.0: 210.0}[trim_mm]
    pw, ph = trim_mm + 6, th + 6
    vw, vh = pw / s, ph / s
    x0 = lib.BLEED + 210.0 - vw / 2
    y0 = lib.BLEED + 297.0 - vh / 2
    svg = re.sub(r'width="[^"]+mm" height="[^"]+mm" viewBox="[^"]+"',
                 f'width="{pw:.3f}mm" height="{ph:.3f}mm" viewBox="{x0:.4f} {y0:.4f} {vw:.4f} {vh:.4f}"', svg, count=1)
    return svg


def trim_png(svg, width):
    svg = re.sub(r'viewBox="[^"]+"', f'viewBox="{lib.BLEED} {lib.BLEED} 420 594"', svg, count=1)
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=width))).convert('RGB')


def roles(texts):
    big = max((s['size_mm'] for s in texts if s['font'] == 'anton'), default=0)
    for n, s in enumerate(texts, 1):
        s['id'] = f't{n}'
        if s['role_hint']:
            continue
        if s['baseline_y'] > lib.H - lib.SAFE - 22:
            s['role_hint'] = 'footer' if s['size_mm'] <= lib.FOOT + 0.1 else 'detail'
        elif s['font'].startswith('fraunces') and s['baseline_y'] < 230:
            s['role_hint'] = 'eyebrow'
        elif s['font'] == 'anton' and s['size_mm'] >= big * 0.6:
            s['role_hint'] = 'headline_or_offer' if MONEY.search(s['default']) else 'headline'
        elif MONEY.search(s['default']):
            s['role_hint'] = 'price_or_offer'
        else:
            s['role_hint'] = 'detail'


def placeholder(slot):
    lib.EXPORT = None
    shape = slot.pop('_shape')
    x, y, w, h = slot['box']
    body = kit5.photo(shape, slot['preview_placeholder'], bg=slot['fill_behind'], rot=0)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}mm" height="{h}mm" viewBox="{x} {y} {w} {h}">{body}</svg>'
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=int(min(1200, w / 25.4 * 120))))).convert('RGBA')


def main():
    rows = [r for r in entries() if ONLY in r['key']]
    for r in rows:
        # print files for this variant's two sizes
        lib.EXPORT = None
        kit5._PN[0] = 0
        full = r['fn']()
        for size, trim in lib.OUTPUTS.items():
            d = os.path.join(OUT, f'print-{size}', r['cat_folder'])
            os.makedirs(d, exist_ok=True)
            cairosvg.svg2pdf(bytestring=size_svg(full, trim).encode(),
                             write_to=os.path.join(d, r['file'].replace('BakeGrill_A2_', f'BakeGrill_{size}_') + '.pdf'))
        tdir = os.path.join(THEMES, r['cat_folder'], r['key'])
        os.makedirs(tdir, exist_ok=True)
        trim_png(full, 700).save(os.path.join(tdir, f'preview-{V}.jpg'), quality=86)
        # theme half
        lib.EXPORT = []
        kit5._PN[0] = 0
        back = r['fn']()
        slots = lib.EXPORT
        lib.EXPORT = None
        open(os.path.join(tdir, f'backdrop-{V}.svg'), 'w').write(back)
        draw = flatten(os.path.join(tdir, f'backdrop-{V}.svg'), lib.W)
        for it in draw:
            if 'ops' in it:
                it['ops'] = [[o, [round(v, 2) for v in a]] for o, a in it['ops']]
        json.dump(draw, open(os.path.join(tdir, f'backdrop-{V}.json'), 'w'), separators=(',', ':'))
        G = grads(back)
        texts = [s for s in slots if s['kind'] == 'text' and s['default'] != '']
        roles(texts)
        for s in texts:
            if isinstance(s['colour'], str) and s['colour'].startswith('url('):
                g = G[s['colour'][5:-1]]
                s['colour'] = {'gradient': g, 'fallback': g['stops'][-1][1]}
            x = s['anchor_x']
            mw = {'center': 2 * min(x - lib.SAFE, lib.W - lib.SAFE - x), 'left': lib.W - lib.SAFE - x, 'right': x - lib.SAFE}[s['align']]
            s['max_width_mm'] = round(max(mw, s['box'][2]), 1)
            s['size_units'] = s.pop('size_mm')
            s.pop('size_pt', None)
            s['pt_at'] = {k: round(s['size_units'] * (t / 420) / 0.352778, 1) for k, t in lib.OUTPUTS.items()}
        photos = [s for s in slots if s['kind'] == 'photo']
        for ph in photos:
            ph.pop('shape_args', None)
            sp = SPath(ph['clip_path_d'])
            if ph['rotation_deg']:
                sp = sp * f"rotate({ph['rotation_deg']}deg, {ph['rotation_centre'][0]}, {ph['rotation_centre'][1]})"
            ph['clip_ops'] = [[o, [round(v, 2) for v in a]] for o, a in ops_of(sp)]
            pim = placeholder(ph)
            fn = f'placeholder-{V}-{ph["id"]}.png'
            pim.save(os.path.join(tdir, fn), optimize=True)
            ph['placeholder_image'] = fn
            ph['preview_placeholder'] = ph['preview_placeholder'].replace('illus:', 'illustration:')
            w_u, h_u = ph['box'][2], ph['box'][3]
            big = max(lib.OUTPUTS.values()) / 420
            ph['min_px_for_150ppi'] = [int(w_u * big / 25.4 * 150), int(h_u * big / 25.4 * 150)]
        var = {
            'variant': V, 'sizes': {k: {'trim_mm': [t, lib.TRIM_H[k]], 'scale': round(t / 420, 5),
                                        'page_mm': [t + 6, lib.TRIM_H[k] + 6],
                                        'map': f'page_mm = (u - {lib.BLEED}) * {round(t / 420, 5)} + 3 ; y: (u - {lib.BLEED}) * {round(t / 420, 5)} + 3 + {round((lib.TRIM_H[k] - 594 * t / 420) / 2, 3)}'}
                                    for k, t in lib.OUTPUTS.items()},
            'canvas': {'units': 'design units = mm at A2 trim', 'width': round(lib.W, 2), 'height': round(lib.H, 2),
                       'bleed_units': lib.BLEED, 'trim_box': [lib.BLEED, lib.BLEED, 420, 594],
                       'safe_inset_units': round(lib.SAFE, 2), 'min_text_units': lib.FLOOR,
                       'corner_keepout': None if V == 'small' else {'diameter_units': 20, 'centre_from_cut_units': 20}},
            'files': {'preview': f'preview-{V}.jpg', 'backdrop_svg': f'backdrop-{V}.svg', 'backdrop_draw_list': f'backdrop-{V}.json'},
            'logo': next((s for s in slots if s['kind'] == 'logo'), None),
            'qr': next((s for s in slots if s['kind'] == 'qr'), None),
            'photo_slots': photos, 'text_slots': texts,
            'print_files': {k: r['file'].replace('BakeGrill_A2_', f'BakeGrill_{k}_') + '.pdf' for k in lib.OUTPUTS},
        }
        json.dump(var, open(os.path.join(tdir, f'variant-{V}.json'), 'w'), indent=1, ensure_ascii=False)
        print(V, r['id'], flush=True)


if __name__ == '__main__':
    main()
