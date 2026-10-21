from lib import *
from posters import rule, cup, logo_disc
from posters3 import glass, stripes

P = {}
RAINBOW = [YELLOW, ORANGE, CHILI, BERRY, CYAN, TEAL, LIME]


def bands(colors, width, angle=-30, opacity=1):
    out = [f'<g opacity="{opacity}" transform="rotate({angle} {CX} {H/2})">']
    i = 0
    for x in range(-700, 1200, int(width)):
        out.append(f'<rect x="{x}" y="-500" width="{width + 0.5}" height="1600" fill="{colors[i % len(colors)]}"/>')
        i += 1
    out.append('</g>')
    return ''.join(out)


def vbands(colors):
    w = W / len(colors)
    return ''.join(f'<rect x="{i*w:.2f}" y="0" width="{w + 0.3:.2f}" height="{H}" fill="{c}"/>' for i, c in enumerate(colors))


def title_pill(s, y=176, fill=BROWN, color=YELLOW, w=None):
    w = w or FR9I.width(s, 26) + 44
    return (f'<rect x="{CX - w/2}" y="{y}" width="{w}" height="38" rx="19" fill="{fill}"/>'
            + text(s, FR9I, 26, CX, y + 28, color, anchor='middle'))


# illustrations ───────────────────────────────────────────────
def shake(cx, base, h, col):
    w = h * 0.5
    top = base - h
    s = f'<rect x="{cx+w*0.12}" y="{top-h*0.42}" width="5" height="{h*0.55}" rx="2.5" fill="{CHILI}" transform="rotate(10 {cx} {top})"/>'
    for dx, r in ((-w*0.28, w*0.26), (w*0.28, w*0.26), (0, w*0.32)):
        s += f'<circle cx="{cx+dx}" cy="{top-r*0.4}" r="{r}" fill="#FFFFFF" stroke="{col}" stroke-width="2.2"/>'
    s += f'<circle cx="{cx+dx}" cy="{top-r*0.4}" r="{r-1.2}" fill="#FFFFFF"/>' if False else ''
    s += f'<circle cx="{cx+w*0.05}" cy="{top-w*0.62}" r="{w*0.13}" fill="{CHILI}"/>'
    s += f'<path d="M{cx-w/2} {top} L{cx+w/2} {top} L{cx+w*0.36} {base} L{cx-w*0.36} {base} Z" fill="{col}"/>'
    s += f'<rect x="{cx-w/2}" y="{top}" width="{w}" height="7" fill="{CREAMW}" opacity="0.8"/>'
    s += f'<rect x="{cx-w*0.42}" y="{top+h*0.4}" width="{w*0.84}" height="5" fill="{CREAMW}" opacity="0.35"/>'
    return s


def egg(cx, cy, r):
    return (f'<path d="M{cx-r} {cy} C {cx-r} {cy-r*1.1} {cx+r*0.6} {cy-r*1.2} {cx+r} {cy-r*0.1} '
            f'C {cx+r*1.2} {cy+r} {cx-r*0.2} {cy+r*1.1} {cx-r} {cy} Z" fill="{CREAMW}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.42}" fill="{ORANGE}"/>'
            f'<circle cx="{cx-r*0.12}" cy="{cy-r*0.14}" r="{r*0.12}" fill="{YELLOW}"/>')


def toast(cx, cy, r):
    return (f'<path d="M{cx-r*0.8} {cy+r} L{cx-r*0.8} {cy-r*0.3} C {cx-r*1.15} {cy-r*0.4} {cx-r*1.1} {cy-r*1.15} {cx} {cy-r*1.1} '
            f'C {cx+r*1.1} {cy-r*1.15} {cx+r*1.15} {cy-r*0.4} {cx+r*0.8} {cy-r*0.3} L {cx+r*0.8} {cy+r} Z" fill="{BUN}"/>'
            f'<path d="M{cx-r*0.6} {cy+r*0.8} L{cx-r*0.6} {cy-r*0.2} C {cx-r*0.9} {cy-r*0.3} {cx-r*0.85} {cy-r*0.9} {cx} {cy-r*0.88} '
            f'C {cx+r*0.85} {cy-r*0.9} {cx+r*0.9} {cy-r*0.3} {cx+r*0.6} {cy-r*0.2} L {cx+r*0.6} {cy+r*0.8} Z" fill="#F8DA9A"/>'
            f'<rect x="{cx-r*0.35}" y="{cy-r*0.1}" width="{r*0.7}" height="{r*0.32}" rx="3" fill="{YELLOW}"/>')


def donut(cx, cy, r, frost, seed=0):
    import random
    rnd = random.Random(seed)
    s = f'<circle cx="{cx}" cy="{cy+2}" r="{r}" fill="#D98A3E"/>'
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        rr = r * (0.86 if i % 2 else 0.95)
        pts.append(f'{cx + rr*math.cos(a):.1f},{cy + rr*math.sin(a):.1f}')
    s += f'<polygon points="{" ".join(pts)}" fill="{frost}" stroke="{frost}" stroke-width="3" stroke-linejoin="round"/>'
    for i in range(14):
        a = rnd.uniform(0, 2 * math.pi)
        d = rnd.uniform(r * 0.45, r * 0.78)
        x, y = cx + d * math.cos(a), cy + d * math.sin(a)
        c = rnd.choice([YELLOW, CYAN, CREAMW, LIME, CHILI])
        s += f'<rect x="{x:.1f}" y="{y:.1f}" width="6" height="2.2" rx="1.1" fill="{c}" transform="rotate({rnd.uniform(0,180):.0f} {x:.1f} {y:.1f})"/>'
    s += f'<circle cx="{cx}" cy="{cy}" r="{r*0.3}" fill="#B86A2A"/><circle cx="{cx}" cy="{cy}" r="{r*0.26}" fill="BGHOLE"/>'
    return s


def burger(cx, cy, w):
    s = f'<path d="M{cx-w/2} {cy-6} Q {cx-w/2} {cy-w*0.42} {cx} {cy-w*0.44} Q {cx+w/2} {cy-w*0.42} {cx+w/2} {cy-6} Z" fill="{BUN}"/>'
    import random
    rnd = random.Random(5)
    for i in range(9):
        x = cx + rnd.uniform(-w * 0.32, w * 0.32)
        y = cy - rnd.uniform(w * 0.14, w * 0.34)
        s += f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="3.2" ry="1.6" fill="{CREAMW}" transform="rotate({rnd.uniform(-30,30):.0f} {x:.1f} {y:.1f})"/>'
    lw = w * 1.04
    d = f'M{cx-lw/2} {cy-6}'
    for i in range(10):
        x0 = cx - lw / 2 + i * lw / 10
        d += f' Q {x0 + lw/20:.1f} {cy+10:.1f} {x0 + lw/10:.1f} {cy-2}'
    d += f' L {cx+lw/2} {cy-10} L {cx-lw/2} {cy-10} Z'
    s += f'<path d="{d}" fill="{LIME}"/>'
    s += f'<rect x="{cx-w/2+4}" y="{cy}" width="{w-8}" height="10" rx="5" fill="{CHILI}"/>'
    s += f'<polygon points="{cx-w/2},{cy+8} {cx+w/2},{cy+8} {cx+w*0.3},{cy+22} {cx+w*0.1},{cy+12} {cx-w*0.15},{cy+24} {cx-w*0.3},{cy+12}" fill="{YELLOW}"/>'
    s += f'<rect x="{cx-w/2+2}" y="{cy+12}" width="{w-4}" height="22" rx="11" fill="#5A2A12"/>'
    s += f'<path d="M{cx-w/2+2} {cy+38} L{cx+w/2-2} {cy+38} Q {cx+w/2-4} {cy+62} {cx} {cy+62} Q {cx-w/2+4} {cy+62} {cx-w/2+2} {cy+38} Z" fill="{BUN}"/>'
    return s


def fries(cx, base, h):
    w = h * 0.7
    s = ''
    import random
    rnd = random.Random(29)
    for i in range(11):
        x = cx - w * 0.38 + i * w * 0.076
        fh = h * rnd.uniform(0.75, 1.0)
        s += f'<rect x="{x:.1f}" y="{base - fh:.1f}" width="{w*0.07:.1f}" height="{fh:.1f}" rx="1.5" fill="{YELLOW}" transform="rotate({rnd.uniform(-8,8):.0f} {x:.1f} {base})"/>'
    s += f'<path d="M{cx-w/2} {base-h*0.5} Q {cx} {base-h*0.38} {cx+w/2} {base-h*0.5} L {cx+w*0.4} {base} L {cx-w*0.4} {base} Z" fill="{CHILI}"/>'
    s += flame(cx, base - h * 0.22, h * 0.22, YELLOW)
    return s


def phone(x, y, w, h):
    s = f'<rect x="{x+5}" y="{y+5}" width="{w}" height="{h}" rx="16" fill="{BERRYD}"/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{BROWN}"/>'
    s += f'<rect x="{x+6}" y="{y+14}" width="{w-12}" height="{h-26}" rx="9" fill="{CREAMW}"/>'
    s += f'<rect x="{x+w/2-14}" y="{y+5}" width="28" height="4" rx="2" fill="{CREAMW}" opacity="0.4"/>'
    s += f'<rect x="{x+6}" y="{y+14}" width="{w-12}" height="70" rx="9" fill="{TEAL}"/><rect x="{x+6}" y="{y+70}" width="{w-12}" height="14" fill="{TEAL}"/>'
    s += text('2X', ANTON, 46, x + w / 2, y + 70, YELLOW, anchor='middle')
    s += text('POINTS', JK8, 7, x + w / 2, y + 100, TEAL, anchor='middle', track=0.3)
    for i, c in enumerate([ORANGE, BERRY, CYAN]):
        yy = y + 112 + i * 30
        s += f'<rect x="{x+16}" y="{yy}" width="{w-32}" height="22" rx="6" fill="{c}" opacity="0.18"/>'
        s += f'<circle cx="{x+28}" cy="{yy+11}" r="6" fill="{c}"/>'
        s += f'<rect x="{x+40}" y="{yy+7}" width="{w*0.4}" height="4" rx="2" fill="{BROWN}" opacity="0.6"/>'
        s += f'<rect x="{x+40}" y="{yy+14}" width="{w*0.25}" height="3" rx="1.5" fill="{BROWN}" opacity="0.3"/>'
    return s


# posters ─────────────────────────────────────────────────────
# 21 Hot deal — pop-art halftone
def p21():
    b = halftone(0, 0, W, H, 9, 3.6, CHILI, W, H, 380, 0.5)
    b += halftone(0, 0, W, H, 9, 3.6, BERRY, 0, 0, 300, 0.5)
    b += burst(CX, 368, 172, 26, 22, ORANGE, rot=4)
    b += burst(CX, 368, 140, 26, 14, CHILI, rot=10)
    b += logo_disc(92, 62, 98)
    b += title_pill('Lunch Hot Deal', fill=TEAL, color=YELLOW)
    b += stext('HOT', ANTON, 112, CX, 340, YELLOW, BROWN, d=5, anchor='middle', track=0.06)
    b += stext('DEAL', ANTON, 112, CX, 452, CREAMW, BROWN, d=5, anchor='middle', track=0.06)
    b += pill(CX, 470, 330, 34, TEAL, 'GRILLED SANDWICH + ANY DRINK', JK8, 12.5, CREAMW, shadow=BROWN)
    b += stext('ONLY MVR 79', ANTON, 44, CX, 550, CHILI, BROWN, d=2, anchor='middle', track=0.04)
    b += f'<rect x="0" y="{H-36}" width="{W}" height="36" fill="{BROWN}"/>'
    b += footer(CREAMW, YELLOW, y=H - SAFE - 2)
    return docv(b, YELLOW)


# 22 Milkshake mania — rainbow bands
def p22():
    b = bands([BERRY, YELLOW, CYAN, ORANGE, LIME, CHILI], 44, -28)
    b += f'<rect x="{SAFE+20}" y="232" width="{W-2*SAFE-40}" height="330" rx="22" fill="{BROWN}" opacity="0.25" transform="translate(5 5)"/>'
    b += f'<rect x="{SAFE+20}" y="232" width="{W-2*SAFE-40}" height="330" rx="22" fill="{CREAMW}"/>'
    b += logo_disc(92, 62, 98)
    b += title_pill('Shake it up!', fill=BROWN, color=YELLOW)
    b += stext('MILKSHAKE', ANTON, 64, CX, 300, BERRY, BERRYD, d=2.5, anchor='middle', track=0.04)
    b += stext('MANIA', ANTON, 64, CX, 362, CYAN, TEALD, d=2.5, anchor='middle', track=0.2)
    b += shake(CX - 92, 492, 74, BERRY) + shake(CX, 492, 84, YELLOW) + shake(CX + 92, 492, 74, ORANGE)
    b += stext('20% OFF ALL SHAKES', ANTON, 30, CX, 530, CHILI, YELLOW, d=1.5, anchor='middle', track=0.05)
    b += text('Strawberry  ·  Mango  ·  Chocolate  ·  Vanilla', FR7I, 12, CX, 552, TEAL, anchor='middle')
    b += f'<rect x="0" y="{H-36}" width="{W}" height="36" fill="{BROWN}"/>'
    b += footer(CREAMW, YELLOW, y=H - SAFE - 2)
    return docv(b, YELLOW)


# 23 Mocha Monday — vertical candy stripes + big disc
def p23():
    b = vbands([CHILI, ORANGE, YELLOW, LIME, CYAN, BERRY, CHILI, ORANGE, YELLOW, LIME, CYAN, BERRY])
    b += f'<circle cx="{CX+6}" cy="{372}" r="150" fill="{BERRYD}"/>'
    b += f'<circle cx="{CX}" cy="366" r="150" fill="{BROWN}"/>'
    b += f'<circle cx="{CX}" cy="366" r="140" fill="none" stroke="{YELLOW}" stroke-width="1.6" stroke-dasharray="1.5 6" stroke-linecap="round"/>'
    b += logo_disc(92, 62, 98)
    b += title_pill('Start the week right', fill=BROWN, color=YELLOW, y=172)
    b += cup(CX, 304, 36, CREAMW, ORANGE, steam=False)
    b += stext('MOCHA', ANTON, 66, CX, 374, YELLOW, CHILI, d=2.5, anchor='middle', track=0.06)
    b += text('MONDAY', ANTON, 46, CX, 424, CREAMW, anchor='middle', track=0.18)
    b += text('ANY COFFEE', JK8, 11, CX, 448, CYAN, anchor='middle', track=0.3)
    b += text('MVR 25', ANTON, 30, CX, 484, ORANGE, anchor='middle', track=0.06)
    b += pill(CX, 530, 220, 30, BROWN, 'EVERY MONDAY · ALL DAY', JK8, 11, YELLOW, shadow=BERRYD)
    b += f'<rect x="0" y="{H-36}" width="{W}" height="36" fill="{BROWN}"/>'
    b += footer(CREAMW, YELLOW, y=H - SAFE - 2)
    return docv(b, YELLOW)


# 24 Breakfast combo — 4 colour tiles
def p24():
    defs = lin('o', [(0, ORANGE), (1, CHILI)])
    b = rays(CX, 330, 26, YELLOW, 0.18)
    b += logo_disc(92, 62, 98)
    b += text('Rise & Shine', FR9I, 30, CX, 200, CREAMW, anchor='middle')
    tiles = [(YELLOW, 'EGGS', BROWN), (CYAN, 'TOAST', CREAMW), (BERRY, 'COFFEE', CREAMW), (LIME, 'JUICE', BROWN)]
    tw, th, gap = 160, 108, 12
    x0 = CX - tw - gap / 2
    y0 = 222
    for i, (c, lab, lc) in enumerate(tiles):
        x = x0 + (i % 2) * (tw + gap)
        y = y0 + (i // 2) * (th + gap)
        b += f'<rect x="{x+4}" y="{y+4}" width="{tw}" height="{th}" rx="14" fill="{BROWN}" opacity="0.35"/>'
        b += f'<rect x="{x}" y="{y}" width="{tw}" height="{th}" rx="14" fill="{c}"/>'
        icx, icy = x + tw / 2, y + 46
        if lab == 'EGGS':
            b += egg(icx - 18, icy, 22) + egg(icx + 22, icy + 6, 18)
        elif lab == 'TOAST':
            b += toast(icx, icy, 30)
        elif lab == 'COFFEE':
            b += cup(icx, icy + 28, 46, CREAMW, ORANGE, steam=False)
        else:
            b += glass(icx - 26, icy - 30, 52, 62, ORANGE)
        b += text(lab, JK8, 11, x + tw / 2, y + th - 10, lc, anchor='middle', track=0.3)
    b += stext('BREAKFAST COMBO', ANTON, fit('BREAKFAST COMBO', ANTON, 330, 50), CX, 510, CREAMW, BROWN, d=2.5, anchor='middle', track=0.03)
    b += pill(CX, 522, 250, 38, YELLOW, 'ALL 4 FOR MVR 59', ANTON, 24, CHILI, track=0.05, shadow=BROWN)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#o)', defs)


# 25 Desserts 2 for 1 — magenta + donuts
def p25():
    defs = rad('m', [(0, '#FF3DA0'), (0.6, BERRY), (1, BERRYD)], cy=0.45)
    b = confetti(25, 60, [YELLOW, CYAN, LIME, CREAMW, ORANGE],
                 [(SAFE + 30, SAFE + 4, W - SAFE - 30, 30), (SAFE + 4, 40, 110, 165), (W - 110, 40, W - SAFE - 4, 165),
                  (SAFE + 4, 220, 50, 420), (W - 50, 220, W - SAFE - 4, 420)], rmin=2, rmax=5)
    b += logo_disc(92, 62, 98)
    b += text('Sweet Treats', FR9I, 30, CX, 200, YELLOW, anchor='middle')
    b += rule(212, YELLOW)
    b += stext('2 FOR 1', ANTON, fit('2 FOR 1', ANTON, 320, 140), CX, 352, YELLOW, BERRYD, d=5, anchor='middle', track=0.03)
    b += stext('DESSERTS', ANTON, 52, CX, 418, CREAMW, BERRYD, d=2.5, anchor='middle', track=0.14)
    for i, (dx, c) in enumerate([(-104, YELLOW), (0, CYAN), (104, CREAMW)]):
        b += donut(CX + dx, 474, 34, c, seed=i).replace('BGHOLE', BERRY)
    b += pill(CX, 522, 290, 32, YELLOW, 'WEEKDAYS  ·  2PM – 5PM', JK8, 12, BERRYD, shadow=BERRYD)
    b += text('Cakes  ·  Donuts  ·  Brownies', FR7I, 12, CX, 572, CREAMW, anchor='middle')
    b += footer(CREAMW, YELLOW, note='')
    return docv(b, 'url(#m)', defs)


# 26 25% off everything — rainbow rings
def p26():
    b = ''
    for r, c in [(430, LIME), (370, CYAN), (310, BERRY), (250, CHILI), (190, ORANGE), (132, YELLOW)]:
        b += f'<circle cx="{CX}" cy="380" r="{r}" fill="{c}"/>'
    b += f'<circle cx="{CX+5}" cy="385" r="120" fill="{BROWN}" opacity="0.25"/>'
    b += f'<circle cx="{CX}" cy="380" r="120" fill="{CREAMW}"/>'
    b += logo_disc(92, 62, 98)
    b += title_pill('Celebration Sale', fill=BROWN, color=YELLOW, y=176)
    b += text('UP TO', JK8, 11, CX, 312, TEAL, anchor='middle', track=0.4) if False else ''
    b += stext('25%', ANTON, 96, CX, 392, CHILI, YELLOW, d=3, anchor='middle')
    b += text('OFF', ANTON, 38, CX, 436, BERRY, anchor='middle', track=0.2)
    b += text('EVERYTHING', JK8, 10, CX, 456, TEAL, anchor='middle', track=0.35)
    b += pill(CX, 520, 260, 36, BROWN, 'THIS WEEKEND ONLY', ANTON, 20, YELLOW, track=0.1, shadow=BERRYD)
    b += f'<rect x="0" y="{H-36}" width="{W}" height="36" fill="{BROWN}"/>'
    b += footer(CREAMW, YELLOW, y=H - SAFE - 2)
    return docv(b, LIME)


# 27 Burger party — teal + halftone + big burger
def p27():
    defs = lin('t', [(0, '#12A39A'), (1, TEALD)])
    b = halftone(0, 220, W, H, 10, 4, CYAN, CX, 400, 260, 0.55)
    b += burst(CX, 384, 120, 20, 14, YELLOW, rot=3)
    b += logo_disc(92, 62, 98)
    b += text("Bring the squad", FR9I, 30, CX, 200, YELLOW, anchor='middle')
    b += stext('BURGER PARTY', ANTON, fit('BURGER PARTY', ANTON, 340, 70), CX, 282, CREAMW, TEALD, d=3, anchor='middle', track=0.03)
    b += burger(CX, 392, 150)
    b += pill(CX, 482, 300, 34, BERRY, 'BUY 3 BURGERS', ANTON, 22, CREAMW, track=0.1, shadow=BROWN)
    b += stext('GET FRIES FREE', ANTON, 40, CX, 556, YELLOW, BROWN, d=2, anchor='middle', track=0.05)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#t)', defs)


# 28 Double points — berry/orange split + phone
def p28():
    b = f'<polygon points="0,0 {W},0 {W},300 0,420" fill="{BERRY}"/>'
    b += f'<polygon points="0,420 {W},300 {W},312 0,432" fill="{YELLOW}"/>'
    b += halftone(0, 0, W, 420, 9, 3.2, YELLOW, W, 0, 260, 0.4)
    b += logo_disc(92, 62, 98)
    b += text('Loyalty Weekend', FR9I, 30, CX, 200, YELLOW, anchor='middle')
    b += stext('DOUBLE', ANTON, 62, 40, 286, CREAMW, BERRYD, d=3)
    b += stext('POINTS', ANTON, 62, 40, 352, YELLOW, BERRYD, d=3)
    b += text('on every order', FR7I, 15, 42, 380, CREAMW)
    b += phone(262, 226, 124, 250)
    b += pill(130, 448, 180, 34, BROWN, 'SAT & SUN', ANTON, 22, YELLOW, track=0.1, shadow=CHILI)
    b += text('In-store or at bakeandgrill.mv', JK8, 12, CX, 520, BROWN, anchor='middle', track=0.04)
    b += text('Points add up to free food', FR7I, 13, CX, 544, BERRYD, anchor='middle')
    b += footer(BROWN, BERRYD)
    return docv(b, ORANGE)


# 29 Fries Friday — red + yellow rays
def p29():
    defs = rad('r', [(0, '#F04A2A'), (1, CHILI)], cy=0.5)
    b = rays(CX, 440, 22, YELLOW, 0.25)
    b += confetti(29, 34, [YELLOW, CYAN, LIME, CREAMW], [(SAFE + 4, 230, 52, 470), (W - 52, 230, W - SAFE - 4, 470)])
    b += logo_disc(92, 62, 98)
    b += text('Every Friday', FR9I, 30, CX, 200, YELLOW, anchor='middle')
    b += rule(212, YELLOW)
    b += stext('FRIES', ANTON, 104, CX, 318, YELLOW, BROWN, d=4.5, anchor='middle', track=0.08)
    b += stext('FRIDAY', ANTON, 60, CX, 384, CREAMW, BROWN, d=2.5, anchor='middle', track=0.22)
    b += f'<circle cx="{CX}" cy="448" r="56" fill="{CYAN}"/>'
    b += fries(CX, 492, 92)
    b += pill(CX, 512, 340, 34, BROWN, 'FREE FRIES WITH ANY BURGER', JK8, 13, YELLOW, shadow=PLUM)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#r)', defs)


# 30 Iced coffee — cyan + ice cubes
def icedcoffee(x, y, w, h):
    s = f'<rect x="{x+w*0.6}" y="{y-h*0.3}" width="6" height="{h*0.55}" rx="3" fill="{BERRY}" transform="rotate(10 {x+w*0.6} {y})"/>'
    s += f'<path d="M{x} {y} L{x+w} {y} L{x+w*0.86} {y+h} L{x+w*0.14} {y+h} Z" fill="{CREAMW}" opacity="0.95"/>'
    s += f'<path d="M{x+w*0.05} {y+h*0.22} L{x+w*0.95} {y+h*0.22} L{x+w*0.89} {y+h*0.55} L{x+w*0.11} {y+h*0.55} Z" fill="#E9C9A0"/>'
    s += f'<path d="M{x+w*0.11} {y+h*0.55} L{x+w*0.89} {y+h*0.55} L{x+w*0.86} {y+h-4} L{x+w*0.14} {y+h-4} Z" fill="#6B3A1A"/>'
    for i, (dx, dy) in enumerate([(0.25, 0.3), (0.55, 0.36), (0.38, 0.6)]):
        s += f'<rect x="{x+w*dx}" y="{y+h*dy}" width="{w*0.2}" height="{w*0.2}" rx="4" fill="{CREAMW}" opacity="0.55" transform="rotate({12*i-8} {x+w*dx} {y+h*dy})"/>'
    s += f'<rect x="{x-4}" y="{y-6}" width="{w+8}" height="8" rx="4" fill="{CREAMW}"/>'
    return s


def p30():
    defs = lin('c', [(0, CYAN), (1, TEAL)])
    b = ''
    import random
    rnd = random.Random(30)
    for i in range(14):
        x = rnd.uniform(SAFE + 4, W - SAFE - 30)
        y = rnd.choice([rnd.uniform(486, 506), rnd.uniform(36, 150)])
        if CX - 80 < x < CX + 60 and y < 170:
            continue
        sz = rnd.uniform(10, 20)
        b += f'<rect x="{x:.1f}" y="{y:.1f}" width="{sz:.1f}" height="{sz:.1f}" rx="3" fill="{CREAMW}" opacity="0.35" transform="rotate({rnd.uniform(0,90):.0f} {x:.1f} {y:.1f})"/>'
    b += logo_disc(92, 62, 98)
    b += text('Beat the heat', FR9I, 30, CX, 200, CREAMW, anchor='middle')
    b += stext('ICED', ANTON, 100, 40, 318, CREAMW, TEALD, d=4)
    b += stext('COFFEE', ANTON, 64, 40, 384, YELLOW, BERRYD, d=3)
    b += text('Latte · Mocha · Americano', FR7I, 14, 42, 412, CREAMW)
    b += pill(132, 428, 184, 36, BERRY, 'FROM MVR 35', ANTON, 22, CREAMW, track=0.08, shadow=TEALD)
    b += icedcoffee(282, 250, 96, 210)
    b += burst(W - 54, 248, 30, 14, 5, YELLOW, rot=10)
    b += text('NEW', ANTON, 16, W - 54, 254, CHILI, anchor='middle', track=0.06)
    b += pill(CX, 520, 300, 32, CREAMW, 'MADE FRESH  ·  SERVED COLD', JK8, 12, TEAL, shadow=TEALD)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#c)', defs)


P.update({
    '21-hot-deal-sandwich-combo': p21, '22-milkshake-mania-20-off': p22, '23-mocha-monday-mvr25': p23,
    '24-breakfast-combo-mvr59': p24, '25-desserts-2-for-1': p25, '26-celebration-sale-25-off': p26,
    '27-burger-party-free-fries': p27, '28-double-points-weekend': p28, '29-fries-friday': p29,
    '30-iced-coffee-from-mvr35': p30,
})
