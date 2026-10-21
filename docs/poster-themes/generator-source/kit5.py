"""Kit for the 100-template set: photo slots, illustrations, festive decor, palettes."""
import base64, math, os, random
import lib
from lib import *
from posters import cup
from posters3 import glass, cake, scooter, teacup, gift, balloon, wave, checker, stripes
from posters4 import shake, egg, toast, donut, burger, fries, phone, icedcoffee, halftone, pill, bands, vbands

HERE = os.path.dirname(os.path.abspath(__file__))
GREENF = '#0A8A43'   # Maldives-flag green, C90 M10 Y100 K10
REDF = '#D21034'     # flag red, C0 M100 Y80 K10
_IMG = {}


def _b64(name):
    if name not in _IMG:
        mime = 'image/png' if name.endswith('.png') else 'image/jpeg'
        _IMG[name] = f'data:{mime};base64,' + base64.b64encode(open(os.path.join(HERE, 'img', name), 'rb').read()).decode()
    return _IMG[name]


# ── extra illustrations, drawn around the origin ──────────────────
def croissant(cx, cy, s=1.0):
    out = ''
    segs = [(-62, 10, 26, -28), (-34, -4, 30, -12), (0, -10, 34, 0), (34, -4, 30, 12), (62, 10, 26, 28)]
    cols = ['#D98A3E', '#E9A23B', '#F2B657', '#E9A23B', '#D98A3E']
    for (x, y, r, rot), c in zip(segs, cols):
        out += f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.82}" fill="{c}" transform="rotate({rot} {x} {y})"/>'
        out += f'<path d="M{x-r*0.3} {y-r*0.6} q {r*0.2} {r*0.6} 0 {r*1.2}" fill="none" stroke="#B86A2A" stroke-width="2" opacity="0.5"/>'
    return f'<g transform="translate({cx} {cy}) scale({s})">{out}</g>'


def sandwich(cx, cy, s=1.0):
    o = f'<path d="M-80 -6 L0 -60 L80 -6 Z" fill="#F2C680"/>'
    o += f'<path d="M-84 -2 Q -40 10 0 -2 T 84 -2 L 84 6 L -84 6 Z" fill="{LIME}"/>'
    o += f'<rect x="-82" y="4" width="164" height="10" rx="4" fill="{CHILI}"/>'
    o += f'<rect x="-80" y="13" width="160" height="10" rx="4" fill="{YELLOW}"/>'
    o += f'<rect x="-80" y="22" width="160" height="12" rx="4" fill="#E9C9A0"/>'
    o += f'<path d="M-80 34 L0 70 L80 34 Z" fill="#F2C680"/>'
    o += f'<path d="M-80 -6 L0 -60 L80 -6" fill="none" stroke="#D98A3E" stroke-width="5" stroke-linejoin="round"/>'
    return f'<g transform="translate({cx} {cy}) scale({s})">{o}</g>'


def skewer(cx, cy, s=1.0):
    o = f'<rect x="-100" y="-3" width="200" height="6" rx="3" fill="#B86A2A"/>'
    xs = [-66, -32, 2, 36, 70]
    cols = ['#7A3A16', ORANGE, '#7A3A16', LIME, '#7A3A16']
    for x, c in zip(xs, cols):
        o += f'<rect x="{x-15}" y="-17" width="30" height="34" rx="8" fill="{c}"/>'
        if c == '#7A3A16':
            o += f'<path d="M{x-11} -6 l22 0 M{x-11} 6 l22 0" stroke="#3A1A08" stroke-width="2.5"/>'
    return f'<g transform="translate({cx} {cy}) scale({s}) rotate(-12)">{o}</g>'


def cupcake(cx, cy, s=1.0, frost=BERRY):
    o = f'<path d="M-40 0 L40 0 L30 56 L-30 56 Z" fill="{CYAN}"/>'
    for x in range(-34, 40, 12):
        o += f'<path d="M{x} 2 L{x*0.76} 54" stroke="#FFFFFF" stroke-width="2" opacity="0.5"/>'
    o += f'<path d="M-48 2 Q -50 -24 -24 -30 Q -20 -58 6 -56 Q 30 -60 30 -34 Q 54 -28 48 2 Z" fill="{frost}"/>'
    o += f'<circle cx="4" cy="-62" r="9" fill="{CHILI}"/>'
    rnd = random.Random(3)
    for i in range(10):
        x, y = rnd.uniform(-38, 38), rnd.uniform(-40, -6)
        o += f'<rect x="{x:.1f}" y="{y:.1f}" width="7" height="2.4" rx="1.2" fill="{rnd.choice([YELLOW, CREAMW, LIME])}" transform="rotate({rnd.uniform(0,180):.0f} {x:.1f} {y:.1f})"/>'
    return f'<g transform="translate({cx} {cy}) scale({s})">{o}</g>'


# name -> (svg at origin, bbox x y w h)
def illus(name):
    if name == 'burger':
        return burger(0, 0, 150), (-80, -72, 160, 136)
    if name == 'fries':
        return fries(0, 0, 92), (-36, -96, 72, 96)
    if name == 'coffee':
        return cup(0, 0, 70, CREAMW, ORANGE, steam=True), (-36, -130, 72, 130)
    if name == 'shake':
        return shake(0, 0, 90, BERRY), (-28, -132, 56, 132)
    if name == 'shake-yellow':
        return shake(0, 0, 90, YELLOW), (-28, -132, 56, 132)
    if name == 'juice':
        return glass(-42, -70, 84, 140, ORANGE), (-48, -120, 100, 190)
    if name == 'iced':
        return icedcoffee(-45, -100, 90, 200), (-50, -165, 100, 265)
    if name == 'tea':
        return teacup(0, 0), (-100, -100, 200, 165)
    if name == 'donuts':
        s = donut(-46, 10, 40, YELLOW, 1).replace('BGHOLE', CREAMW) + donut(44, -14, 40, BERRY, 2).replace('BGHOLE', CREAMW)
        return s, (-90, -58, 180, 112)
    if name == 'cake':
        return cake(0, 0), (-100, -160, 200, 172)
    if name == 'eggs':
        return egg(-26, 0, 34) + egg(30, 10, 28) + toast(0, 70, 34) if False else egg(-28, 0, 36) + egg(34, 12, 30), (-70, -42, 140, 90)
    if name == 'toast':
        return toast(0, 0, 50), (-60, -58, 120, 112)
    if name == 'croissant':
        return croissant(0, 0), (-92, -40, 184, 84)
    if name == 'sandwich':
        return sandwich(0, 0), (-90, -64, 180, 138)
    if name == 'skewer':
        return skewer(0, 0), (-104, -40, 208, 80)
    if name == 'cupcake':
        return cupcake(0, 0), (-52, -74, 104, 132)
    if name == 'gift':
        return gift(0, 0), (-75, -110, 150, 160)
    if name == 'scooter':
        return scooter(0, 0), (-175, -70, 270, 130)
    raise KeyError(name)


def place(name, cx, cy, size):
    svg, (bx, by, bw, bh) = illus(name)
    s = size / max(bw, bh)
    return f'<g transform="translate({cx - (bx + bw/2)*s:.2f} {cy - (by + bh/2)*s:.2f}) scale({s:.4f})">{svg}</g>'


# ── photo slots ────────────────────────────────────────────────────
_PN = [0]


def shape_d(shape):
    k = shape[0]
    if k == 'circle':
        _, cx, cy, r = shape
        return f'M{cx-r} {cy} A{r} {r} 0 1 0 {cx+r} {cy} A{r} {r} 0 1 0 {cx-r} {cy} Z', (cx - r, cy - r, 2*r, 2*r)
    if k == 'rect':
        _, x, y, w, h, rx = shape
        return (f'M{x+rx} {y} H{x+w-rx} A{rx} {rx} 0 0 1 {x+w} {y+rx} V{y+h-rx} A{rx} {rx} 0 0 1 {x+w-rx} {y+h} '
                f'H{x+rx} A{rx} {rx} 0 0 1 {x} {y+h-rx} V{y+rx} A{rx} {rx} 0 0 1 {x+rx} {y} Z' if rx else
                f'M{x} {y} H{x+w} V{y+h} H{x} Z'), (x, y, w, h)
    if k == 'arch':
        _, x, y, w, h = shape
        r = w / 2
        return f'M{x} {y+h} V{y+r} A{r} {r} 0 0 1 {x+w} {y+r} V{y+h} Z', (x, y, w, h)
    if k == 'pathd':
        return shape[1], shape[2]
    if k == 'poly':
        pts = shape[1]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return 'M' + ' L'.join(f'{a} {b}' for a, b in pts) + ' Z', (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
    raise KeyError(k)


def photo(shape, src, bg=CREAMW, rot=0, role='item photo'):
    """A photo frame. src: 'bajiya-photo' | 'bajiya-square' | 'bajiya-cutout' | 'illus:<name>'."""
    d, (x, y, w, h) = shape_d(shape)
    _PN[0] += 1
    n = _PN[0]
    cx, cy = x + w / 2, y + h / 2
    if lib.EXPORT is not None:
        lib.EXPORT.append({'kind': 'photo', 'id': f'p{sum(1 for e in lib.EXPORT if e.get("kind") == "photo") + 1}',
                           'role': role, 'shape': shape[0], 'shape_args': [list(v) if isinstance(v, (list, tuple)) else v for v in shape[1:]] if shape[0] != 'pathd' else None, 'clip_path_d': d, 'box': [round(x, 2), round(y, 2), round(w, 2), round(h, 2)],
                           'rotation_deg': rot, 'rotation_centre': [round(cx, 2), round(cy, 2)], 'fit': 'cover',
                           'cutout_ok': True, 'fill_behind': bg,
                           'min_px_for_150ppi': [int(w / 25.4 * 150), int(h / 25.4 * 150)],
                           'preview_placeholder': src})
        k = sum(1 for e in lib.EXPORT if e.get('kind') == 'photo')
        lib.EXPORT[-1]['_shape'] = shape
        return f'<rect id="__photo_marker_p{k}" x="0" y="0" width="0.001" height="0.001" fill="none"/>'
    inner = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>'
    if src.startswith('illus:'):
        inner += f'<circle cx="{cx}" cy="{cy}" r="{min(w, h)*0.42}" fill="#FFFFFF" opacity="0.35"/>'
        inner += place(src[6:], cx, cy + h * 0.02, min(w, h) * 0.72)
    elif src == 'bajiya-cutout':
        inner += f'<circle cx="{cx}" cy="{cy}" r="{min(w, h)*0.44}" fill="#FFFFFF" opacity="0.35"/>'
        inner += f'<image x="{x + w*0.04}" y="{y + h*0.04}" width="{w*0.92}" height="{h*0.92}" href="{_b64("bajiya-cutout.png")}" preserveAspectRatio="xMidYMid meet"/>'
    else:
        fn = {'bajiya-photo': 'bajiya-photo.jpg', 'bajiya-square': 'bajiya-square.jpg'}[src]
        inner += f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="{_b64(fn)}" preserveAspectRatio="xMidYMid slice"/>'
    tr = f' transform="rotate({rot} {cx} {cy})"' if rot else ''
    return f'<clipPath id="pc{n}"><path d="{d}"{tr}/></clipPath><g clip-path="url(#pc{n})"><g{tr}>{inner}</g></g>'


def outline(shape, colour, width, rot=0, dash=None, offset=0):
    d, (x, y, w, h) = shape_d(grow(shape, offset))
    tr = f' transform="rotate({rot} {x + w/2} {y + h/2})"' if rot else ''
    da = f' stroke-dasharray="{dash}" stroke-linecap="round"' if dash else ''
    return f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}"{da}{tr}/>'


def solid(shape, colour, rot=0, offset=0, dx=0, dy=0):
    d, (x, y, w, h) = shape_d(grow(shape, offset))
    tr = f' transform="translate({dx} {dy}) rotate({rot} {x + w/2} {y + h/2})"'
    return f'<path d="{d}" fill="{colour}"{tr}/>'


def grow(shape, o):
    if not o:
        return shape
    k = shape[0]
    if k == 'circle':
        return ('circle', shape[1], shape[2], shape[3] + o)
    if k == 'rect':
        return ('rect', shape[1] - o, shape[2] - o, shape[3] + 2*o, shape[4] + 2*o, shape[5] + o if shape[5] else 0)
    if k == 'arch':
        return ('arch', shape[1] - o, shape[2] - o, shape[3] + 2*o, shape[4] + 2*o)
    return shape


# ── festive decor ─────────────────────────────────────────────────
def crescent(cx, cy, R, colour, rot=-30):
    # outer circle (0,0,R) minus inner circle (0.42R, -0.08R, 0.82R)
    ox, oy, r = 0.42 * R, -0.08 * R, 0.82 * R
    dd = math.hypot(ox, oy)
    a = (R*R - r*r + dd*dd) / (2*dd)
    hh = math.sqrt(R*R - a*a)
    mx, my = a * ox / dd, a * oy / dd
    p1 = (mx + hh * oy / dd, my - hh * ox / dd)
    p2 = (mx - hh * oy / dd, my + hh * ox / dd)
    d = (f'M{p1[0]:.2f} {p1[1]:.2f} A{R} {R} 0 1 0 {p2[0]:.2f} {p2[1]:.2f} '
         f'A{r} {r} 0 1 1 {p1[0]:.2f} {p1[1]:.2f} Z')
    return f'<path d="{d}" fill="{colour}" transform="translate({cx} {cy}) rotate({rot})"/>'


def lantern(cx, top, h, body, glow=YELLOW):
    w = h * 0.5
    o = f'<line x1="{cx}" y1="{top - 60}" x2="{cx}" y2="{top}" stroke="{body}" stroke-width="1.2"/>'
    o += f'<path d="M{cx-w*0.3} {top} L{cx+w*0.3} {top} L{cx+w*0.2} {top+h*0.12} L{cx-w*0.2} {top+h*0.12} Z" fill="{body}"/>'
    o += f'<path d="M{cx-w*0.2} {top+h*0.12} Q {cx-w*0.62} {top+h*0.5} {cx-w*0.2} {top+h*0.86} L {cx+w*0.2} {top+h*0.86} Q {cx+w*0.62} {top+h*0.5} {cx+w*0.2} {top+h*0.12} Z" fill="{glow}"/>'
    for f in (-0.22, 0, 0.22):
        o += f'<path d="M{cx+w*f} {top+h*0.14} Q {cx+w*f*2.2} {top+h*0.5} {cx+w*f} {top+h*0.84}" fill="none" stroke="{body}" stroke-width="1.6"/>'
    o += f'<path d="M{cx-w*0.22} {top+h*0.86} L{cx+w*0.22} {top+h*0.86} L{cx+w*0.12} {top+h} L{cx-w*0.12} {top+h} Z" fill="{body}"/>'
    return o


def heart(cx, cy, s, colour, rot=0):
    d = 'M0 6 C -14 -6 -12 -20 0 -12 C 12 -20 14 -6 0 6 Z'
    return f'<path d="{d}" fill="{colour}" transform="translate({cx} {cy}) rotate({rot}) scale({s/12})"/>'


def firework(cx, cy, r, colour, n=14):
    o = ''
    for i in range(n):
        a = 2 * math.pi * i / n
        x1, y1 = cx + r * 0.3 * math.cos(a), cy + r * 0.3 * math.sin(a)
        x2, y2 = cx + r * math.cos(a), cy + r * math.sin(a)
        o += f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{colour}" stroke-width="{r*0.06:.2f}" stroke-linecap="round"/>'
        o += f'<circle cx="{cx + r*1.15*math.cos(a):.1f}" cy="{cy + r*1.15*math.sin(a):.1f}" r="{r*0.05:.2f}" fill="{colour}"/>'
    return o


def sun(cx, cy, r, colour, rays_col=None):
    o = ''
    rc = rays_col or colour
    for i in range(12):
        a = 2 * math.pi * i / 12
        o += (f'<line x1="{cx + r*1.25*math.cos(a):.1f}" y1="{cy + r*1.25*math.sin(a):.1f}" '
              f'x2="{cx + r*1.6*math.cos(a):.1f}" y2="{cy + r*1.6*math.sin(a):.1f}" stroke="{rc}" stroke-width="{r*0.14:.1f}" stroke-linecap="round"/>')
    return o + f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{colour}"/>'


def clock(cx, cy, r, face, rim, hand, h1=3, m1=0):
    o = f'<circle cx="{cx}" cy="{cy}" r="{r+6}" fill="{rim}"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{face}"/>'
    for i in range(12):
        a = 2 * math.pi * i / 12
        L = 0.16 if i % 3 == 0 else 0.08
        o += (f'<line x1="{cx + r*0.92*math.cos(a):.1f}" y1="{cy + r*0.92*math.sin(a):.1f}" '
              f'x2="{cx + r*(0.92-L)*math.cos(a):.1f}" y2="{cy + r*(0.92-L)*math.sin(a):.1f}" stroke="{hand}" stroke-width="{2.6 if i%3==0 else 1.4}" stroke-linecap="round"/>')
    ah = math.radians(h1 * 30 + m1 * 0.5 - 90)
    am = math.radians(m1 * 6 - 90)
    o += f'<line x1="{cx}" y1="{cy}" x2="{cx + r*0.5*math.cos(ah):.1f}" y2="{cy + r*0.5*math.sin(ah):.1f}" stroke="{hand}" stroke-width="5" stroke-linecap="round"/>'
    o += f'<line x1="{cx}" y1="{cy}" x2="{cx + r*0.75*math.cos(am):.1f}" y2="{cy + r*0.75*math.sin(am):.1f}" stroke="{hand}" stroke-width="3" stroke-linecap="round"/>'
    return o + f'<circle cx="{cx}" cy="{cy}" r="5" fill="{rim}"/>'


def tape(cx, cy, w, rot, colour=CREAMW):
    return f'<rect x="{cx-w/2}" y="{cy-8}" width="{w}" height="16" fill="{colour}" opacity="0.8" transform="rotate({rot} {cx} {cy})"/>'


# ── palettes ──────────────────────────────────────────────────────
PAL = {
    'sunset':  dict(bg='url(#bg)', defs=lin('bg', [(0, ORANGE), (1, CHILI)]), ink=BROWN, light=CREAMW, pop=YELLOW, alt=TEAL, shadow=PLUM, deco=YELLOW, photo_bg=YELLOW),
    'lagoon':  dict(bg='url(#bg)', defs=lin('bg', [(0, '#12A39A'), (1, TEALD)]), ink=TEALD, light=CREAMW, pop=YELLOW, alt=ORANGE, shadow=TEALD, deco='#13A39A', photo_bg=CREAMW),
    'berry':   dict(bg='url(#bg)', defs=rad('bg', [(0, '#FF3DA0'), (0.6, BERRY), (1, BERRYD)], cy=0.45), ink=BERRYD, light=CREAMW, pop=YELLOW, alt=CYAN, shadow=BERRYD, deco=YELLOW, photo_bg=CREAMW),
    'sunshine': dict(bg='url(#bg)', defs=rad('bg', [(0, '#FFE07A'), (0.65, YELLOW), (1, '#F9A11B')], cy=0.45), ink=BROWN, light=CREAMW, pop=CHILI, alt=TEAL, shadow=BROWN, deco=ORANGE, photo_bg=CREAMW, dark_text=True),
    'night':   dict(bg='url(#bg)', defs=lin('bg', [(0, '#2A1A0C'), (1, PLUM)]), ink=BROWN, light=CREAMW, pop=YELLOW, alt=ORANGE, shadow=CHILI, deco=ORANGE, photo_bg=ORANGE),
    'creampop': dict(bg=CREAMW, defs='', ink=BROWN, light=CREAMW, pop=CHILI, alt=TEAL, shadow=YELLOW, deco=ORANGE, photo_bg=YELLOW, dark_text=True),
    'lime':    dict(bg='url(#bg)', defs=lin('bg', [(0, '#A5D65A'), (1, '#5FA82E')]), ink=TEALD, light=CREAMW, pop=BERRY, alt=YELLOW, shadow=TEALD, deco=YELLOW, photo_bg=CREAMW, dark_text=True),
    'cyan':    dict(bg='url(#bg)', defs=lin('bg', [(0, CYAN), (1, '#0077B6')]), ink='#04395E', light=CREAMW, pop=YELLOW, alt=BERRY, shadow='#04395E', deco=CREAMW, photo_bg=YELLOW),
    'chili':   dict(bg='url(#bg)', defs=rad('bg', [(0, '#F04A2A'), (1, CHILI)], cy=0.5), ink=PLUM, light=CREAMW, pop=YELLOW, alt=CYAN, shadow=PLUM, deco=YELLOW, photo_bg=YELLOW),
    'flag':    dict(bg=REDF, defs='', ink='#5A0A16', light='#FFFFFF', pop=YELLOW, alt=GREENF, shadow='#5A0A16', deco='#FFFFFF', photo_bg=CREAMW),
}


def P_(name):
    p = dict(PAL[name])
    p['name'] = name
    return p
