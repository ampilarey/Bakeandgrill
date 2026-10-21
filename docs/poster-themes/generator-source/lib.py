"""Poster kit: A2 + 3mm bleed, all units mm, text outlined to paths."""
import re, math, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import qrcode

HERE = os.path.dirname(os.path.abspath(__file__))
# The repository root: this file lives at docs/poster-themes/generator-source/.
REPO = os.environ.get('POSTER_REPO') or os.path.abspath(os.path.join(HERE, '..', '..', '..')) + '/'

# Design units = millimetres at A2 trim (420 x 594). Two print variants share them:
#   large -> printed at A2 (scale 1) and A3 (0.707). Bleed canvas 4.25 so A3 still gets 3 mm bleed.
#   small -> printed at A4 (0.5) and A5 (0.352). Bleed canvas 8.52 so A5 still gets 3 mm bleed.
# The screen variants are drawn in pixels at Full HD, with no bleed (2026-10-22, tv_archetypes.py):
#   tv  -> a 1920 x 1080 television (scale 1) and 4K (scale 2).
#   tvp -> a portrait 1080 x 1920 screen.
VARIANT = os.environ.get('POSTER_VARIANT', 'large')
SCREEN = VARIANT in ('tv', 'tvp')
if VARIANT == 'tv':
    TW, TH = 1920.0, 1080.0
    BLEED = 0.0
    SAFE = 60.0                 # a TV may hide the outer edge (overscan)
    FLOOR = 24.0                # min em size in px: readable across a room on a 50" screen
    CORNER = SAFE
    FOOT = 26.0
    OUTPUTS = {'TV': 1920.0, 'TV4K': 3840.0}
    TRIM_H = {'TV': 1080.0, 'TV4K': 2160.0}
elif VARIANT == 'tvp':
    TW, TH = 1080.0, 1920.0
    BLEED = 0.0
    SAFE = 60.0
    FLOOR = 24.0
    CORNER = SAFE
    FOOT = 26.0
    OUTPUTS = {'TVP': 1080.0}
    TRIM_H = {'TVP': 1920.0}
else:
    TW, TH = 420.0, 594.0
    if VARIANT == 'small':
        BLEED = 9.6                 # A5 is 148 x 210 (not exactly A2's ratio): covers its 3 mm bleed + 0.7 mm
        SAFE = BLEED + 14.2         # 5 mm safe at A5
        FLOOR = 9.1                 # min em size: 9 pt at A5, 13 pt at A4
        CORNER = SAFE               # no stand-off corners at A4/A5
        FOOT = 11.5
    else:
        BLEED = 4.25
        SAFE = BLEED + 8.0          # 8 mm safe at A2 (11 mm at A3)
        FLOOR = 8.0                 # min em size: 22.7 pt at A2, 16 pt at A3
        CORNER = BLEED + 31.0       # stand-off circles: 20 mm, centred 20 mm in from the cut (A2)
        FOOT = 9.0
    OUTPUTS = {'large': {'A2': 420.0, 'A3': 297.0}, 'small': {'A4': 210.0, 'A5': 148.0}}[VARIANT]
    TRIM_H = {'A2': 594.0, 'A3': 420.0, 'A4': 297.0, 'A5': 210.0}
EYELET = 20.0
W, H = TW + 2 * BLEED, TH + 2 * BLEED
CX = W / 2

# The TTFs: the generator's own ttf/ folder when it is there, else the copies the repo keeps
# (Anton and Fraunces under resources/poster-themes/_fonts, Plus Jakarta Sans with the PDF fonts).
FONT_FILES = {
    'anton-latin-400-normal.ttf': 'backend/resources/poster-themes/_fonts/anton-latin-400-normal.ttf',
    'fraunces-latin-500-italic.ttf': 'backend/resources/poster-themes/_fonts/fraunces-latin-500-italic.ttf',
    'fraunces-latin-700-italic.ttf': 'backend/resources/poster-themes/_fonts/fraunces-latin-700-italic.ttf',
    'fraunces-latin-900-italic.ttf': 'backend/resources/poster-themes/_fonts/fraunces-latin-900-italic.ttf',
    'plus-jakarta-sans-latin-500-normal.ttf': 'backend/public/fonts/pdf/PlusJakartaSans-500.ttf',
    'plus-jakarta-sans-latin-700-normal.ttf': 'backend/public/fonts/pdf/PlusJakartaSans-700.ttf',
    'plus-jakarta-sans-latin-800-normal.ttf': 'backend/public/fonts/pdf/PlusJakartaSans-800.ttf',
}


def font_path(fn):
    local = os.path.join(HERE, 'ttf', fn)
    if os.path.isfile(local):
        return local
    return os.path.join(REPO, FONT_FILES[fn])

# Brand palette (docs/brand/PALETTE.md)
RUST = '#B74B0C'
BROWN = '#1C1408'
AMBER = '#CA7D1C'
FLAME = '#F7670B'      # mark only
CREAM = '#F7F5F2'
CREAM2 = '#F5EBC7'     # logo's ampersand highlight cream
GOLDHI = '#F8D021'


class Font:
    def __init__(self, fn):
        self.f = TTFont(font_path(fn))
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.upm = self.f['head'].unitsPerEm
        self.hmtx = self.f['hmtx']
        self.cache = {}

    def glyph(self, ch):
        g = self.cmap.get(ord(ch)) or self.cmap.get(ord('?'))
        if g not in self.cache:
            pen = SVGPathPen(self.gs)
            self.gs[g].draw(pen)
            self.cache[g] = (pen.getCommands(), self.hmtx[g][0])
        return self.cache[g]

    def width(self, s, size, track=0.0):
        sc = size / self.upm
        w = sum(self.glyph(c)[1] for c in s) * sc
        return w + track * size * max(len(s) - 1, 0)


ANTON = Font('anton-latin-400-normal.ttf')
EXPORT = None      # list -> theme export mode: text/logo/qr are recorded as slots, not drawn
_CTX = {}
JK5 = Font('plus-jakarta-sans-latin-500-normal.ttf')
JK7 = Font('plus-jakarta-sans-latin-700-normal.ttf')
JK8 = Font('plus-jakarta-sans-latin-800-normal.ttf')
FR9I = Font('fraunces-latin-900-italic.ttf')
FR7I = Font('fraunces-latin-700-italic.ttf')
FR5I = Font('fraunces-latin-500-italic.ttf')
for _k, _f in {'anton': ANTON, 'jakarta-500': JK5, 'jakarta-700': JK7, 'jakarta-800': JK8,
               'fraunces-900-italic': FR9I, 'fraunces-700-italic': FR7I, 'fraunces-500-italic': FR5I}.items():
    _f.key = _k
    _f.cap = {'anton': 1760 / 2048}.get(_k, 1400 / 2000 if _k.startswith('fraunces') else 0.745)


def text(s, font, size, x, y, fill, anchor='start', track=0.0, opacity=1, stroke=None, sw=0):
    """size = em size in mm; y = baseline."""
    size = max(size, FLOOR)
    w = font.width(s, size, track)
    if EXPORT is not None:
        ax = x
        left = x - (w / 2 if anchor == 'middle' else w if anchor == 'end' else 0)
        EXPORT.append({'kind': 'text', 'default': s, 'font': font.key, 'size_mm': round(size, 2),
                       'size_pt': round(size / 0.352778, 1), 'colour': fill, 'align': {'start': 'left', 'middle': 'center', 'end': 'right'}[anchor],
                       'anchor_x': round(ax, 2), 'baseline_y': round(y, 2), 'top_y': round(y - font.cap * size, 2),
                       'box': [round(left, 2), round(y - font.cap * size, 2), round(w, 2), round(font.cap * size, 2)],
                       'tracking_em': track, 'opacity': opacity,
                       'shadow': _CTX.get('shadow'), 'role_hint': _CTX.get('role'),
                       # A screen layout says how wide its text column is (tv_archetypes.maxw); print leaves it to the safe area.
                       'maxw_hint': _CTX.get('maxw')})
        return ''

    if anchor == 'middle':
        x -= w / 2
    elif anchor == 'end':
        x -= w
    sc = size / font.upm
    parts = []
    cx = x
    for c in s:
        d, adv = font.glyph(c)
        if d:
            parts.append(f'<path transform="translate({cx:.3f} {y:.3f}) scale({sc:.6f} {-sc:.6f})" d="{d}"/>')
        cx += adv * sc + track * size
    st = f' stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" paint-order="stroke"' if stroke else ''
    op = f' opacity="{opacity}"' if opacity != 1 else ''
    return f'<g fill="{fill}"{st}{op}>' + ''.join(parts) + '</g>'


def fit(s, font, maxw, maxsize, track=0.0):
    w = font.width(s, maxsize, track)
    return maxsize if w <= maxw else maxsize * maxw / w


def _inner(path, drop_title=True):
    raw = open(REPO + path).read()
    vb = re.search(r'viewBox="([^"]+)"', raw).group(1)
    body = raw[raw.index('>') + 1: raw.rindex('</svg>')]
    if drop_title:
        body = re.sub(r'<title[^>]*>.*?</title>', '', body)
    return vb, body


LOGO_FILE = 'backend/public/brand/logo-animated.svg'   # the current mark (LogoVector source)


def _current_logo():
    raw = open(REPO + LOGO_FILE).read()
    vb = re.search(r'viewBox="([^"]+)"', raw).group(1)
    body = raw[raw.index('>') + 1: raw.rindex('</svg>')]
    body = re.sub(r'<title[^>]*>.*?</title>', '', body, flags=re.S)
    body = re.sub(r'<style>.*?</style>', '', body, flags=re.S)
    body = re.sub(r'<filter.*?</filter>', '', body, flags=re.S)
    body = re.sub(r'\sfilter="[^"]*"', '', body)
    body = body.replace('#B84B0C', '#B74B0C')
    return vb, body


def logo(x, y, h, dark_bg=True, anchor='middle'):
    """The official light logo (dark lettering, 2026-09-30). On a dark or
    vivid background it sits on a cream badge, as logo-light.png does."""
    if EXPORT is not None:
        EXPORT.append({'kind': 'logo', 'centre_x': round(x if anchor == 'middle' else x + h * 0.35, 2), 'top_y': round(y, 2),
                       'height_mm': round(h, 2), 'cream_badge': bool(dark_bg),
                       'badge_circle': {'cx': round(x if anchor == 'middle' else x + h*0.35, 2), 'cy': round(y + h*0.53, 2), 'r': round(h*0.6, 2), 'fill': '#F7F5F2'} if dark_bg else None,
                       'source': 'backend/public/brand/logo-animated.svg (light logo, dark lettering)'})
        return ''
    vb, body = _current_logo()
    badge = ''
    if dark_bg:
        badge = f'<circle cx="{x if anchor == "middle" else x + h*0.35:.2f}" cy="{y + h*0.53:.2f}" r="{h*0.6:.2f}" fill="#F7F5F2"/>'
    if False:
        vb, body = _inner('backend/public/brand/logo.svg')
    w = h * 690 / 990
    if anchor == 'middle':
        x -= w / 2
    return badge + f'<svg x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" viewBox="{vb}">{body}</svg>'


def stamp(x, y, d, color=None):
    vb, body = _inner('docs/brand/logo-stamp-clean.svg')
    if color:
        body = re.sub(r'(fill|stroke)="#[0-9A-Fa-f]{3,6}"', lambda m: f'{m.group(1)}="{color}"', body)
    return f'<svg x="{x - d/2:.2f}" y="{y - d/2:.2f}" width="{d:.2f}" height="{d:.2f}" viewBox="{vb}">{body}</svg>'


def flame(x, y, h, color, opacity=1.0, rot=0):
    vb, body = _inner('backend/public/brand/flame-mark.svg')
    body = re.sub(r'fill="#[0-9A-Fa-f]{6}"', f'fill="{color}"', body)
    w = h * 680 / 640
    g = f'<svg x="{-w/2:.2f}" y="{-h/2:.2f}" width="{w:.2f}" height="{h:.2f}" viewBox="{vb}">{body}</svg>'
    return f'<g transform="translate({x:.2f} {y:.2f}) rotate({rot})" opacity="{opacity}">{g}</g>'


def burst(cx, cy, r, points, depth, fill, rot=0, stroke=None, sw=0):
    pts = []
    for i in range(points * 2):
        a = math.pi * i / points + math.radians(rot)
        rr = r if i % 2 == 0 else r - depth
        pts.append(f'{cx + rr * math.cos(a):.2f},{cy + rr * math.sin(a):.2f}')
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<polygon points="{" ".join(pts)}" fill="{fill}"{st}/>'


def star(cx, cy, r, fill):
    return burst(cx, cy, r, 5, r * 0.6, fill, rot=-90)


def qr(data, x, y, size, fg, bg=None, quiet=0):
    if EXPORT is not None:
        EXPORT.append({'kind': 'qr', 'data_default': data, 'x': round(x, 2), 'y': round(y, 2), 'size_mm': size,
                       'colour': fg, 'background': bg, 'quiet_mm': quiet})
        return ''
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    q.add_data(data); q.make()
    m = q.get_matrix(); n = len(m); c = size / n
    out = []
    if bg:
        out.append(f'<rect x="{x - quiet:.2f}" y="{y - quiet:.2f}" width="{size + 2*quiet:.2f}" height="{size + 2*quiet:.2f}" rx="4" fill="{bg}"/>')
    d = []
    for r in range(n):
        for k in range(n):
            if m[r][k]:
                d.append(f'M{x + k*c:.3f} {y + r*c:.3f}h{c+0.02:.3f}v{c+0.02:.3f}h{-c-0.02:.3f}z')
    out.append(f'<path fill="{fg}" d="{"".join(d)}"/>')
    return ''.join(out)


def footer(fg, accent, y=None, note='Terms & conditions apply'):
    """Contact strip, kept above bottom safe line & between eyelets."""
    if VARIANT == 'small' and y is not None:
        y = H - SAFE - 0.5          # centred in the taller small-format footer band (see _bands)
    y = y or (H - SAFE - 6)
    _CTX['role'] = 'footer'
    s = text('BAKEANDGRILL.MV', JK8, FOOT, CORNER + 2, y, fg, track=0.08)
    s += text('+960 912 0011', JK8, FOOT, W - CORNER - 2, y, fg, anchor='end', track=0.04)
    s += text(note, JK5, 6, CX, y, accent, anchor='middle')
    _CTX.pop('role', None)
    return s


def _bands(svg):
    """Small variant: footer bands (full-width rect at the bottom, 34/36 high) grow to 46 so the bigger footer sits centred."""
    if VARIANT != 'small':
        return svg
    for hh in (34, 36):
        svg = svg.replace(f'<rect x="0" y="{H-hh}" width="{W}" height="{hh}"', f'<rect x="0" y="{H-46}" width="{W}" height="46"')
    return svg


def doc(body, bg):
    return _bands(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">'
                  f'<rect x="0" y="0" width="{W}" height="{H}" fill="{bg}"/>{body}</svg>')


def guides():
    """Preview-only overlay: trim, safe, eyelets."""
    g = f'<rect x="{BLEED}" y="{BLEED}" width="{TW}" height="{TH}" fill="none" stroke="#00E5FF" stroke-width="0.6"/>'
    g += f'<rect x="{SAFE}" y="{SAFE}" width="{W-2*SAFE}" height="{H-2*SAFE}" fill="none" stroke="#FF00AA" stroke-width="0.6" stroke-dasharray="3 2"/>'
    o = BLEED + 20
    for (ex, ey) in ([] if VARIANT == 'small' else [(o, o), (W - o, o), (o, H - o), (W - o, H - o)]):
        g += f'<circle cx="{ex}" cy="{ey}" r="{EYELET/2}" fill="none" stroke="#FF00AA" stroke-width="0.6"/>'
    return g


# ── Vivid UV palette (v2). All picked inside the CMYK gamut so the press
# can hit them; warm ones come from the logo's own flame gradient.
YELLOW = '#FFC72C'   # ~C0 M22 Y88 K0  (logo drop top #F8D021, made printable)
ORANGE = '#F7670B'   # ~C0 M70 Y100 K0 (logo flame)
CHILI = '#D92B1C'    # ~C0 M92 Y98 K4  (logo drop base #F83800, toned for press)
TEAL = '#0B7A75'     # ~C88 M22 Y55 K12 lagoon, the cool complement
TEALD = '#064A47'    # deep lagoon
CREAMW = '#FFF3DC'   # warm cream
PLUM = '#5A1A2E'     # deep wine for shadows on reds


def lin(id, stops, x1=0, y1=0, x2=0, y2=1):
    st = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{id}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>'


def rad(id, stops, cx=0.5, cy=0.5, r=0.75):
    st = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<radialGradient id="{id}" cx="{cx}" cy="{cy}" r="{r}">{st}</radialGradient>'


def rays(cx, cy, n, color, opacity=0.18, R=900):
    out = []
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = a0 + math.pi / n
        out.append(f'M{cx:.1f} {cy:.1f} L{cx + R*math.cos(a0):.1f} {cy + R*math.sin(a0):.1f} '
                   f'L{cx + R*math.cos(a1):.1f} {cy + R*math.sin(a1):.1f} Z')
    return f'<path d="{" ".join(out)}" fill="{color}" opacity="{opacity}"/>'


def confetti(seed, n, colors, rects, rmin=2.5, rmax=7):
    import random
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        x0, y0, x1, y1 = rnd.choice(rects)
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        c = rnd.choice(colors)
        k = rnd.random()
        r = rnd.uniform(rmin, rmax)
        if k < 0.45:
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}"/>')
        elif k < 0.8:
            out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{r*2.4:.1f}" height="{r*0.9:.1f}" rx="{r*0.4:.1f}" '
                       f'fill="{c}" transform="rotate({rnd.uniform(0,180):.0f} {x:.1f} {y:.1f})"/>')
        else:
            out.append(star(x, y, r * 1.2, c))
    return ''.join(out)


def stext(s, font, size, x, y, fill, shadow, d=None, **kw):
    """Text with a hard offset shadow (reads well from across a room)."""
    d = d if d is not None else size * 0.035
    if EXPORT is not None:
        _CTX['shadow'] = {'colour': shadow, 'offset_mm': round(d, 2)}
        text(s, font, size, x, y, fill, **kw)
        _CTX.pop('shadow', None)
        return ''
    return text(s, font, size, x + d, y + d, shadow, **kw) + text(s, font, size, x, y, fill, **kw)


def docv(body, bg, defs=''):
    return _bands(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">'
                  f'<defs>{defs}</defs><rect x="0" y="0" width="{W}" height="{H}" fill="{bg}"/>{body}</svg>')


# ── Set 3 extra-colour accents: pure/near-pure process inks = most vivid on UV
BERRY = '#E5007D'    # C0 M100 Y0 K0 process magenta
BERRYD = '#9E0F57'   # deep berry for shadows
CYAN = '#00A3E0'     # C100 M15 Y0 K0
LIME = '#8DC63F'     # C50 M0 Y100 K0
BUN = '#E9A23B'


def halftone(x0, y0, x1, y1, step, rmax, color, fx, fy, reach, opacity=1):
    out = []
    y = y0
    row = 0
    while y <= y1:
        x = x0 + (step / 2 if row % 2 else 0)
        while x <= x1:
            dist = math.hypot(x - fx, y - fy)
            r = rmax * max(0.0, 1 - dist / reach)
            if r > 0.4:
                out.append(f'M{x - r:.1f} {y:.1f}a{r:.1f} {r:.1f} 0 1 0 {2*r:.1f} 0a{r:.1f} {r:.1f} 0 1 0 {-2*r:.1f} 0z')
            x += step
        y += step * 0.87
        row += 1
    return f'<path d="{"".join(out)}" fill="{color}" opacity="{opacity}"/>'


def pill(cx, y, w, h, fill, label, font, size, color, track=0.1, shadow=None):
    s = ''
    if shadow:
        s += f'<rect x="{cx-w/2+3}" y="{y+3}" width="{w}" height="{h}" rx="{h/2}" fill="{shadow}"/>'
    s += f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="{fill}"/>'
    k = 0.43 if font is ANTON else 0.36
    s += text(label, font, size, cx, y + h / 2 + size * k, color, anchor='middle', track=track)
    return s
