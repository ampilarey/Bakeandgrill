#!/usr/bin/env python3
"""The logo with moving flames (owner, 2026-10-07), traced from brand/logo-light.png.

Writes, from the one PNG:
  backend/public/brand/logo-animated.svg, logo-animated-dark.svg   standalone, animated
  backend/resources/views/partials/animated-logo.blade.php         website header (inline)
  apps/online-order-web/src/components/animatedLogoShapes.ts       order app top bar
  apps/online-order-web/src/components/AnimatedLogo.css

Needs potrace (apt install potrace) and python3 opencv + numpy. Run from anywhere:
  python3 scripts/brand-animated-logo.py
Layers: two side flames, the main flame, the drop, then the lettering. Each flame is
filled where the layers in front hide it, so a sway never opens a gap, but never
where the open centre of the main flame can reach (simulated with the CSS sway).
"""
import json, os, re, subprocess, tempfile
import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'backend/public/brand/logo-light.png')
TMP = tempfile.mkdtemp(prefix='bgl-')

im = cv2.imread(SRC, cv2.IMREAD_UNCHANGED)
B,G,R,A = [im[:,:,i].astype(float) for i in range(4)]
H, W = A.shape
op = A >= 128
n, lab, stats, cent = cv2.connectedComponentsWithStats(op.astype(np.uint8), 8)
# components: the drop and the ampersand are islands; CAFE letters sit below y 940
comp_drop = comp_amp = None
for i in range(1, n):
    x, y, w, h, area = stats[i]
    if 400 <= y <= 420 and area > 20000: comp_drop = i
    if 770 <= y <= 800 and 100 < w < 160 and area > 5000: comp_amp = i
drop = lab == comp_drop
amp = lab == comp_amp
cafe = op & (np.arange(H)[:, None] >= 945)
rest = op & ~drop & ~amp & ~cafe
# classify the rest by nearest colour: text, main flame, side flames
cols = {'text': (28, 20, 8), 'main': (184, 72, 8), 'outer': (200, 120, 24)}
d = {k: (R - c[0])**2 + (G - c[1])**2 + (B - c[2])**2 for k, c in cols.items()}
best = np.argmin(np.stack([d['text'], d['main'], d['outer']]), axis=0)
text = rest & (best == 0)
main = rest & (best == 1)
outer = rest & (best == 2)
# tidy speckles from anti-aliased seams
def clean(m, k=3):
    m = m.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    return m.astype(bool)
text, main, outer = clean(text), clean(main), clean(outer)
# split the side flames into left and right
n2, lab2, st2, c2 = cv2.connectedComponentsWithStats(outer.astype(np.uint8), 8)
big = sorted([i for i in range(1, n2) if st2[i][4] > 2000], key=lambda i: st2[i][0])
left = lab2 == big[0]; right = lab2 == big[-1]
# fill what each back layer hides behind the layers in front, so a sway never opens a gap
def under(back, front, px):
    grow = cv2.dilate(back.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*px+1, 2*px+1))).astype(bool)
    return back | (grow & front)
# ...but never where the open centre of the main flame can reach during the sway,
# or the hidden part shows through it (2026-10-07 frames check). The centre's
# reach is simulated with the same skew/scale and pivot the CSS uses.
hole = np.zeros_like(main)
for y in range(H):
    xs = np.where(main[y])[0]
    if len(xs): hole[y, xs.min():xs.max() + 1] = True
hole &= (~op) | drop
# only the centre around the drop, not the small gaps between a tongue and the flame
nh, lh = cv2.connectedComponents(hole.astype(np.uint8), connectivity=4)
hole = np.isin(lh, np.unique(lh[drop & (lh > 0)]))
def pivot(m):
    ys, xs = np.where(m)
    return (xs.min() + xs.max()) / 2, ys.max()
def warp(m, skew_deg, sy, origin):
    ox, oy = origin; t = np.tan(np.radians(skew_deg))
    # x' = ox + (x-ox) + t*sy*(y-oy), y' = oy + sy*(y-oy)
    M = np.float32([[1, t * sy, -t * sy * oy], [0, sy, oy - sy * oy]])
    return cv2.warpAffine(m.astype(np.uint8), M, (W, H), flags=cv2.INTER_NEAREST).astype(bool)
def unwarp(m, skew_deg, sy, origin):
    ox, oy = origin; t = np.tan(np.radians(skew_deg))
    M = cv2.invertAffineTransform(np.float32([[1, t * sy, -t * sy * oy], [0, sy, oy - sy * oy]]))
    return cv2.warpAffine(m.astype(np.uint8), M, (W, H), flags=cv2.INTER_NEAREST).astype(bool)
inside = cv2.erode(text.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)  # clear of the letters' soft edge
main_full = under(main, inside, 30)
mo = pivot(main_full)
reach = np.zeros_like(main)
for a in (-3, -1.5, 0, 1.5, 3):
    for sy in (0.965, 1, 1.04):
        reach |= warp(hole, a, sy, mo)
def side(m):
    ext = under(m, main | inside, 60)
    o = pivot(ext)
    bad = np.zeros_like(m)
    for a in (-3.5, -1.5, 0, 1.5, 3.5):
        for sy in (0.97, 1, 1.03):
            bad |= unwarp(reach, a, sy, o)
    bad = cv2.dilate(bad.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)
    return (ext & ~bad) | m
left = side(left)
right = side(right)
main = under(main, inside, 30)
masks = {'flame-outer-left': left, 'flame-outer-right': right, 'flame-main': main, 'flame-inner': drop,
         'text-bg': text, 'text-amp': amp, 'text-cafe': cafe}
paths = {}
for name, m in masks.items():
    pbm = os.path.join(TMP, f'{name}.pbm'); out = os.path.join(TMP, f'{name}.svg')
    # write PBM by hand (1 = black = shape)
    with open(pbm, 'wb') as f:
        f.write(f'P4\n{W} {H}\n'.encode())
        f.write(np.packbits(m.astype(np.uint8), axis=1).tobytes())
    subprocess.run(['potrace', pbm, '-s', '--flat', '-t', '12', '-a', '1.1', '-O', '0.8', '-o', out], check=True)
    svg = open(out).read()
    ds = re.findall(r'<path d="([^"]+)"', svg)
    paths[name] = ' '.join(ds)

# ---- paths: potrace units to SVG, colours read from the PNG ----

def convert(d):
    """potrace path (0.1 px units, y up, relative curves) -> absolute-start, relative, 1 decimal, y down."""
    toks = re.findall(r'[MmLlCcZz]|-?\d+(?:\.\d+)?', d)
    out, i, cmd = [], 0, None
    def f(v): 
        s = ('%.1f' % v).rstrip('0').rstrip('.')
        return '0' if s in ('-0', '') else s
    while i < len(toks):
        t = toks[i]
        if re.match(r'[A-Za-z]', t):
            cmd = t; i += 1
            if cmd in 'Zz': out.append('z'); continue
            out.append(cmd)
            continue
        n = {'M': 2, 'm': 2, 'L': 2, 'l': 2, 'C': 6, 'c': 6}[cmd]
        nums = [float(x) for x in toks[i:i + n]]; i += n
        pts = []
        for j in range(0, n, 2):
            x, y = nums[j], nums[j + 1]
            if cmd.isupper(): pts += [x * 0.1, H - y * 0.1]
            else: pts += [x * 0.1, -y * 0.1]
        out.append(' '.join(f(v) for v in pts))
    s = ' '.join(out)
    s = re.sub(r' ?([MmLlCcz]) ?', r'\1', s)
    s = re.sub(r' -', '-', s)
    return s

P = {k: convert(v) for k, v in paths.items()}

# Colours read from the PNG (median of each layer's solid pixels)
def med(mask):
    px = im[mask & (im[:, :, 3] > 250)]
    b, g, r = np.median(px[:, 0]), np.median(px[:, 1]), np.median(px[:, 2])
    return '#%02X%02X%02X' % (int(r), int(g), int(b))
# the two flat flame colours (seg masks)
r_, g_, b_ = [im[:, :, i].astype(int) for i in (2, 1, 0)]
near = lambda c, t: (abs(r_ - c[0]) + abs(g_ - c[1]) + abs(b_ - c[2])) < t
dark_ = op & (np.maximum(np.maximum(r_, g_), b_) < 90)
bright_ = op & (r_ > 225) & ~dark_
seg_main = op & near((184, 72, 8), 70) & ~bright_ & ~dark_
seg_outer = op & near((200, 120, 24), 60) & ~bright_ & ~dark_ & ~seg_main
MAIN, OUTER = med(seg_main & (np.arange(H)[:, None] < 700)), med(seg_outer & (np.arange(H)[:, None] < 700))
# Gradients sampled down the drop and the ampersand
def stops(x, y0, y1, step, a_min=240):
    s = []
    for y in range(y0, y1 + 1, step):
        p = im[y, x]
        if p[3] >= a_min: s.append((y, '#%02X%02X%02X' % (p[2], p[1], p[0])))
    return s
drop = stops(540, 412, 748, 4)
amp_rows = []
for y in range(800, 914, 6):
    row = [im[y, x] for x in range(478, 602) if im[y, x, 3] >= 250 and not (im[y, x, 2] < 60)]
    if row:
        a = np.median(np.array(row)[:, :3], axis=0)
        amp_rows.append((y, '#%02X%02X%02X' % (int(a[2]), int(a[1]), int(a[0]))))
drop, amp = [drop[0], drop[len(drop) // 2], drop[-1]], amp_rows
b = {'OUTER': OUTER, 'MAIN': MAIN}

# ---- output ----
TEXT_LIGHT, TEXT_DARK = '#1C1408', '#FFFDF9'

def amp_stops():
    # The gold runs to the very top of the "&" (owner, 2026-10-07: the dark cap
    # across its top was a flaw in the artwork, fixed in logo-light.png too).
    y0, y1 = 784, 915
    off = lambda y: '%.3f' % ((y - y0) / (y1 - y0))
    picks = [amp[0], amp[3], amp[7], amp[11], amp[15], amp[-1]]
    s = [f'<stop offset="0" stop-color="{picks[0][1]}"/>']
    for y, c in picks:
        s.append(f'<stop offset="{off(y)}" stop-color="{c}"/>')
    return ''.join(s), y0, y1

def drop_stops():
    y0, y1 = 408, 752
    off = lambda y: '%.3f' % ((y - y0) / (y1 - y0))
    return ''.join(f'<stop offset="{off(y)}" stop-color="{c}"/>' for y, c in drop), y0, y1

CSS = """
.bgl{overflow:visible}
.bgl .bgl-t{fill:#1C1408}
[data-theme="dark"] .bgl .bgl-t{fill:#FFFDF9}
[data-theme="dark"] .bgl.bgl--light .bgl-t{fill:#1C1408}
.bgl .bgl-f{transform-box:fill-box;transform-origin:50% 100%;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
.bgl .bgl-main{animation-name:bgl-main;animation-duration:3.1s}
.bgl .bgl-ol{animation-name:bgl-ol;animation-duration:2.3s;animation-delay:-.7s}
.bgl .bgl-or{animation-name:bgl-or;animation-duration:2.7s;animation-delay:-1.9s}
.bgl .bgl-in{animation-name:bgl-in;animation-duration:1.3s}
@keyframes bgl-main{0%,100%{transform:skewX(0) scale(1,1)}13%{transform:skewX(-2deg) scale(.99,1.04)}29%{transform:skewX(1deg) scale(1.01,.97)}41%{transform:skewX(-1deg) scale(.985,1.05)}58%{transform:skewX(2.5deg) scale(1.01,.98)}72%{transform:skewX(-.5deg) scale(.99,1.03)}86%{transform:skewX(1.5deg) scale(1.005,.985)}}
@keyframes bgl-ol{0%,100%{transform:skewX(0) scaleY(1)}21%{transform:skewX(3deg) scaleY(1.05)}38%{transform:skewX(-1deg) scaleY(.96)}63%{transform:skewX(2deg) scaleY(1.03)}81%{transform:skewX(-2.5deg) scaleY(.98)}}
@keyframes bgl-or{0%,100%{transform:skewX(0) scaleY(1)}17%{transform:skewX(-3deg) scaleY(1.04)}44%{transform:skewX(1.5deg) scaleY(.97)}66%{transform:skewX(-2deg) scaleY(1.05)}88%{transform:skewX(2deg) scaleY(.99)}}
@keyframes bgl-in{0%,100%{transform:scale(1,1);opacity:1}18%{transform:scale(.98,1.07);opacity:.9}37%{transform:scale(1.01,.96);opacity:1}55%{transform:scale(.99,1.05);opacity:.86}76%{transform:scale(1.01,.98);opacity:.97}}
@media (prefers-reduced-motion:reduce){.bgl .bgl-f{animation:none}.bgl .bgl-fx{filter:none}}
""".strip()

# Real fire (owner, 2026-10-07: "appear like a real flame ... make it glow"): a slowly
# changing noise ripples the flames sideways (more than up and down), the ripple
# strength flares and settles, and a warm halo, the flames' own shape blurred,
# breathes behind them. SVG filters with SMIL, so they also run in an <img> and in
# the standalone files. Reduced motion drops the filter (CSS above).
FIRE = (
    '<filter id="{id}" filterUnits="userSpaceOnUse" x="120" y="0" width="840" height="1240" color-interpolation-filters="sRGB">'
    # one seamless tile of noise, repeated, sliding upward: ripples rise like heat
    '<feTurbulence type="fractalNoise" baseFrequency="0.006 0.0125" numOctaves="1" seed="4" stitchTiles="stitch" x="120" y="0" width="840" height="240" result="n0"/>'
    '<feTile in="n0" result="n1"/>'
    '<feOffset in="n1" dy="0" result="n">'
    '<animate attributeName="dy" from="0" to="-240" dur="1.7s" repeatCount="indefinite"/>'
    '</feOffset>'
    '<feColorMatrix in="n" type="matrix" values="1 0 0 0 0  0 .35 0 0 .325  0 0 1 0 0  0 0 0 0 1" result="m"/>'
    '<feDisplacementMap in="SourceGraphic" in2="m" scale="30" xChannelSelector="R" yChannelSelector="G" result="d">'
    '<animate attributeName="scale" dur="2.9s" values="26;40;22;36;30;26" keyTimes="0;.2;.45;.65;.85;1" calcMode="spline" keySplines=".4 0 .6 1;.4 0 .6 1;.4 0 .6 1;.4 0 .6 1;.4 0 .6 1" repeatCount="indefinite"/>'
    '</feDisplacementMap>'
    '<feGaussianBlur in="d" stdDeviation="2.6" result="fire"/>'
    '<feGaussianBlur in="fire" stdDeviation="34" result="b"/>'
    '<feColorMatrix in="b" type="matrix" values="0 0 0 0 1  0 0 0 0 .56  0 0 0 0 .12  0 0 0 .8 0" result="glow">'
    '<animate attributeName="values" dur="2.3s" values="0 0 0 0 1  0 0 0 0 .56  0 0 0 0 .12  0 0 0 .55 0;0 0 0 0 1  0 0 0 0 .6  0 0 0 0 .15  0 0 0 .95 0;0 0 0 0 1  0 0 0 0 .54  0 0 0 0 .1  0 0 0 .65 0;0 0 0 0 1  0 0 0 0 .62  0 0 0 0 .16  0 0 0 1 0;0 0 0 0 1  0 0 0 0 .56  0 0 0 0 .12  0 0 0 .55 0" repeatCount="indefinite"/>'
    '</feColorMatrix>'
    '<feMerge><feMergeNode in="glow"/><feMergeNode in="fire"/></feMerge>'
    '</filter>'
)

def body(uid, ids=False, text_fill=None):
    """The layers. uid makes gradient ids unique per copy on a page."""
    ds, dy0, dy1 = drop_stops()
    as_, ay0, ay1 = amp_stops()
    gid = lambda n: f'bgl-{n}{uid}'
    idattr = lambda n: f' id="{n}"' if ids else ''
    tcls = 'class="bgl-t"' if text_fill is None else f'fill="{text_fill}"'
    return (
        '<defs>'
        f'<linearGradient id="{gid("drop")}" gradientUnits="userSpaceOnUse" x1="0" y1="{dy0}" x2="0" y2="{dy1}">{ds}</linearGradient>'
        f'<linearGradient id="{gid("amp")}" gradientUnits="userSpaceOnUse" x1="0" y1="{ay0}" x2="0" y2="{ay1}">{as_}</linearGradient>'
        + FIRE.format(id=gid('fire')) +
        '</defs>'
        f'<g class="bgl-fx" filter="url(#{gid("fire")})">'
        f'<g class="bgl-f bgl-ol"{idattr("flame-outer-left")} fill="{b["OUTER"]}"><path d="{P["flame-outer-left"]}"/></g>'
        f'<g class="bgl-f bgl-or"{idattr("flame-outer-right")} fill="{b["OUTER"]}"><path d="{P["flame-outer-right"]}"/></g>'
        f'<g class="bgl-f bgl-main"{idattr("flame-main")} fill="{b["MAIN"]}"><path d="{P["flame-main"]}"/></g>'
        f'<g class="bgl-f bgl-in"{idattr("flame-inner")} fill="url(#{gid("drop")})"><path d="{P["flame-inner"]}"/></g>'
        '</g>'
        f'<g {tcls}{idattr("text-bg")}><path d="{P["text-bg"]}"/></g>'
        f'<g{idattr("text-amp")} fill="url(#{gid("amp")})"><path d="{P["text-amp"]}"/></g>'
        f'<g {tcls}{idattr("text-cafe")}><path d="{P["text-cafe"]}"/></g>'
    )

# 1) Standalone files (styles inside, ids per layer, cropped canvas with room to sway)
for name, text in [('logo-animated', TEXT_LIGHT), ('logo-animated-dark', TEXT_DARK)]:
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" class="bgl" viewBox="195 30 690 990" role="img" aria-labelledby="t">'
           '<title id="t">Bake &amp; Grill Cafe</title>'
           f'<style>{CSS}</style>' + body('', ids=True, text_fill=text) + '</svg>\n')
    open(os.path.join(ROOT, f'backend/public/brand/{name}.svg'), 'w').write(svg)
    print(name, len(svg.encode()), 'bytes')

# 2) Blade partial (inline, so the page's CSS animates the layers; text colour follows the site theme)
blade = (
    "{{-- The Bake & Grill logo, drawn as shapes with moving flames (owner, 2026-10-07).\n"
    "     Traced from brand/logo-light.png on the same 1080 canvas, so it sits exactly\n"
    "     where the image did. Text colour follows [data-theme]; the flames stop under\n"
    "     prefers-reduced-motion. Used only while Admin keeps the standard logo\n"
    "     (layout.blade.php, $animatedLogo). $alogoId keeps gradient ids unique;\n"
    "     $alogoLabel is the name screen readers hear. Generated by\n"
    "     scripts/brand-animated-logo.py; do not edit by hand. --}}\n"
    "@once\n<style>" + CSS + "</style>\n@endonce\n"
    "<svg class=\"bgl {{ $alogoClass ?? '' }}\" viewBox=\"0 0 1080 1080\" role=\"img\" aria-label=\"{{ $alogoLabel ?? 'Bake & Grill Cafe' }}\">"
    + body('{{ $alogoId }}') + "</svg>\n"
)
open(os.path.join(ROOT, 'backend/resources/views/partials/animated-logo.blade.php'), 'w').write(blade)
print('blade partial', len(blade.encode()), 'bytes')

# 3) Order app: the same shapes and stops as data, the same CSS as a file
_stops = lambda xs: '[' + ', '.join(f"[{o}, '{c}']" for o, c in xs) + ']'
ds = [[round((y - 408) / (752 - 408), 3), c] for y, c in drop]
picks = [amp[0], amp[3], amp[7], amp[11], amp[15], amp[-1]]
as_ = [[0, picks[0][1]]] + [[round((y - 784) / (915 - 784), 3), c] for y, c in picks]
ts = (
    "// The logo with moving flames (owner, 2026-10-07), traced from brand/logo-light.png.\n"
    "// Generated by scripts/brand-animated-logo.py with the website's partial; do not edit by hand.\n"
    f"export const OUTER = '{b['OUTER']}';\n"
    f"export const MAIN = '{b['MAIN']}';\n"
    "/** The drop: [offset, colour] over y 408 to 752. */\n"
    f"export const DROP_STOPS: ReadonlyArray<readonly [number, string]> = {_stops(ds)};\n"
    "/** The ampersand's gold: [offset, colour] over y 784 to 915. */\n"
    f"export const AMP_STOPS: ReadonlyArray<readonly [number, string]> = {_stops(as_)};\n"
    "/** The fire: rising ripple, flare and glow (SVG filter + SMIL). `{id}` is replaced per copy. */\n"
    f"export const FIRE_FILTER =\n  '{FIRE}';\n"
    "export const PATHS = {\n"
    + ''.join(f"  {k.replace('-', '_')}: '{P[k]}',\n" for k in ['flame-outer-left', 'flame-outer-right', 'flame-main', 'flame-inner', 'text-bg', 'text-amp', 'text-cafe'])
    + "} as const;\n"
)
open(os.path.join(ROOT, 'apps/online-order-web/src/components/animatedLogoShapes.ts'), 'w').write(ts)
css = ("/* The logo with moving flames (AnimatedLogo.tsx). Same rules as the website's\n"
       "   partials/animated-logo.blade.php; generated by scripts/brand-animated-logo.py. */\n" + CSS + "\n.bgl.bgl--still .bgl-f{animation:none}\n.bgl.bgl--still .bgl-fx{filter:none}\n")
open(os.path.join(ROOT, 'apps/online-order-web/src/components/AnimatedLogo.css'), 'w').write(css)
print('order app shapes', len(ts), 'bytes')
