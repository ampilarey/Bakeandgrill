"""Build one screen variant (POSTER_VARIANT=tv|tvp) of every TV template straight into the
repo's theme folders: backdrop-<v>.svg and backdrop-<v>.json.gz, preview-<v>.jpg,
placeholder-<v>-pN.png and variant-<v>.json (merge_tv.py folds the two halves into theme.json).
   usage: POSTER_VARIANT=tv python3 build_tv.py [filter]"""
import os, sys, io, json, gzip
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cairosvg
from PIL import Image
from svgelements import Path as SPath
import lib, kit5
from tv_posters import entries
from flatten import flatten, grads, ops_of

V = lib.VARIANT
if V not in ('tv', 'tvp'):
    sys.exit('POSTER_VARIANT must be tv or tvp')
ONLY = sys.argv[1] if len(sys.argv) > 1 else ''
THEMES = os.path.join(lib.REPO, 'backend/resources/poster-themes')
PREVIEW_W = 700 if V == 'tv' else 394
CUTOUT_UNDER = 360     # a photo slot narrower than this takes a dish's cut-out (px at Full HD)


def preview(svg, width):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=width))).convert('RGB')


def placeholder(slot):
    """The slot's own picture, drawn at the slot's 4K pixels so it never looks soft."""
    lib.EXPORT = None
    shape = slot.pop('_shape')
    x, y, w, h = slot['box']
    body = kit5.photo(shape, slot['preview_placeholder'], bg=slot['fill_behind'], rot=0)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}px" height="{h}px" viewBox="{x} {y} {w} {h}">{body}</svg>'
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(), output_width=int(min(2400, w * 2))))).convert('RGBA')


def main():
    rows = [r for r in entries() if ONLY in r['key']]
    for r in rows:
        tdir = os.path.join(THEMES, r['cat_folder'], r['key'])
        os.makedirs(tdir, exist_ok=True)
        # the preview: the whole design, words and all
        lib.EXPORT = None
        kit5._PN[0] = 0
        full = r['fn']()
        preview(full, PREVIEW_W).save(os.path.join(tdir, f'preview-{V}.jpg'), quality=86)
        # the theme half: the artwork without its words, and the slots
        lib.EXPORT = []
        kit5._PN[0] = 0
        back = r['fn']()
        slots = lib.EXPORT
        lib.EXPORT = None
        svg_path = os.path.join(tdir, f'backdrop-{V}.svg')
        open(svg_path, 'w').write(back)
        draw = flatten(svg_path, lib.W)
        for it in draw:
            if 'ops' in it:
                it['ops'] = [[o, [round(v, 2) for v in a]] for o, a in it['ops']]
        with gzip.open(os.path.join(tdir, f'backdrop-{V}.json.gz'), 'wt') as f:
            json.dump(draw, f, separators=(',', ':'))
        G = grads(back)
        texts = [s for s in slots if s['kind'] == 'text' and s['default'] != '']
        for n, s in enumerate(texts, 1):
            s['id'] = f't{n}'
            s['role_hint'] = s['role_hint'] or 'detail'
            if isinstance(s['colour'], str) and s['colour'].startswith('url('):
                g = G[s['colour'][5:-1]]
                s['colour'] = {'gradient': g, 'fallback': g['stops'][-1][1]}
            x = s['anchor_x']
            mw = {'center': 2 * min(x - lib.SAFE, lib.W - lib.SAFE - x), 'left': lib.W - lib.SAFE - x, 'right': x - lib.SAFE}[s['align']]
            hint = s.pop('maxw_hint', None)
            if hint:
                mw = min(mw, hint)
            s['max_width_mm'] = round(max(mw, s['box'][2]), 1)
            s['size_units'] = s.pop('size_mm')
            s.pop('size_pt', None)
            s['px_at'] = {k: round(s['size_units'] * (t / lib.TW), 1) for k, t in lib.OUTPUTS.items()}
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
            ph.pop('min_px_for_150ppi', None)
            big = max(lib.OUTPUTS.values()) / lib.TW
            ph['min_px'] = [int(w_u * big), int(h_u * big)]
        for s in slots:
            s.pop('maxw_hint', None)
        var = {
            'variant': V,
            'sizes': {k: {'px': [int(t), int(lib.TRIM_H[k])], 'scale': round(t / lib.TW, 5),
                          'map': f'page_px = u * {round(t / lib.TW, 5)}'} for k, t in lib.OUTPUTS.items()},
            'canvas': {'units': 'design units = px at Full HD', 'width': round(lib.W, 2), 'height': round(lib.H, 2),
                       'bleed_units': 0, 'trim_box': [0, 0, lib.TW, lib.TH],
                       'safe_inset_units': round(lib.SAFE, 2), 'min_text_units': lib.FLOOR, 'cutout_under_units': CUTOUT_UNDER,
                       'corner_keepout': None},
            'files': {'preview': f'preview-{V}.jpg', 'backdrop_svg': f'backdrop-{V}.svg', 'backdrop_draw_list': f'backdrop-{V}.json.gz'},
            'logo': next((s for s in slots if s['kind'] == 'logo'), None),
            'qr': next((s for s in slots if s['kind'] == 'qr'), None),
            'photo_slots': photos, 'text_slots': texts,
        }
        json.dump(var, open(os.path.join(tdir, f'variant-{V}.json'), 'w'), indent=1, ensure_ascii=False)
        print(V, r['id'], r['key'], len(texts), 'texts', len(photos), 'photos', flush=True)


if __name__ == '__main__':
    main()
