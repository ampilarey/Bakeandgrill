"""Rebuild an SVG from backdrop.json (as the PHP side would) to check nothing was lost."""
import json, sys, glob, os, io, gzip
import cairosvg
from PIL import Image

def d_of(ops):
    return ''.join(op + ' '.join(str(v) for v in p) for op, p in ops)

PW, PH = 426, 600

def to_svg(items):
    defs, body = [], []
    for i, it in enumerate(items):
        if 'photo_slot' in it:
            continue
        f = it['fill']
        if isinstance(f, dict):
            g = f['gradient']; gid = f'g{i}'
            st = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in g['stops'])
            if g['type'] == 'linear':
                x1, y1, x2, y2 = g['coords']; defs.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')
            else:
                cx, cy, r = g['coords']; defs.append(f'<radialGradient id="{gid}" cx="{cx}" cy="{cy}" r="{r}">{st}</radialGradient>')
            fill = f'url(#{gid})'
        else:
            fill = f or 'none'
        a = f' fill="{fill}"'
        if 'opacity' in it: a += f' opacity="{it["opacity"]}"'
        if it.get('rule'): a += ' fill-rule="evenodd"'
        if it.get('stroke'):
            s = it['stroke']; a += f' stroke="{s["colour"]}" stroke-width="{s["width_mm"]}" stroke-linecap="{s["cap"]}"'
            if s['dash']: a += f' stroke-dasharray="{s["dash"]}"'
        if it.get('clip_rect'):
            x, y, w, h = it['clip_rect']; defs.append(f'<clipPath id="c{i}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath>'); a += f' clip-path="url(#c{i})"'
        body.append(f'<path d="{d_of(it["ops"])}"{a}/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PW} {PH}" width="{PW}mm" height="{PH}mm"><defs>{"".join(defs)}</defs>{"".join(body)}</svg>'

def check(args):
    j, pw, ph = args
    global PW, PH
    PW, PH = pw, ph
    from PIL import ImageChops, ImageStat
    a = Image.open(io.BytesIO(cairosvg.svg2png(url=j.replace('.json.gz', '.svg'), output_width=200))).convert('RGB')
    b = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=to_svg(json.load(gzip.open(j))).encode(), output_width=200))).convert('RGB')
    d = ImageChops.difference(a, b)
    return j, sum(ImageStat.Stat(d).mean) / 3


if __name__ == '__main__':
    from multiprocessing import Pool
    root, pat, pw, ph = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    files = sorted(glob.glob(root + '/*/*/' + pat))
    with Pool(4) as pool:
        res = pool.map(check, [(f, pw, ph) for f in files])
    worst = sorted(res, key=lambda r: -r[1])[:3]
    print(len(res), 'checked; worst mean pixel diff:', [(os.path.basename(os.path.dirname(w[0])), round(w[1], 3)) for w in worst])
