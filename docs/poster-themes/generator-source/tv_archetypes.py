"""Layouts for a television (POSTER_VARIANT=tv, 1920 x 1080) and a portrait screen
(POSTER_VARIANT=tvp, 1080 x 1920). Each takes a palette dict and a content dict and
returns a full SVG page, like archetypes.py, but laid out for a screen read from
across a room: one message, big type, nothing under 24 px, the logo in a corner,
the photo beside the words on a landscape screen and above or below them on a
portrait one. Units are pixels at Full HD; 4K is the same design at twice the size.

Every layout records its text slots in the same order on both screens (the words
first, the stickers last), so a line typed for the TV lands on the same line of the
portrait design: the slot ids have to match across variants."""
import random
import re
from contextlib import contextmanager

import lib
from kit5 import *

MONEY = re.compile(r'(MVR|\d+\s*%|\d+X\b|^\d+$|FREE|HALF PRICE|2 FOR 1|BUY 1|GET 1|ONLY)', re.I)


def money_role(s):
    """A pill or sticker that names a price or an offer is a price slot; any other is a detail."""
    return 'price_or_offer' if MONEY.search(s) else 'detail'

P = lib.H > lib.W                      # portrait screen
X0 = SAFE + 40                         # the text column's left edge on a landscape screen
TXW = 980                              # the text column's width when a photo sits beside it
MW = W - 2 * SAFE - 40                 # the widest a centred line may be
TX = CX if P else X0                   # where the words start
A = 'middle' if P else 'start'         # how they are anchored
FOOT_BAND = 92                         # the footer strip, tall enough to keep its text inside the safe zone


@contextmanager
def role(name, maxw=None):
    """Mark the text slots recorded inside with their role (and the width they may grow to)."""
    lib._CTX['role'] = name
    if maxw is not None:
        lib._CTX['maxw'] = maxw
    try:
        yield
    finally:
        lib._CTX.pop('role', None)
        lib._CTX.pop('maxw', None)


def T(p):
    return p['ink'] if p.get('dark_text') else p['light']


def pop_or_dark(p):
    """The accent for a line on the background: the pop colour, or the shadow colour where the page is light."""
    return p['pop'] if not p.get('dark_text') else p['shadow']


def pick(land, port):
    return port if P else land


def tv_logo(cx, cy, h=150):
    """The logo on its cream badge, centred at (cx, cy)."""
    return logo(cx, cy - 0.53 * h, h, dark_bg=True)


def eyebrow(p, s, x, y, anchor='start', maxw=TXW, col=None):
    with role('eyebrow', maxw):
        return text(s, FR9I, fit(s, FR9I, maxw, 56), x, y, col or pop_or_dark(p), anchor=anchor)


def head(p, s, x, y, maxw=TXW, maxsz=150, anchor='start', col=None, track=0.03, rl='headline'):
    sz = fit(s, ANTON, maxw, maxsz, track)
    with role(rl, maxw):
        return stext(s, ANTON, sz, x, y, col or T(p), p['shadow'], d=max(4, sz * 0.045), anchor=anchor, track=track)


def sub(p, s, x, y, maxw=TXW, size=44, anchor='start', col=None):
    with role('detail', maxw):
        return text(s, ANTON, fit(s, ANTON, maxw, size, 0.06), x, y, col or pop_or_dark(p), anchor=anchor, track=0.06)


def line(p, s, x, y, maxw=TXW, size=36, anchor='start', col=None):
    with role('detail', maxw):
        return text(s, FR7I, fit(s, FR7I, maxw, size), x, y, col or T(p), anchor=anchor)


def smallline(p, s, x, y, maxw=TXW, size=30, anchor='start', col=None):
    with role('detail', maxw):
        return text(s, JK8, fit(s, JK8, maxw, size, 0.08), x, y, col or T(p), anchor=anchor, track=0.08)


def tvpill(x, y, s, fill, col, font=JK8, size=34, h=88, anchor='start', track=0.08, shadow=None, maxw=None, rl=None):
    """A pill with its words; anchored at its left edge, or centred when anchor is 'middle'."""
    w = font.width(s, size, track) + h * 1.4
    if maxw:
        w = min(w, maxw)
        size = fit(s, font, w - h * 1.4, size, track)
    cx = x if anchor == 'middle' else x + w / 2
    with role(rl or money_role(s), w - h * 1.4):
        return pill(cx, y, w, h, fill, s, font, size, col, track=track, shadow=shadow)


def sticker(cx, cy, r, fill, top, main, topcol, maincol, ring=None, pts=18, rl=None):
    b = ''
    if ring:
        b += burst(cx, cy, r + 14, pts, 14, ring, rot=6)
    b += burst(cx, cy, r, pts, 14, fill, rot=10)
    with role(rl or money_role((top or '') + ' ' + main), r * 1.5):
        if top:
            b += text(top, JK8, max(FLOOR, r * 0.17), cx, cy - r * 0.3, topcol, anchor='middle', track=0.2)
        b += text(main, ANTON, fit(main, ANTON, r * 1.45, r * 0.55), cx, cy + r * (0.22 if top else 0.18), maincol, anchor='middle')
    return b


def tv_stripes(color, opacity, gap=120, wdt=48, angle=-35):
    span = int(max(W, H) * 1.6)
    out = [f'<g opacity="{opacity}" transform="rotate({angle} {CX} {H / 2})">']
    for x in range(-span, span, gap):
        out.append(f'<rect x="{x}" y="{-span}" width="{wdt}" height="{2 * span}" fill="{color}"/>')
    out.append('</g>')
    return ''.join(out)


def deco(p, kind, seed=1):
    if kind == 'rays':
        return rays(pick(W * 0.76, CX), H * 0.5, 28, p['deco'], 0.16, R=2600)
    if kind == 'confetti':
        rects = [(SAFE, SAFE, W - SAFE, SAFE + 90), (SAFE, H - FOOT_BAND - 120, W - SAFE, H - FOOT_BAND - 10)]
        if not P:
            rects += [(SAFE, 200, 260, H - 200), (W - 260, 200, W - SAFE, H - 200)]
        return confetti(seed, pick(70, 50), [YELLOW, ORANGE, CHILI, TEAL, BERRY, CYAN, LIME], rects, rmin=8, rmax=20)
    if kind == 'halftone':
        return (halftone(0, 0, W, H, 34, 13, p['deco'], W, H, 1100, 0.35)
                + halftone(0, 0, W, H, 34, 13, p['deco'], 0, 0, 800, 0.35))
    if kind == 'stripes':
        return tv_stripes(p['deco'], 0.14)
    if kind == 'dots':
        return halftone(0, 0, W, H, 52, 8, p['deco'], CX, H / 2, 3000, 0.22)
    return ''


def page(p, b, extra_defs=''):
    return docv(b, p['bg'], p['defs'] + extra_defs)


def foot(p, band=True, note='Terms & conditions apply'):
    """The contact strip along the bottom, inside the safe zone (the descenders too)."""
    y = H - 72
    fg, accent = (CREAMW, YELLOW) if band else (T(p), pop_or_dark(p))
    b = f'<rect x="0" y="{H - FOOT_BAND}" width="{W}" height="{FOOT_BAND}" fill="{BROWN}"/>' if band else ''
    with role('footer', W - 2 * SAFE):
        b += text('BAKEANDGRILL.MV', JK8, FOOT, SAFE + 20, y, fg, track=0.08)
        b += text('+960 912 0011', JK8, FOOT, W - SAFE - 20, y, fg, anchor='end', track=0.04)
        b += text(note, JK5, FLOOR, CX, y, accent, anchor='middle')
    return b


def photo_circle_at(p, c, cx, cy, r, dash=True):
    sh = ('circle', cx, cy, r)
    b = solid(sh, p['shadow'], offset=28, dx=14, dy=14) + solid(sh, p['pop'], offset=28)
    if dash:
        b += outline(sh, T(p), 4, dash='4 16', offset=48)
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    return b


def badge_colours(p, fill):
    return CREAMW, (CREAMW if fill not in (YELLOW, LIME, CREAMW) else BROWN)


# 1 ── photo in a big circle beside (or under) the words ─────────────
def photo_side(p, c):
    b = deco(p, c.get('deco', 'rays'), 11)
    b += tv_logo(*pick((160, 160), (CX, 170)))
    b += photo_circle_at(p, c, *pick((1480, 520, 330), (CX, 1030, 300)))
    b += eyebrow(p, c['eyebrow'], TX, pick(330, 400), anchor=A, maxw=pick(TXW, MW))
    b += head(p, c['headline'], TX, pick(490, 560), maxw=pick(TXW, MW), maxsz=pick(150, 140), anchor=A)
    if c.get('sub'):
        b += sub(p, c['sub'], TX, pick(580, 640), maxw=pick(TXW, MW), anchor=A)
    b += tvpill(TX, pick(640, 1420), c['pill'], BROWN, YELLOW, shadow=p['shadow'], anchor=A, maxw=pick(TXW, MW))
    if c.get('line'):
        b += line(p, c['line'], TX, pick(830, 1620), maxw=pick(TXW, MW), anchor=A)
    if c.get('badge'):
        top, main = badge_colours(p, p['alt'])
        b += sticker(*pick((1210, 270), (830, 790)), 120, p['alt'], c.get('badge_top'), c['badge'], top, main, ring=CREAMW)
    return page(p, b + foot(p))


# 2 ── a photo band along one side (or across the top) ───────────────
def photo_band(p, c):
    b = deco(p, c.get('deco', 'dots'), 12)
    if not P:
        b += photo(('rect', 0, 0, 860, H, 0), c['photo'], bg=p['photo_bg'])
        b += f'<rect x="860" y="0" width="34" height="{H}" fill="{p["pop"]}"/>'
        b += tv_logo(W - 160, 160)
        tx, mw = 980, 780
    else:
        b += photo(('rect', 0, 0, W, 820, 0), c['photo'], bg=p['photo_bg'])
        b += f'<rect x="0" y="820" width="{W}" height="30" fill="{p["pop"]}"/>'
        b += f'<circle cx="160" cy="160" r="104" fill="{BROWN}"/>' + tv_logo(160, 160)
        tx, mw = CX, MW
    b += eyebrow(p, c['eyebrow'], tx, pick(330, 980), anchor=A, maxw=mw)
    b += head(p, c['headline'], tx, pick(490, 1120), maxw=mw, maxsz=pick(140, 130), anchor=A)
    if c.get('sub'):
        b += sub(p, c['sub'], tx, pick(580, 1200), maxw=mw, anchor=A)
    if c.get('line'):
        b += line(p, c['line'], tx, pick(790, 1680), maxw=pick(520 if c.get('price') else 780, MW), size=34, anchor=A)
    if c.get('price'):
        top, main = badge_colours(p, p['alt'])
        b += sticker(*pick((W - 260, 760), (CX, 1440)), 150, p['alt'], c.get('price_top'), c['price'], top, main, ring=CREAMW)
    return page(p, b + foot(p))


# 3 ── a price tag beside (or under) the headline ───────────────────
def tag_path(x0, y0, w, h):
    hole = h * 0.5
    return (f'M{x0} {y0 + hole} L{x0 + w * 0.14} {y0} H{x0 + w - 40} Q {x0 + w} {y0} {x0 + w} {y0 + 40} '
            f'V{y0 + h - 40} Q {x0 + w} {y0 + h} {x0 + w - 40} {y0 + h} H{x0 + w * 0.14} Z')


def price_tag(p, c):
    b = deco(p, c.get('deco', 'rays'), 17)
    b += tv_logo(*pick((160, 160), (CX, 170)))
    mw = pick(940, MW)
    b += eyebrow(p, c['eyebrow'], TX, pick(330, 400), anchor=A, maxw=mw)
    b += head(p, c['headline'], TX, pick(490, 560), maxw=mw, maxsz=pick(140, 130), anchor=A)
    if c.get('line'):
        b += smallline(p, c['line'], TX, pick(580, 650), maxw=mw, anchor=A)
    x0, y0, w, h = pick((1120, 300, 700, 400), (160, 760, 760, 420))
    tag = tag_path(x0, y0, w, h)
    b += f'<path d="{tag}" fill="{p["shadow"]}" transform="translate(16 16)"/><path d="{tag}" fill="{CREAMW}"/>'
    b += f'<path d="{tag}" fill="none" stroke="{p["pop"]}" stroke-width="5" stroke-dasharray="10 10" transform="translate({x0 + w / 2} {y0 + h / 2}) scale(0.93) translate({-(x0 + w / 2)} {-(y0 + h / 2)})"/>'
    b += f'<circle cx="{x0 + w * 0.13}" cy="{y0 + h / 2}" r="24" fill="{BROWN}"/>'
    b += f'<path d="M{x0 + w * 0.13} {y0 + h / 2} C {x0 - 60} {y0 + h * 0.2} {x0 - 80} {y0 - 60} {x0 + 20} {y0 - 100}" fill="none" stroke="{BROWN}" stroke-width="6"/>'
    if c.get('photo'):
        sh = pick(('circle', x0 + 90, y0 + h + 60, 150), ('circle', CX, 1480, 200))
        b += solid(sh, p['pop'], offset=20) + photo(sh, c['photo'], bg=p['photo_bg'])
    tx = x0 + w * 0.58
    with role('detail', w * 0.7):
        b += text(c['tag_top'], JK8, 30, tx, y0 + 90, p['shadow'] if p['shadow'] != YELLOW else CHILI, anchor='middle', track=0.3)
    with role('price_or_offer', w * 0.7):
        b += text(c['price'], ANTON, fit(c['price'], ANTON, w * 0.68, 200), tx, y0 + 280, BROWN, anchor='middle', track=0.02)
    with role('detail', w * 0.7):
        b += text(c['tag_bottom'], JK8, fit(c['tag_bottom'], JK8, w * 0.7, 28, 0.12), tx, y0 + 350, TEAL, anchor='middle', track=0.12)
    return page(p, b + foot(p))


# 4 ── three dishes, each with its picture and price ─────────────────
def menu_trio(p, c):
    b = deco(p, c.get('deco', 'confetti'), 18)
    cols = [p['pop'], p['alt'], ORANGE]
    b += tv_logo(*pick((160, 150), (CX, 170)))
    b += eyebrow(p, c['eyebrow'], pick(300, CX), pick(130, 400), anchor=A, maxw=pick(1400, MW))
    b += head(p, c['headline'], pick(300, CX), pick(240, 540), maxw=pick(1400, MW), maxsz=pick(110, 120), anchor=A)
    for i, (src, name, desc, price) in enumerate(c['items']):
        col = cols[i % 3]
        pc = BROWN if col in (YELLOW, LIME) else CREAMW
        if not P:
            cx = 360 + i * 600
            x, y, w, h = cx - 270, 320, 540, 600
            b += f'<rect x="{x + 12}" y="{y + 12}" width="{w}" height="{h}" rx="40" fill="{p["shadow"]}"/>'
            b += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="40" fill="{CREAMW}"/>'
            sh = ('circle', cx, y + 160, 120)
            b += solid(sh, col, offset=12) + photo(sh, src, bg=p['photo_bg'])
            b += f'<circle cx="{cx}" cy="{y + 505}" r="70" fill="{col}"/>'
            with role('detail', w - 60):
                b += text(name, ANTON, fit(name, ANTON, w - 60, 48, 0.03), cx, y + 360, BROWN, anchor='middle', track=0.03)
                b += text(desc, JK7, fit(desc, JK7, w - 60, 28), cx, y + 410, TEAL, anchor='middle')
            with role('price_or_offer', 120):
                b += text(price, ANTON, fit(price, ANTON, 110, 50), cx, y + 535, pc, anchor='middle')
            with role('detail', 120):
                b += text('MVR', JK8, FLOOR, cx, y + 484, pc, anchor='middle', track=0.2)
        else:
            y = 740 + i * 320
            x, w, h = 90, W - 180, 240
            b += f'<rect x="{x + 12}" y="{y - h / 2 + 12}" width="{w}" height="{h}" rx="{h / 2}" fill="{p["shadow"]}"/>'
            b += f'<rect x="{x}" y="{y - h / 2}" width="{w}" height="{h}" rx="{h / 2}" fill="{CREAMW}"/>'
            sh = ('circle', x + 130, y, 100)
            b += solid(sh, col, offset=12) + photo(sh, src, bg=p['photo_bg'])
            b += f'<circle cx="{x + w - 110}" cy="{y}" r="84" fill="{col}"/>'
            with role('detail', 480):
                b += text(name, ANTON, fit(name, ANTON, 480, 50, 0.03), x + 260, y + 4, BROWN, track=0.03)
                b += text(desc, JK7, fit(desc, JK7, 480, 28), x + 262, y + 50, TEAL)
            with role('price_or_offer', 140):
                b += text(price, ANTON, fit(price, ANTON, 130, 60), x + w - 110, y + 40, pc, anchor='middle')
            with role('detail', 140):
                b += text('MVR', JK8, FLOOR, x + w - 110, y - 24, pc, anchor='middle', track=0.2)
    if c.get('line'):
        b += line(p, c['line'], CX, pick(972, 1740), maxw=pick(1700, MW), anchor='middle', size=32)
    return page(p, b + foot(p))


# 5 ── stickers everywhere ───────────────────────────────────────────
def sticker_bomb(p, c):
    b = deco(p, c.get('deco', 'stripes'), 20)
    cols = [p['pop'], p['alt'], CREAMW, CHILI if p['pop'] != CHILI else YELLOW, BERRY if p['alt'] != BERRY else CYAN]
    b += tv_logo(*pick((160, 160), (CX, 170)))
    b += eyebrow(p, c['eyebrow'], CX, pick(250, 400), anchor='middle', maxw=pick(1500, MW))
    b += head(p, c['headline'], CX, pick(420, 560), maxw=pick(1600, MW), maxsz=pick(170, 150), anchor='middle')
    with role('detail', pick(1600, MW)):
        b += text(c['sub'], JK8, fit(c['sub'], JK8, pick(1600, MW), pick(40, 36), 0.12), CX, pick(500, 640), T(p), anchor='middle', track=0.12)
    spots = pick([(300, 740, 150), (640, 790, 160), (980, 740, 150), (1320, 790, 160), (1650, 740, 150)],
                 [(230, 920, 150), (540, 980, 160), (850, 920, 150), (380, 1360, 160), (720, 1420, 160)])
    for k, ((x, y, r), (top, main)) in enumerate(zip(spots, c['stickers'])):
        col = cols[k % len(cols)]
        tc = BROWN if col in (YELLOW, LIME, CREAMW) else CREAMW
        b += sticker(x, y, r, col, top, main, tc, tc, ring=BROWN, pts=16 + k * 2)
    return page(p, b + foot(p))


# 6 ── a grid of colour tiles, one word each ─────────────────────────
def big_grid(p, c):
    cols = c.get('tiles') or [p['pop'], p['alt'], CREAMW, BERRY, CYAN, BROWN]
    b = tv_logo(*pick((160, 160), (CX, 170)))
    b += eyebrow(p, c['eyebrow'], pick(300, CX), pick(180, 400), anchor=A, maxw=pick(1500, MW))
    tw, th, gap, per = pick((540, 250, 50, 3), (450, 280, 40, 2))
    x0 = (W - per * tw - (per - 1) * gap) / 2
    for i, word in enumerate(c['words']):
        x = x0 + (i % per) * (tw + gap)
        y = pick(290, 470) + (i // per) * (th + gap)
        col = cols[i % len(cols)]
        b += f'<rect x="{x + 10}" y="{y + 10}" width="{tw}" height="{th}" rx="40" fill="{p["shadow"]}" opacity="0.6"/>'
        b += f'<rect x="{x}" y="{y}" width="{tw}" height="{th}" rx="40" fill="{col}"/>'
        tc = BROWN if col in (YELLOW, LIME, CREAMW, '#FFFFFF') else CREAMW
        with role('headline_or_offer', tw - 60):
            b += text(word, ANTON, fit(word, ANTON, tw - 70, pick(160, 150), 0.03), x + tw / 2, y + th * 0.74, tc, anchor='middle', track=0.03)
    if c.get('line'):
        b += tvpill(CX, pick(880, 1500), c['line'], BROWN, YELLOW, h=80, size=30, shadow=p['shadow'], anchor='middle', maxw=pick(1600, MW), rl='detail')
    return page(p, b + foot(p))


# 7 ── a clock for a time deal ───────────────────────────────────────
def countdown(p, c):
    b = rays(CX, H * 0.5, 30, p['deco'], 0.16, R=2600)
    b += tv_logo(*pick((160, 160), (CX, 170)))
    b += clock(*pick((430, 560), (CX, 920)), 230, CREAMW, p['pop'], BROWN, c.get('h', 3), c.get('m', 0))
    tx, mw = pick((800, 1000), (CX, MW))
    b += eyebrow(p, c['eyebrow'], tx, pick(330, 400), anchor=A, maxw=mw)
    b += head(p, c['headline'], tx, pick(490, 560), maxw=mw, maxsz=140, anchor=A)
    b += tvpill(tx, pick(540, 1240), c['time'], BROWN, YELLOW, font=ANTON, size=64, h=110, shadow=p['shadow'], anchor=A, maxw=mw)
    with role('detail', mw):
        b += text(c['sub'], JK8, fit(c['sub'], JK8, mw, pick(38, 36), 0.12), tx, pick(740, 1460), T(p), anchor=A, track=0.12)
    if c.get('line'):
        b += line(p, c['line'], tx, pick(830, 1560), maxw=mw, anchor=A)
    return page(p, b + foot(p))


# 8 ── a notice board of rows ────────────────────────────────────────
def notice(p, c):
    b = deco(p, c.get('deco', 'dots'), 21)
    rows = c['rows']
    b += tv_logo(*pick((160, 160), (CX, 170)))
    mw = pick(780, MW)
    b += eyebrow(p, c['eyebrow'], TX, pick(330, 400), anchor=A, maxw=mw)
    b += head(p, c['headline'], TX, pick(480, 560), maxw=mw, maxsz=pick(120, 130), anchor=A)
    x, w, rh = pick((940, 880, 100), (90, W - 180, 150))
    bh = 60 + len(rows) * rh
    y0 = pick(max(SAFE + 40, (H - FOOT_BAND - bh) / 2), 680)
    b += f'<rect x="{x + 12}" y="{y0 + 12}" width="{w}" height="{bh}" rx="40" fill="{p["shadow"]}"/>'
    b += f'<rect x="{x}" y="{y0}" width="{w}" height="{bh}" rx="40" fill="{CREAMW}"/>'
    accent = p['shadow'] if p['shadow'] not in (YELLOW,) else CHILI
    for i, (l, r) in enumerate(rows):
        y = y0 + 30 + i * rh + rh * 0.62
        if not P:
            with role('detail', w * 0.5 - 40):
                b += text(l, JK8, fit(l, JK8, w * 0.5 - 40, 36), x + 50, y, BROWN)
                b += text(r, JK8, fit(r, JK8, w * 0.46 - 40, 36), x + w - 50, y, accent, anchor='end')
        else:
            with role('detail', w - 100):
                b += text(l, JK8, fit(l, JK8, w - 100, 34), x + 50, y - 50, BROWN)
                b += text(r, JK8, fit(r, JK8, w - 100, 46), x + 50, y + 8, accent)
        if i < len(rows) - 1:
            yy = y0 + 30 + (i + 1) * rh
            b += f'<line x1="{x + 50}" y1="{yy}" x2="{x + w - 50}" y2="{yy}" stroke="{BROWN}" stroke-width="2" stroke-dasharray="2 10" opacity="0.5"/>'
    if c.get('line'):
        b += line(p, c['line'], TX, pick(600, y0 + bh + 90), maxw=mw, anchor=A, size=34)
    return page(p, b + foot(p))


# 9 ── scan the QR ──────────────────────────────────────────────────
def qr_promo(p, c):
    b = deco(p, c.get('deco', 'rays'), 22)
    b += tv_logo(*pick((160, 160), (CX, 170)))
    mw = pick(1000, MW)
    b += eyebrow(p, c['eyebrow'], TX, pick(330, 400), anchor=A, maxw=mw)
    b += head(p, c['headline'], TX, pick(490, 560), maxw=mw, maxsz=pick(150, 140), anchor=A)
    with role('detail', mw):
        b += text(c['sub'], JK8, fit(c['sub'], JK8, mw, pick(38, 34), 0.1), TX, pick(570, 640), T(p), anchor=A, track=0.1)
    qx, qy, qs = pick((1290, 240, 540), (CX - 290, 740, 580))
    steps_y, step_x0, step_dx = pick((760, 200, 330), (1540, 200, 340))
    b += f'<rect x="{qx + 14}" y="{qy + 14}" width="{qs}" height="{qs}" rx="40" fill="{p["shadow"]}"/>'
    b += f'<rect x="{qx}" y="{qy}" width="{qs}" height="{qs}" rx="40" fill="{CREAMW}"/>'
    m = 36
    for (x, y, sx, sy) in [(qx + m, qy + m, 1, 1), (qx + qs - m, qy + m, -1, 1), (qx + m, qy + qs - m, 1, -1), (qx + qs - m, qy + qs - m, -1, -1)]:
        b += f'<path d="M{x} {y + 50 * sy} V{y} H{x + 50 * sx}" fill="none" stroke="{p["pop"] if p["pop"] != YELLOW else ORANGE}" stroke-width="12" stroke-linecap="round"/>'
    b += qr(c['qr'], qx + 70, qy + 70, qs - 140, BROWN, None)
    for i, s in enumerate(c['steps']):
        x = step_x0 + i * step_dx
        b += f'<circle cx="{x}" cy="{steps_y}" r="40" fill="{p["pop"]}"/>'
        with role('detail', step_dx - 40):
            b += text(str(i + 1), ANTON, 48, x, steps_y + 17, BROWN if p['pop'] in (YELLOW, LIME) else CREAMW, anchor='middle')
            b += text(s, JK8, fit(s, JK8, step_dx - 60, 30, 0.1), x, steps_y + 92, T(p), anchor='middle', track=0.1)
    return page(p, b + foot(p))


# 10 ── festivals and seasons ────────────────────────────────────────
def festive(p, c):
    k = c['kind']
    b = ''
    if k == 'ramadan':
        b += lantern(W - 180, 0, 220, YELLOW, ORANGE) + lantern(W - 330, 60, 150, YELLOW, CHILI)
        if not P:
            b += lantern(1080, 0, 140, YELLOW, ORANGE)
        b += crescent(W - 170, pick(H * 0.62, 1700), 90, YELLOW, -20)
        for x, y, r in [(W - 90, 420, 14), (W - 320, 380, 10), (W - 60, 760, 12), (W - 260, 700, 9)]:
            b += star(x, y, r, YELLOW)
    elif k == 'eid':
        b += crescent(W - 190, 300, 110, YELLOW, -30)
        b += confetti(31, 60, [YELLOW, CREAMW, ORANGE], [(SAFE, SAFE, W - SAFE, SAFE + 90), (W - 300, 400, W - SAFE, H - FOOT_BAND - 40)], rmin=8, rmax=18)
        for x, y, r in [(W - 120, 560, 16), (W - 300, 650, 12), (W - 80, 820, 12)]:
            b += star(x, y, r, YELLOW)
    elif k == 'national':
        b += f'<rect x="0" y="0" width="{W}" height="{H}" fill="{REDF}"/>'
        if not P:
            b += f'<rect x="1100" y="200" width="740" height="{H - FOOT_BAND - 300}" rx="30" fill="{GREENF}"/>'
            b += crescent(1470, 540, 170, '#FFFFFF', -35)
        else:
            b += f'<rect x="90" y="700" width="{W - 180}" height="620" rx="30" fill="{GREENF}"/>'
            b += crescent(CX, 1010, 190, '#FFFFFF', -35)
    elif k == 'newyear':
        for x, y, r, col in [(180, 820, 110, YELLOW), (W - 200, 300, 90, BERRY), (W - 120, 760, 70, CYAN), (W - 420, pick(900, 1500), 80, ORANGE), (W - 300, 120, 60, LIME), (300, 120, 60, CYAN)]:
            b += firework(x, y, r, col)
    elif k == 'valentine':
        rnd = random.Random(7)
        for i in range(22):
            x = rnd.uniform(W - 360, W - SAFE - 20) if not P else rnd.choice([rnd.uniform(SAFE + 10, 200), rnd.uniform(W - 200, W - SAFE - 10)])
            y = rnd.uniform(SAFE + 40, H - FOOT_BAND - 60)
            b += heart(x, y, rnd.uniform(18, 44), rnd.choice([CREAMW, YELLOW, CHILI]), rnd.uniform(-25, 25))
    elif k == 'summer':
        b += sun(W - 200, 260, 70, YELLOW)
        for i in range(3):
            y = H - FOOT_BAND - 150 + i * 40
            d = f'M0 {y}' + ''.join(' q 60 -30 120 0 t 120 0' for _ in range(int(W / 240) + 1))
            b += f'<path d="{d}" fill="none" stroke="{CREAMW}" stroke-width="8" opacity="{0.7 - i * 0.2}"/>'
    b += tv_logo(*pick((160, 160), (CX, 170)))
    mw = pick(960, MW)
    if c.get('photo') and k != 'national':
        sh = pick(('circle', 1480, 520, 300), ('circle', CX, 1000, 280))
        b += solid(sh, p['pop'], offset=22) + photo(sh, c['photo'], bg=p['photo_bg'])
    b += eyebrow(p, c['eyebrow'], TX, pick(330, 400), anchor=A, maxw=mw)
    b += head(p, c['headline'], TX, pick(500, 560), maxw=mw, maxsz=pick(150, 140), anchor=A)
    b += tvpill(TX, pick(580, 1370), c['offer'], BROWN, YELLOW, font=ANTON, size=pick(60, 56), h=104, shadow=p['shadow'], anchor=A, maxw=mw)
    if c.get('line'):
        b += line(p, c['line'], TX, pick(820, 1600), maxw=mw, anchor=A)
    return page(p, b + foot(p))


# 11 ── a polaroid pinned beside (or under) the words ────────────────
def polaroid(p, c):
    b = deco(p, c.get('deco', 'confetti'), 14)
    rot = -3.5
    b += tv_logo(*pick((160, 160), (CX, 170)))
    mw = pick(900, MW)
    fx, fy, fs = pick((1180, 190, 600), (CX - 300, 660, 600))
    fr = ('rect', fx, fy, fs, fs, 8)
    b += solid(fr, BROWN, rot=rot, dx=16, dy=18) + solid(fr, '#FFFFFF', rot=rot)
    b += photo(('rect', fx + 36, fy + 36, fs - 72, fs - 150, 0), c['photo'], bg=p['photo_bg'], rot=rot)
    b += tape(fx + 50, fy + 10, 170, -30, p['pop']) + tape(fx + fs - 50, fy + 10, 170, 28, p['alt'])
    b += eyebrow(p, c['eyebrow'], TX, pick(330, 400), anchor=A, maxw=mw)
    b += head(p, c['headline'], TX, pick(490, 560), maxw=mw, maxsz=pick(140, 130), anchor=A)
    with role('detail', mw):
        b += text(c['caption'], FR7I, fit(c['caption'], FR7I, mw, pick(48, 44)), TX, pick(580, 1560), T(p), anchor=A)
    if c.get('line'):
        b += smallline(p, c['line'], TX, pick(680, 1650), maxw=mw, size=pick(32, 30), anchor=A)
    if c.get('sticker'):
        sx, sy = pick((fx + fs - 60, fy + fs - 40), (fx + fs - 40, fy + fs - 20))
        b += sticker(sx, sy, 120, p['pop'], c.get('sticker_top'), c['sticker'], BROWN, BROWN if p['pop'] in (YELLOW, LIME, CREAMW) else CREAMW, ring=CREAMW)
    return page(p, b + foot(p))


# 12 ── a magazine cover ─────────────────────────────────────────────
def magazine(p, c):
    b = deco(p, c.get('deco', ''), 15)
    b += f'<circle cx="160" cy="150" r="104" fill="{BROWN}"/>' + tv_logo(160, 150)
    mw = pick(960, MW)
    sh = pick(('rect', 1100, 200, 740, 600, 40), ('rect', 90, 620, W - 180, 760, 40))
    b += solid(sh, p['shadow'], dx=16, dy=16)
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    sz = fit(c['masthead'], ANTON, mw, pick(300, 320), 0.02)
    with role('headline', mw):
        b += stext(c['masthead'], ANTON, sz, TX, pick(500, 560), p['pop'], p['shadow'], d=12, anchor=A, track=0.02)
    b += tvpill(TX, pick(560, 1440), c['tag'], BROWN, YELLOW, h=80, size=30, anchor=A, maxw=mw, rl='detail')
    b += head(p, c['headline'], TX, pick(780, 1640), maxw=mw, maxsz=pick(90, 80), anchor=A, rl='headline_or_offer')
    if c.get('line'):
        b += smallline(p, c['line'], TX, pick(850, 1720), maxw=mw, size=pick(32, 30), anchor=A)
    with role('footer', 700):
        b += text(c.get('issue', 'BAKE & GRILL  ·  SPECIAL EDITION'), JK8, FLOOR, W - SAFE - 20, 110, T(p), anchor='end', track=0.2)
        b += text(c.get('date', 'THIS MONTH'), JK8, FLOOR, W - SAFE - 20, 150, pop_or_dark(p), anchor='end', track=0.2)
    if c.get('sticker'):
        top, main = badge_colours(p, p['alt'])
        b += sticker(*pick((1120, 760), (W - 190, 1360)), 120, p['alt'], c.get('sticker_top'), c['sticker'], top, main, ring=CREAMW)
    return page(p, b + foot(p))


ARCH = dict(photo_side=photo_side, photo_band=photo_band, price_tag=price_tag, menu_trio=menu_trio,
            sticker_bomb=sticker_bomb, big_grid=big_grid, countdown=countdown, notice=notice,
            qr_promo=qr_promo, festive=festive, polaroid=polaroid, magazine=magazine)
