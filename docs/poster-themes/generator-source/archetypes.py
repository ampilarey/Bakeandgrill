"""15 layout styles. Each takes a palette dict and a content dict and returns a full SVG page."""
from kit5 import *
from posters import rule, logo_disc


def T(p):
    return p['ink'] if p.get('dark_text') else p['light']


def eyebrow(p, s, y=194, col=None):
    c = col or (p['pop'] if not p.get('dark_text') else p['pop'])
    return text(s, FR9I, fit(s, FR9I, 360, 28), CX, y, c, anchor='middle')


def head(p, s, y, maxw=370, maxsz=84, col=None, sh=True, anchor='middle', x=CX, track=0.04):
    sz = fit(s, ANTON, maxw, maxsz, track)
    col = col or T(p)
    if sh:
        return stext(s, ANTON, sz, x, y, col, p['shadow'], d=max(1.5, sz * 0.04), anchor=anchor, track=track)
    return text(s, ANTON, sz, x, y, col, anchor=anchor, track=track)


def autopill(cx, y, s, fill, col, font=JK8, size=12, h=34, shadow=None, track=0.1, minw=160):
    w = max(minw, font.width(s, size, track) + h * 1.2)
    return pill(cx, y, w, h, fill, s, font, size, col, track=track, shadow=shadow)


def badge(cx, cy, r, fill, top, main, topcol, maincol, ring=None, pts=18):
    b = ''
    if ring:
        b += burst(cx, cy, r + 6, pts, 6, ring, rot=6)
    b += burst(cx, cy, r, pts, 6, fill, rot=10)
    if top:
        b += text(top, JK8, max(6, r * 0.17), cx, cy - r * 0.28, topcol, anchor='middle', track=0.2)
    b += text(main, ANTON, fit(main, ANTON, r * 1.45, r * 0.55), cx, cy + r * (0.22 if top else 0.18), maincol, anchor='middle')
    return b


def deco(p, kind, seed=1):
    if kind == 'rays':
        return rays(CX, 392, 26, p['deco'], 0.16)
    if kind == 'confetti':
        return confetti(seed, 60, [YELLOW, ORANGE, CHILI, TEAL, BERRY, CYAN, LIME],
                        [(SAFE + 30, SAFE + 4, W - SAFE - 30, 30), (SAFE + 4, 40, 110, 165), (W - 110, 40, W - SAFE - 4, 165),
                         (SAFE + 4, 230, 40, 470), (W - 40, 230, W - SAFE - 4, 470)], rmin=2, rmax=5)
    if kind == 'halftone':
        return halftone(0, 0, W, H, 9, 3.4, p['deco'], W, H, 360, 0.35) + halftone(0, 0, W, H, 9, 3.4, p['deco'], 0, 0, 260, 0.35)
    if kind == 'stripes':
        return stripes(p['deco'], 0.14, gap=30, wdt=12, angle=-35)
    if kind == 'bands':
        return bands([p['pop'], p['alt'], p['light'], p['deco']], 46, -28, 0.2)
    if kind == 'dots':
        return halftone(0, 0, W, H, 14, 2.2, p['deco'], CX, H / 2, 900, 0.25)
    return ''


def page(p, b, extra_defs=''):
    return docv(b, p['bg'], p['defs'] + extra_defs)


def foot(p, band=False):
    if band:
        return f'<rect x="0" y="{H-36}" width="{W}" height="36" fill="{BROWN}"/>' + footer(CREAMW, YELLOW, y=H - SAFE - 2)
    return footer(T(p), p['pop'] if not p.get('dark_text') else p['shadow'] if p['shadow'] != YELLOW else CHILI)


# 1 ── photo in a big circle ───────────────────────────────────────
def photo_circle(p, c):
    b = deco(p, c.get('deco', 'rays'), 11)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 268, maxsz=74)
    sh = ('circle', CX, 386, 92)
    b += solid(sh, p['shadow'], offset=12, dx=5, dy=5) + solid(sh, p['pop'], offset=12)
    b += outline(sh, T(p), 1.4, dash='1.5 6', offset=20)
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    if c.get('badge'):
        b += badge(CX + 122, 332, 44, p['alt'], c.get('badge_top'), c['badge'], CREAMW, CREAMW if p['alt'] not in (YELLOW, LIME, CREAMW) else BROWN, ring=CREAMW)
    b += autopill(CX, 506, c['pill'], BROWN, YELLOW, shadow=p['shadow'])
    if c.get('line'):
        b += text(c['line'], FR7I, fit(c['line'], FR7I, 360, 14), CX, 557, T(p), anchor='middle')
    return page(p, b + foot(p, band=bool(c.get('line'))))


# 2 ── photo across the top, wavy edge ─────────────────────────────
def photo_top(p, c):
    wv = 'M0 0 H{W} V292 '.format(W=W)
    n = 6
    seg = W / n
    d = f'M0 0 H{W} V290'
    for i in range(n):
        x0 = W - i * seg
        d += f' Q {x0 - seg/4:.1f} {290 + (12 if i % 2 == 0 else -12)} {x0 - seg/2:.1f} 290 T {x0 - seg:.1f} 290'
    d += ' Z'
    sh = ('pathd', d, (0, 0, W, 302))
    b = deco(p, c.get('deco', 'dots'), 12)
    b += f'<path d="{d}" fill="{p["pop"]}" transform="translate(0 8)"/>'
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    b += f'<circle cx="82" cy="82" r="52" fill="{BROWN}"/>' + logo(82, 82 - 0.53 * 76, 76, dark_bg=True)
    if c.get('sticker'):
        b += badge(W - 84, 268, 48, p['alt'], c.get('sticker_top'), c['sticker'], CREAMW, CREAMW if p['alt'] not in (YELLOW, LIME) else BROWN, ring=CREAMW)
    b += eyebrow(p, c['eyebrow'], y=352)
    b += head(p, c['headline'], 438, maxsz=90)
    if c.get('sub'):
        b += text(c['sub'], ANTON, fit(c['sub'], ANTON, 370, 40, 0.06), CX, 484, p['pop'] if not p.get('dark_text') else p['shadow'], anchor='middle', track=0.06)
    b += autopill(CX, 502, c['pill'], BROWN, YELLOW, h=36, size=13, shadow=p['shadow'])
    if c.get('line'):
        b += text(c['line'], FR7I, fit(c['line'], FR7I, 360, 13), CX, 560, T(p), anchor='middle')
    return page(p, b + foot(p))


# 3 ── arch window ─────────────────────────────────────────────────
def arch(p, c):
    b = deco(p, c.get('deco', 'halftone'), 13)
    sh = ('arch', 88, 150, 250, 262)
    b += solid(sh, p['shadow'], offset=12, dx=7, dy=7) + solid(sh, p['pop'], offset=12)
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    b += outline(sh, CREAMW, 2, offset=5)
    b += logo_disc(112, 58, 92, disc=BROWN)
    b += autopill(CX, 396, c['pill'], BROWN, YELLOW, h=38, font=ANTON, size=22, shadow=p['shadow'], track=0.08)
    if c.get('eyebrow'):
        b += eyebrow(p, c['eyebrow'], y=472)
    b += head(p, c['headline'], 524, maxsz=58)
    if c.get('line'):
        b += text(c['line'], JK8, fit(c['line'], JK8, 360, 10.5, 0.1), CX, 550, T(p), anchor='middle', track=0.1)
    return page(p, b + foot(p, band=True))


# 4 ── polaroid ────────────────────────────────────────────────────
def polaroid(p, c):
    b = deco(p, c.get('deco', 'bands'), 14)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 258, maxsz=62)
    rot = -3.5
    fr = ('rect', CX - 122, 276, 244, 244, 3)
    b += solid(fr, BROWN, rot=rot, dx=6, dy=7) + solid(fr, '#FFFFFF', rot=rot)
    b += photo(('rect', CX - 108, 290, 216, 184, 0), c['photo'], bg=p['photo_bg'], rot=rot)
    b += tape(CX - 104, 280, 66, -30, p['pop']) + tape(CX + 104, 280, 66, 28, p['alt'])
    b += text(c['caption'], FR7I, fit(c['caption'], FR7I, 210, 16), CX, 502, BROWN, anchor='middle')
    if c.get('sticker'):
        b += badge(W - 70, 470, 46, p['pop'], c.get('sticker_top'), c['sticker'], BROWN, BROWN if p['pop'] in (YELLOW, LIME, CREAMW) else CREAMW, ring=CREAMW)
    if c.get('line'):
        b += text(c['line'], JK8, fit(c['line'], JK8, 360, 11, 0.08), CX, 548, T(p), anchor='middle', track=0.08)
    return page(p, b + foot(p, band=bool(c.get('line'))))


# 5 ── magazine cover ──────────────────────────────────────────────
def magazine(p, c):
    b = deco(p, c.get('deco', ''), 15)
    b += f'<circle cx="80" cy="74" r="48" fill="{BROWN}"/>' + logo(80, 74 - 0.53 * 72, 72, dark_bg=True)
    b += text(c.get('issue', 'BAKE & GRILL  ·  SPECIAL EDITION'), JK8, 8, W - 40, 62, T(p), anchor='end', track=0.2)
    b += text(c.get('date', 'THIS MONTH'), JK8, 8, W - 40, 76, p['pop'] if not p.get('dark_text') else p['shadow'], anchor='end', track=0.2)
    sz = fit(c['masthead'], ANTON, 384, 128, 0.02)
    b += stext(c['masthead'], ANTON, sz, CX, 226, p['pop'], p['shadow'], d=4.5, anchor='middle', track=0.02)
    sh = ('rect', 40, 240, 346, 232, 18)
    b += solid(sh, p['shadow'], dx=6, dy=6)
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    if c.get('sticker'):
        b += badge(W - 70, 258, 46, p['alt'], c.get('sticker_top'), c['sticker'], CREAMW, CREAMW if p['alt'] not in (YELLOW, LIME) else BROWN, ring=CREAMW)
    b += autopill(150, 452, c['tag'], BROWN, YELLOW, h=32, size=11, minw=120)
    b += head(p, c['headline'], 528, maxsz=50)
    if c.get('line'):
        b += text(c['line'], JK8, fit(c['line'], JK8, 360, 11, 0.08), CX, 552, T(p), anchor='middle', track=0.08)
    return page(p, b + foot(p))


# 6 ── diagonal photo split ────────────────────────────────────────
def split_diag(p, c):
    b = deco(p, c.get('deco', ''), 16)
    sh = ('poly', [(0, 0), (W, 0), (W, 250), (0, 332)])
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    b += f'<polygon points="0,332 {W},250 {W},264 0,346" fill="{p["pop"]}"/>'
    b += f'<circle cx="{W-82}" cy="82" r="52" fill="{BROWN}"/>' + logo(W - 82, 82 - 0.53 * 76, 76, dark_bg=True)
    b += f'<circle cx="{W-86}" cy="282" r="58" fill="{p["shadow"]}" transform="translate(4 4)"/><circle cx="{W-86}" cy="282" r="58" fill="{p["pop"]}"/>'
    pc = BROWN if p['pop'] in (YELLOW, LIME) else CREAMW
    b += text(c['price_top'], JK8, 9, W - 86, 262, pc, anchor='middle', track=0.25)
    b += text(c['price'], ANTON, fit(c['price'], ANTON, 90, 38), W - 86, 298, pc, anchor='middle')
    b += text(c['eyebrow'], FR9I, fit(c['eyebrow'], FR9I, 240, 26), 40, 390, p['pop'] if not p.get('dark_text') else p['shadow'])
    b += head(p, c['headline'], 470, maxw=346, maxsz=86, anchor='start', x=40)
    b += text(c['sub'], JK8, fit(c['sub'], JK8, 346, 13, 0.08), 42, 500, T(p), track=0.08)
    if c.get('pill'):
        b += autopill(CX, 520, c['pill'], BROWN, YELLOW, h=34, shadow=p['shadow'])
    return page(p, b + foot(p))


# 7 ── price tag ───────────────────────────────────────────────────
def price_tag(p, c):
    b = deco(p, c.get('deco', 'rays'), 17)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 254, maxsz=62)
    x0, y0 = CX - 116, 300
    tag = f'M{x0} {y0+80} L{x0+44} {y0} H{x0+300} Q {x0+312} {y0} {x0+312} {y0+12} V{y0+148} Q {x0+312} {y0+160} {x0+300} {y0+160} H{x0+44} Z'
    b += f'<path d="{tag}" fill="{p["shadow"]}" transform="translate(6 6)"/><path d="{tag}" fill="{CREAMW}"/>'
    b += f'<path d="{tag}" fill="none" stroke="{p["pop"]}" stroke-width="2" stroke-dasharray="4 4" transform="translate({x0+156} {y0+80}) scale(0.94) translate({-(x0+156)} {-(y0+80)})"/>'
    b += f'<circle cx="{x0+40}" cy="{y0+80}" r="10" fill="{BROWN}"/>'
    b += f'<path d="M{x0+40} {y0+80} C {x0-10} {y0+40} {x0-20} {y0-10} {x0+10} {y0-40}" fill="none" stroke="{BROWN}" stroke-width="2.4"/>'
    sh = ('circle', 104, 470, 58)
    b += solid(sh, p['pop'], offset=8) + photo(sh, c['photo'], bg=p['photo_bg'])
    tx = x0 + 186
    b += text(c['tag_top'], JK8, 11, tx, y0 + 36, p['shadow'] if p['shadow'] != YELLOW else CHILI, anchor='middle', track=0.3)
    b += text(c['price'], ANTON, fit(c['price'], ANTON, 220, 84), tx, y0 + 120, BROWN, anchor='middle', track=0.02)
    b += text(c['tag_bottom'], JK8, fit(c['tag_bottom'], JK8, 230, 10, 0.12), tx, y0 + 144, TEAL, anchor='middle', track=0.12)
    if c.get('line'):
        b += text(c['line'], JK8, fit(c['line'], JK8, 230, 12, 0.06), 186, 500, T(p), track=0.06)
        if c.get('line2'):
            b += text(c['line2'], FR7I, fit(c['line2'], FR7I, 230, 13), 186, 520, T(p))
    return page(p, b + foot(p, band=True))


# 8 ── three-item menu card ───────────────────────────────────────
def menu_trio(p, c):
    b = deco(p, c.get('deco', 'confetti'), 18)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 256, maxsz=60)
    for i, (src, name, desc, price) in enumerate(c['items']):
        y = 316 + i * 86
        b += f'<rect x="{40+4}" y="{y-36+4}" width="350" height="72" rx="36" fill="{p["shadow"]}"/>'
        b += f'<rect x="40" y="{y-36}" width="350" height="72" rx="36" fill="{CREAMW}"/>'
        sh = ('circle', 82, y, 34)
        b += solid(sh, [p['pop'], p['alt'], ORANGE][i % 3], offset=5) + photo(sh, src, bg=p['photo_bg'])
        b += text(name, ANTON, fit(name, ANTON, 170, 25, 0.03), 128, y + 3, BROWN, track=0.03)
        b += text(desc, JK7, fit(desc, JK7, 170, 9.5), 129, y + 19, TEAL)
        b += f'<circle cx="348" cy="{y}" r="30" fill="{[p["pop"], p["alt"], ORANGE][i % 3]}"/>'
        pc = BROWN if [p['pop'], p['alt'], ORANGE][i % 3] in (YELLOW, LIME) else CREAMW
        b += text('MVR', JK8, 7, 348, y - 9, pc, anchor='middle', track=0.2)
        b += text(price, ANTON, fit(price, ANTON, 44, 22), 348, y + 13, pc, anchor='middle')
    if c.get('line'):
        b += text(c['line'], FR7I, fit(c['line'], FR7I, 360, 14), CX, 553, T(p), anchor='middle')
    return page(p, b + foot(p, band=bool(c.get('line'))))


# 9 ── coupon with photo ───────────────────────────────────────────
def coupon_photo(p, c):
    b = deco(p, c.get('deco', 'rays'), 19)
    tx, ty, tw, th, cut = 46, 186, W - 92, 366, 446
    b += f'<rect x="{tx+5}" y="{ty+5}" width="{tw}" height="{th}" rx="14" fill="{p["shadow"]}"/>'
    b += f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="14" fill="{CREAMW}"/>'
    b += f'<rect x="{tx}" y="{cut}" width="{tw}" height="{ty+th-cut}" rx="14" fill="{p["pop"]}"/><rect x="{tx}" y="{cut}" width="{tw}" height="20" fill="{p["pop"]}"/>'
    bgc = '#888888'
    b += f'<circle cx="{tx}" cy="{cut}" r="13" fill="{BROWN}"/><circle cx="{tx+tw}" cy="{cut}" r="13" fill="{BROWN}"/>'
    b += f'<line x1="{tx+20}" y1="{cut}" x2="{tx+tw-20}" y2="{cut}" stroke="{BROWN}" stroke-width="1.4" stroke-dasharray="5 4"/>'
    sh = ('rect', tx + 16, ty + 16, tw - 32, 150, 10)
    b += photo(sh, c['photo'], bg=p['photo_bg'])
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += text(c['headline'], ANTON, fit(c['headline'], ANTON, 300, 52, 0.03), CX, 400, BROWN, anchor='middle', track=0.03)
    b += text(c['sub'], JK8, fit(c['sub'], JK8, 300, 11.5, 0.1), CX, 428, TEAL, anchor='middle', track=0.1)
    pc = BROWN if p['pop'] in (YELLOW, LIME) else CREAMW
    if len(c['price']) > 7:
        b += text(c['price_top'], JK8, 10, CX, 476, pc, anchor='middle', track=0.3)
        b += text(c['price'], ANTON, fit(c['price'], ANTON, 300, 52), CX, 522, pc, anchor='middle', track=0.03)
    else:
        b += text(c['price_top'], JK8, 10, CX - 104, 506, pc, anchor='middle', track=0.3)
        b += text(c['price'], ANTON, fit(c['price'], ANTON, 210, 60), CX + 36, 512, pc, anchor='middle', track=0.03)
    b += text(c.get('code', 'Show this poster at the counter'), JK7, 9, CX, 541, pc, anchor='middle', track=0.04)
    return page(p, b + foot(p))


# 10 ── sticker bomb ───────────────────────────────────────────────
def sticker_bomb(p, c):
    b = deco(p, c.get('deco', 'stripes'), 20)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 290, maxsz=96)
    b += text(c['sub'], JK8, fit(c['sub'], JK8, 370, 13, 0.12), CX, 318, T(p), anchor='middle', track=0.12)
    spots = [(98, 394, 56, 0), (226, 414, 62, 1), (338, 390, 52, 2), (148, 500, 50, 3), (292, 504, 52, 4)]
    cols = [p['pop'], p['alt'], CREAMW, CHILI if p['pop'] != CHILI else YELLOW, BERRY if p['alt'] != BERRY else CYAN]
    for (x, y, r, k), (top, main) in zip(spots, c['stickers']):
        col = cols[k]
        tc = BROWN if col in (YELLOW, LIME, CREAMW) else CREAMW
        b += badge(x, y, r, col, top, main, tc, tc, ring=BROWN, pts=16 + k * 2)
    return page(p, b + foot(p, band=True))


# 11 ── colour block grid ──────────────────────────────────────────
def big_grid(p, c):
    b = logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    cols = c.get('tiles') or [p['pop'], p['alt'], CREAMW, BERRY, CYAN, BROWN]
    for i, word in enumerate(c['words']):
        x = 36 + (i % 2) * 182
        y = 212 + (i // 2) * 104
        col = cols[i % len(cols)]
        b += f'<rect x="{x+4}" y="{y+4}" width="172" height="96" rx="16" fill="{p["shadow"]}" opacity="0.6"/>'
        b += f'<rect x="{x}" y="{y}" width="172" height="96" rx="16" fill="{col}"/>'
        tc = BROWN if col in (YELLOW, LIME, CREAMW, '#FFFFFF') else CREAMW
        b += text(word, ANTON, fit(word, ANTON, 146, 62, 0.03), x + 86, y + 71, tc, anchor='middle', track=0.03)
    if c.get('line'):
        b += autopill(CX, 526, c['line'], BROWN, YELLOW, h=30, size=11, shadow=p['shadow'])
    return page(p, b + foot(p, band=True))


# 12 ── clock / time deal ──────────────────────────────────────────
def countdown(p, c):
    b = rays(CX, 392, 30, p['deco'], 0.16)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 282, maxsz=86)
    b += clock(CX, 384, 70, CREAMW, p['pop'], BROWN, c.get('h', 3), c.get('m', 0))
    b += autopill(CX, 474, c['time'], BROWN, YELLOW, font=ANTON, size=26, h=44, shadow=p['shadow'], track=0.08)
    b += text(c['sub'], JK8, fit(c['sub'], JK8, 360, 13, 0.12), CX, 540, T(p), anchor='middle', track=0.12)
    if c.get('line'):
        b += text(c['line'], FR7I, fit(c['line'], FR7I, 360, 13), CX, 562, T(p), anchor='middle')
    return page(p, b + foot(p))


# 13 ── festivals ──────────────────────────────────────────────────
def festive(p, c):
    k = c['kind']
    b = ''
    if k == 'ramadan':
        b += lantern(66, 74, 66, YELLOW, ORANGE) + lantern(W - 66, 60, 76, YELLOW, ORANGE) + lantern(W - 116, 100, 48, YELLOW, CHILI)
        b += crescent(76, 400, 36, YELLOW, -20)
        for x, y, r in [(52, 330, 6), (W - 56, 340, 5), (110, 460, 4), (W - 80, 430, 6), (W - 120, 470, 4)]:
            b += star(x, y, r, YELLOW)
    elif k == 'eid':
        b += crescent(W - 70, 410, 40, YELLOW, -30) + confetti(31, 50, [YELLOW, CREAMW, ORANGE], [(SAFE + 4, 230, 60, 470), (W - 60, 360, W - SAFE - 4, 470), (SAFE + 30, SAFE + 4, W - SAFE - 30, 30)])
        for x, y, r in [(60, 330, 7), (W - 60, 330, 5), (56, 440, 5)]:
            b += star(x, y, r, YELLOW)
    elif k == 'national':
        b += f'<rect x="0" y="0" width="{W}" height="{H}" fill="{REDF}"/>'
        b += f'<rect x="40" y="290" width="{W-80}" height="190" rx="10" fill="{GREENF}"/>'
        b += crescent(CX + 80, 385, 66, '#FFFFFF', -35)
    elif k == 'newyear':
        for x, y, r, col in [(66, 360, 34, YELLOW), (W - 66, 350, 30, BERRY), (62, 450, 22, CYAN), (W - 64, 446, 26, ORANGE), (W - 96, 70, 22, LIME), (96, 70, 22, CYAN)]:
            b += firework(x, y, r, col)
    elif k == 'valentine':
        rnd = random.Random(7)
        for i in range(18):
            x = rnd.choice([rnd.uniform(SAFE + 6, 60), rnd.uniform(W - 60, W - SAFE - 6)])
            y = rnd.uniform(310, 470)
            b += heart(x, y, rnd.uniform(6, 14), rnd.choice([CREAMW, YELLOW, CHILI]), rnd.uniform(-25, 25))
    elif k == 'summer':
        b += sun(W - 66, 380, 22, YELLOW)
        for i in range(3):
            y = 470 + i * 14
            d = f'M0 {y}' + ''.join(f' q 17.75 -10 35.5 0 t 35.5 0' for _ in range(6))
            b += f'<path d="{d}" fill="none" stroke="{CREAMW}" stroke-width="3" opacity="{0.7 - i*0.2}"/>'
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 272, maxsz=78)
    if c.get('photo'):
        sh = ('circle', CX if k != 'national' else CX - 60, 384, 84)
        b += solid(sh, p['pop'], offset=8) + photo(sh, c['photo'], bg=p['photo_bg'])
    b += autopill(CX, 492, c['offer'], BROWN, YELLOW, font=ANTON, size=24, h=42, shadow=p['shadow'], track=0.06)
    if c.get('line'):
        b += text(c['line'], FR7I, fit(c['line'], FR7I, 360, 14), CX, 558, T(p), anchor='middle')
    return page(p, b + foot(p))


# 14 ── notice board ───────────────────────────────────────────────
def notice(p, c):
    b = deco(p, c.get('deco', 'dots'), 21)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 278, maxsz=80)
    rows = c['rows']
    bh = 40 + len(rows) * 34
    b += f'<rect x="{46+5}" y="{304+5}" width="{W-92}" height="{bh}" rx="16" fill="{p["shadow"]}"/>'
    b += f'<rect x="46" y="304" width="{W-92}" height="{bh}" rx="16" fill="{CREAMW}"/>'
    for i, (l, r) in enumerate(rows):
        y = 334 + i * 34 + 6
        b += text(l, JK8, fit(l, JK8, 160, 13), 70, y, BROWN)
        b += text(r, JK8, fit(r, JK8, 160, 13), W - 70, y, p['shadow'] if p['shadow'] not in (YELLOW,) else CHILI, anchor='end')
        if i < len(rows) - 1:
            b += f'<line x1="70" y1="{y+14}" x2="{W-70}" y2="{y+14}" stroke="{BROWN}" stroke-width="0.6" stroke-dasharray="1 3" opacity="0.5"/>'
    if c.get('line'):
        b += text(c['line'], FR7I, fit(c['line'], FR7I, 360, 14), CX, 304 + bh + 30, T(p), anchor='middle')
    return page(p, b + foot(p))


# 15 ── QR call-to-action ──────────────────────────────────────────
def qr_promo(p, c):
    b = deco(p, c.get('deco', 'rays'), 22)
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += eyebrow(p, c['eyebrow'])
    b += head(p, c['headline'], 276, maxsz=80)
    b += text(c['sub'], JK8, fit(c['sub'], JK8, 370, 13, 0.1), CX, 304, T(p), anchor='middle', track=0.1)
    b += f'<rect x="{CX-86+5}" y="{322+5}" width="172" height="172" rx="14" fill="{p["shadow"]}"/>'
    b += f'<rect x="{CX-86}" y="322" width="172" height="172" rx="14" fill="{CREAMW}"/>'
    for (x, y, sx, sy) in [(CX-74, 334, 1, 1), (CX+74, 334, -1, 1), (CX-74, 482, 1, -1), (CX+74, 482, -1, -1)]:
        b += f'<path d="M{x} {y+18*sy} V{y} H{x+18*sx}" fill="none" stroke="{p["pop"] if p["pop"] != YELLOW else ORANGE}" stroke-width="4" stroke-linecap="round"/>'
    b += qr(c['qr'], CX - 66, 342, 132, BROWN, None)
    for i, s in enumerate(c['steps']):
        x = CX + (i - 1) * 124
        b += f'<circle cx="{x}" cy="522" r="15" fill="{p["pop"]}"/>'
        b += text(str(i + 1), ANTON, 18, x, 529, BROWN if p['pop'] in (YELLOW, LIME) else CREAMW, anchor='middle')
        b += text(s, JK8, fit(s, JK8, 110, 10, 0.1), x, 552, T(p), anchor='middle', track=0.1)
    return page(p, b + foot(p))


ARCH = dict(photo_circle=photo_circle, photo_top=photo_top, arch=arch, polaroid=polaroid, magazine=magazine,
            split_diag=split_diag, price_tag=price_tag, menu_trio=menu_trio, coupon_photo=coupon_photo,
            sticker_bomb=sticker_bomb, big_grid=big_grid, countdown=countdown, festive=festive, notice=notice, qr_promo=qr_promo)
