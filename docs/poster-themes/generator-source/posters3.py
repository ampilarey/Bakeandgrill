from lib import *
from posters import rule, cup, logo_disc

P = {}
FIRE = [(0, YELLOW), (0.5, ORANGE), (1, CHILI)]
SIDES = [(SAFE + 4, 230, 52, 470), (W - 52, 230, W - SAFE - 4, 470)]


def checker(y, h, c1, c2, sq=None):
    sq = sq or h / 2
    out = f'<rect x="0" y="{y}" width="{W}" height="{h}" fill="{c1}"/>'
    rows = int(round(h / sq))
    for r in range(rows):
        for k in range(int(W / sq) + 1):
            if (r + k) % 2:
                out += f'<rect x="{k*sq:.2f}" y="{y + r*sq:.2f}" width="{sq:.2f}" height="{sq:.2f}" fill="{c2}"/>'
    return out


def wave(y, amp, n, fill, top=True):
    seg = W / n
    d = f'M0 {y}'
    for i in range(n):
        x0 = i * seg
        d += f' Q {x0 + seg/4:.1f} {y + (amp if i % 2 == 0 else -amp):.1f} {x0 + seg/2:.1f} {y}'
        d += f' T {x0 + seg:.1f} {y}'
    d += f' L {W} 0 L 0 0 Z' if top else f' L {W} {H} L 0 {H} Z'
    return f'<path d="{d}" fill="{fill}"/>'


def stripes(color, opacity, gap=26, wdt=11, angle=-30):
    out = [f'<g opacity="{opacity}" transform="rotate({angle} {CX} {H/2})">']
    for x in range(-600, 1100, gap):
        out.append(f'<rect x="{x}" y="-400" width="{wdt}" height="1400" fill="{color}"/>')
    out.append('</g>')
    return ''.join(out)


# 11 ─ Juices: diagonal split teal / yellow
def glass(x, y, w, h, juice, rim=CREAMW):
    s = f'<path d="M{x} {y} L{x+w} {y} L{x+w*0.88} {y+h} L{x+w*0.12} {y+h} Z" fill="{rim}" opacity="0.92"/>'
    s += f'<path d="M{x+w*0.04} {y+h*0.18} L{x+w*0.96} {y+h*0.18} L{x+w*0.86} {y+h-4} L{x+w*0.14} {y+h-4} Z" fill="{juice}"/>'
    s += f'<rect x="{x+w*0.55}" y="{y-h*0.35}" width="5" height="{h*0.6}" rx="2.5" fill="{CHILI}" transform="rotate(12 {x+w*0.57} {y})"/>'
    s += f'<circle cx="{x+w*0.15}" cy="{y+4}" r="{w*0.2}" fill="{YELLOW}" stroke="{ORANGE}" stroke-width="2"/>'
    for i in range(3):
        s += f'<rect x="{x+w*(0.3+i*0.18)}" y="{y+h*(0.35+i*0.13)}" width="9" height="9" rx="2" fill="{CREAMW}" opacity="0.55"/>'
    return s


def p11():
    defs = lin('tl', [(0, '#0E8F88'), (1, TEALD)])
    b = f'<polygon points="0,440 {W},392 {W},{H} 0,{H}" fill="{YELLOW}"/>'
    b += f'<polygon points="0,452 {W},404 {W},416 0,464" fill="{ORANGE}"/>'
    b += confetti(11, 18, [YELLOW, CREAMW, ORANGE], [(SAFE + 30, SAFE + 4, 120, 150), (W - 120, SAFE + 4, W - SAFE - 30, 150)])
    b += logo_disc(92, 62, 98)
    b += text('Fresh & Chilled', FR9I, 28, CX, 196, YELLOW, anchor='middle')
    b += rule(208, YELLOW)
    b += stext('COOL', ANTON, 92, 46, 310, CREAMW, TEALD, d=4)
    b += stext('DOWN', ANTON, 92, 46, 398, YELLOW, CHILI, d=4)
    b += glass(300, 250, 82, 140, ORANGE)
    b += glass(338, 296, 64, 104, CHILI)
    b += text('ANY 2 FRESH JUICES', JK8, 16, CX, 488, BROWN, anchor='middle', track=0.16)
    b += stext('MVR 60', ANTON, 66, CX, 556, CHILI, BROWN, d=2.5, anchor='middle', track=0.04)
    b += footer(BROWN, CHILI)
    return docv(b, 'url(#tl)', defs)


# 12 ─ Lunch set: coupon ticket
def p12():
    defs = lin('red', [(0, CHILI), (1, PLUM)])
    b = rays(CX, 360, 26, ORANGE, 0.22)
    tx, ty, tw, th, cut = 46, 196, W - 92, 358, 452
    b += f'<rect x="{tx+5}" y="{ty+5}" width="{tw}" height="{th}" rx="14" fill="{PLUM}"/>'
    b += f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="14" fill="{CREAMW}"/>'
    b += f'<rect x="{tx}" y="{cut}" width="{tw}" height="{ty+th-cut}" rx="14" fill="{YELLOW}"/><rect x="{tx}" y="{cut}" width="{tw}" height="20" fill="{YELLOW}"/>'
    b += f'<circle cx="{tx}" cy="{cut}" r="13" fill="{CHILI}"/><circle cx="{tx+tw}" cy="{cut}" r="13" fill="{CHILI}"/>'
    b += f'<line x1="{tx+20}" y1="{cut}" x2="{tx+tw-20}" y2="{cut}" stroke="{BROWN}" stroke-width="1.4" stroke-dasharray="5 4"/>'
    b += logo_disc(92, 62, 98)
    b += text('Weekday', FR9I, 26, CX, 238, CHILI, anchor='middle')
    b += text('LUNCH SET', ANTON, fit('LUNCH SET', ANTON, 280, 96), CX, 330, BROWN, anchor='middle', track=0.02)
    b += text('RICE & CURRY  ·  SALAD  ·  DRINK', JK8, 12.5, CX, 368, TEAL, anchor='middle', track=0.1)
    b += f'<rect x="{CX-80}" y="390" width="160" height="34" rx="17" fill="{ORANGE}"/>'
    b += text('12PM – 3PM', ANTON, 22, CX, 415, CREAMW, anchor='middle', track=0.08)
    b += text('ONLY', JK8, 11, CX - 118, 512, BROWN, anchor='middle', track=0.3)
    b += text('MVR 75', ANTON, 64, CX + 34, 530, CHILI, anchor='middle', track=0.03)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#red)', defs)


# 13 ─ Celebration cakes: wavy band + cake
def cake(cx, base):
    s = f'<ellipse cx="{cx}" cy="{base+6}" rx="96" ry="10" fill="{BROWN}" opacity="0.15"/>'
    s += f'<rect x="{cx-100}" y="{base-2}" width="200" height="8" rx="4" fill="{TEAL}"/>'
    tiers = [(170, 44, CHILI), (126, 38, ORANGE), (84, 32, YELLOW)]
    y = base
    for w, h, c in tiers:
        y -= h
        s += f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="{h}" rx="6" fill="{c}"/>'
        d = f'M{cx-w/2} {y+8}'
        n = 7
        for i in range(n):
            x0 = cx - w / 2 + i * w / n
            d += f' Q {x0 + w/n/2:.1f} {y + 22:.1f} {x0 + w/n:.1f} {y+8}'
        d += f' L {cx+w/2} {y+6} Q {cx+w/2} {y} {cx+w/2-6} {y} L {cx-w/2+6} {y} Q {cx-w/2} {y} {cx-w/2} {y+6} Z'
        s += f'<path d="{d}" fill="{CREAMW}"/>'
    for dx in (-22, 0, 22):
        s += f'<rect x="{cx+dx-3}" y="{y-26}" width="6" height="26" rx="2" fill="{TEAL}"/>'
        s += flame(cx + dx, y - 34, 16, ORANGE)
    return s


def p13():
    defs = lin('bd', [(0, CHILI), (1, ORANGE)], x1=0, y1=0, x2=1, y2=0)
    b = wave(214, 10, 6, 'url(#bd)')
    b += confetti(13, 24, [YELLOW, CREAMW], [(SAFE + 30, SAFE + 4, 130, 150), (W - 130, SAFE + 4, W - SAFE - 30, 150)])
    b += logo_disc(92, 62, 98)
    b += text('Make it sweet', FR9I, 28, CX, 196, CREAMW, anchor='middle')
    b += stext('CELEBRATION', ANTON, 58, CX, 272, BROWN, YELLOW, d=2.2, anchor='middle', track=0.05)
    b += stext('CAKES', ANTON, 58, CX, 330, CHILI, YELLOW, d=2.2, anchor='middle', track=0.2)
    b += cake(CX, 494)
    b += confetti(131, 20, [CHILI, ORANGE, TEAL, YELLOW], [(SAFE + 4, 250, 90, 480), (W - 90, 250, W - SAFE - 4, 480)])
    b += stext('10% OFF PRE-ORDERS', ANTON, 32, CX, 538, TEALD, YELLOW, d=1.6, anchor='middle', track=0.05)
    b += text('Order 48 hours ahead  ·  Birthdays · Weddings · Office', JK7, 9.5, CX, 558, BROWN, anchor='middle', track=0.04)
    b += footer(BROWN, CHILI)
    return docv(b, CREAMW, defs)


# 14 ─ Free delivery: scooter + speed lines
def scooter(cx, cy, body=TEAL):
    s = ''
    for i, (y, l) in enumerate([(cy - 26, 70), (cy - 6, 96), (cy + 14, 60)]):
        s += f'<rect x="{cx-170}" y="{y}" width="{l}" height="6" rx="3" fill="{CREAMW}" opacity="0.8"/>'
    s += f'<circle cx="{cx-52}" cy="{cy+30}" r="22" fill="{BROWN}"/><circle cx="{cx-52}" cy="{cy+30}" r="9" fill="{CREAMW}"/>'
    s += f'<circle cx="{cx+58}" cy="{cy+30}" r="22" fill="{BROWN}"/><circle cx="{cx+58}" cy="{cy+30}" r="9" fill="{CREAMW}"/>'
    s += (f'<path d="M{cx-80} {cy+18} Q {cx-78} {cy-14} {cx-40} {cy-14} L {cx+10} {cy-14} L {cx+30} {cy+18} Z" fill="{body}"/>')
    s += f'<path d="M{cx+10} {cy+20} L {cx+40} {cy-46} L {cx+52} {cy-46} L {cx+28} {cy+20} Z" fill="{body}"/>'
    s += f'<path d="M{cx+30} {cy+20} Q {cx+58} {cy-6} {cx+86} {cy+22} Z" fill="{body}"/>'
    s += f'<rect x="{cx+34}" y="{cy-54}" width="30" height="7" rx="3.5" fill="{BROWN}"/>'
    s += f'<rect x="{cx-86}" y="{cy-62}" width="56" height="46" rx="5" fill="{CHILI}"/>'
    s += flame(cx - 58, cy - 39, 26, YELLOW)
    s += f'<rect x="{cx-38}" y="{cy-30}" width="40" height="10" rx="5" fill="{BROWN}"/>'
    return s


def p14():
    defs = rad('o', [(0, '#FF8A2A'), (0.6, ORANGE), (1, CHILI)], cy=0.45)
    b = stripes(YELLOW, 0.12)
    b += logo_disc(92, 62, 98)
    b += text('Order in tonight', FR9I, 28, CX, 196, CREAMW, anchor='middle')
    b += rule(208, CREAMW)
    b += stext('FREE', ANTON, 108, CX, 310, YELLOW, PLUM, d=5, anchor='middle', track=0.04)
    b += stext('DELIVERY', ANTON, 54, CX, 372, CREAMW, PLUM, d=3, anchor='middle', track=0.08)
    b += scooter(CX + 20, 452)
    b += f'<rect x="{CX-150}" y="512" width="300" height="32" rx="16" fill="{BROWN}"/>'
    b += text('ON ORDERS OVER MVR 300', JK8, 13, CX, 533, YELLOW, anchor='middle', track=0.12)
    b += text('bakeandgrill.mv/order', JK8, 10.5, CX, 560, CREAMW, anchor='middle', track=0.06)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#o)', defs)


# 15 ─ Sai time: teacup on a sun
def teacup(cx, cy):
    s = f'<ellipse cx="{cx}" cy="{cy+50}" rx="96" ry="14" fill="{CREAMW}"/>'
    s += f'<ellipse cx="{cx}" cy="{cy+46}" rx="60" ry="7" fill="{YELLOW}" opacity="0.6"/>'
    s += f'<path d="M{cx+54} {cy-10} q 34 0 30 26 q -4 22 -36 22" fill="none" stroke="{CREAMW}" stroke-width="9"/>'
    s += f'<path d="M{cx-66} {cy-30} L{cx+66} {cy-30} Q {cx+62} {cy+46} {cx} {cy+46} Q {cx-62} {cy+46} {cx-66} {cy-30} Z" fill="{CREAMW}"/>'
    s += f'<ellipse cx="{cx}" cy="{cy-30}" rx="66" ry="10" fill="{RUST}"/>'
    s += f'<path d="M{cx-60} {cy-6} L{cx+60} {cy-6} L{cx+57} {cy+6} L{cx-57} {cy+6} Z" fill="{CHILI}"/>'
    for dx in (-26, 0, 26):
        s += (f'<path d="M{cx+dx} {cy-46} c-8 -10 8 -16 0 -26 c-8 -10 8 -16 0 -26" fill="none" '
              f'stroke="{CREAMW}" stroke-width="4" stroke-linecap="round" opacity="0.7"/>')
    return s


def p15():
    defs = lin('bg', [(0, '#2A1A0C'), (1, BROWN)])
    b = f'<circle cx="{CX}" cy="404" r="94" fill="{ORANGE}"/>'
    b += logo(CX, 34, 104, dark_bg=True)
    b += text('Afternoon', FR9I, 28, CX, 196, YELLOW, anchor='middle')
    b += stext('SAI TIME', ANTON, 90, CX, 290, CREAMW, CHILI, d=4, anchor='middle', track=0.05)
    b += teacup(CX, 414)
    b += text('Kalhu sai + any 2 hedhikaa', FR7I, 17, CX, 524, YELLOW, anchor='middle')
    b += f'<rect x="{CX-130}" y="532" width="260" height="34" rx="17" fill="{TEAL}"/>'
    b += text('MVR 25', ANTON, 26, CX - 50, 559, CREAMW, anchor='middle', track=0.04)
    b += text('3PM – 6PM', JK8, 12, CX + 62, 554, YELLOW, anchor='middle', track=0.1)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#bg)', defs)


# 16 ─ BBQ night: checker + fire row
def p16():
    defs = lin('fl', FIRE) + lin('txt', [(0, YELLOW), (1, ORANGE)])
    b = checker(SAFE + 154, 16, BROWN, CHILI, 8)
    for i, x in enumerate(range(-20, int(W) + 40, 62)):
        b += flame(x, 586 - (i % 2) * 14, 150 + (i % 3) * 22, 'url(#fl)', 0.95, (-8, 6, -3)[i % 3])
    b += f'<rect x="0" y="{H-34}" width="{W}" height="34" fill="{BROWN}"/>'
    b += logo(CX, 30, 104, dark_bg=True)
    b += text('Every Thursday', FR9I, 28, CX, 214, YELLOW, anchor='middle')
    b += stext('BBQ', ANTON, 140, CX, 362, 'url(#txt)', CHILI, d=6, anchor='middle', track=0.04)
    b += stext('NIGHT', ANTON, 52, CX, 418, CREAMW, CHILI, d=2.5, anchor='middle', track=0.3)
    b += f'<rect x="{CX-150}" y="430" width="300" height="26" rx="13" fill="{BROWN}"/>'
    b += text('GRILLED FISH  ·  CHICKEN  ·  SKEWERS', JK8, 11, CX, 447.5, YELLOW, anchor='middle', track=0.1)
    b += f'<rect x="{CX-64}" y="466" width="128" height="32" rx="16" fill="{CREAMW}"/>'
    b += text('FROM 7PM', ANTON, 22, CX, 490, CHILI, anchor='middle', track=0.08)
    b += footer(CREAMW, YELLOW, y=H - SAFE - 4)
    return docv(b, BROWN, defs)


# 17 ─ Birthday: gift box + confetti
def gift(cx, cy, s=1.0):
    w, h = 130 * s, 92 * s
    g = f'<rect x="{cx-w/2+5}" y="{cy-h/2+5}" width="{w}" height="{h}" rx="6" fill="{TEALD}"/>'
    g += f'<rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" rx="6" fill="{ORANGE}"/>'
    g += f'<rect x="{cx-w/2-8}" y="{cy-h/2-24}" width="{w+16}" height="28" rx="6" fill="{CHILI}"/>'
    g += f'<rect x="{cx-11}" y="{cy-h/2-24}" width="22" height="{h+24}" fill="{YELLOW}"/>'
    g += f'<path d="M{cx} {cy-h/2-24} C {cx-50} {cy-h/2-70} {cx-64} {cy-h/2-20} {cx} {cy-h/2-24} Z" fill="{YELLOW}"/>'
    g += f'<path d="M{cx} {cy-h/2-24} C {cx+50} {cy-h/2-70} {cx+64} {cy-h/2-20} {cx} {cy-h/2-24} Z" fill="{YELLOW}"/>'
    return g


def p17():
    defs = lin('tl', [(0, '#0E8F88'), (1, TEALD)])
    b = confetti(17, 90, [YELLOW, ORANGE, CHILI, CREAMW],
                 [(SAFE + 30, SAFE + 4, W - SAFE - 30, 34), (SAFE + 4, 40, 110, 170), (W - 110, 40, W - SAFE - 4, 170),
                  (SAFE + 4, 360, 58, 500), (W - 58, 360, W - SAFE - 4, 500)], rmin=2.5, rmax=6)
    b += logo_disc(92, 62, 98)
    b += text("It's your birthday?", FR9I, 28, CX, 196, YELLOW, anchor='middle')
    b += rule(208, YELLOW)
    b += stext('DESSERT', ANTON, 92, CX, 304, YELLOW, CHILI, d=4, anchor='middle', track=0.05)
    b += stext("IT'S ON US", ANTON, 56, CX, 366, CREAMW, TEALD, d=2.5, anchor='middle', track=0.06)
    b += gift(CX, 480, 0.85)
    b += text('Dine in on your birthday and show your ID', JK8, 11, CX, 540, CREAMW, anchor='middle', track=0.03)
    b += text('One free dessert per table  ·  T&Cs apply', JK7, 9, CX, 558, YELLOW, anchor='middle', track=0.04)
    b += footer(CREAMW, YELLOW, note='')
    return docv(b, 'url(#tl)', defs)


# 18 ─ Kids meal: balloons on yellow
def balloon(x, y, r, c, rot=0):
    s = f'<path d="M{x} {y+r*1.15} q -6 30 6 60 q 10 26 -2 54" fill="none" stroke="{BROWN}" stroke-width="1.3" opacity="0.6"/>'
    s += f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*1.18}" fill="{c}" transform="rotate({rot} {x} {y})"/>'
    s += f'<path d="M{x-5} {y+r*1.15} L{x+5} {y+r*1.15} L{x} {y+r*1.15-7} Z" fill="{c}"/>'
    s += f'<ellipse cx="{x-r*0.35}" cy="{y-r*0.45}" rx="{r*0.18}" ry="{r*0.3}" fill="{CREAMW}" opacity="0.6" transform="rotate(-25 {x-r*0.35} {y-r*0.45})"/>'
    return s


def p18():
    defs = rad('y', [(0, '#FFE07A'), (0.7, YELLOW), (1, '#F9A11B')], cy=0.5)
    b = balloon(44, 296, 20, CHILI, -10) + balloon(64, 400, 16, TEAL, 8)
    b += balloon(W - 44, 282, 20, TEAL, 10) + balloon(W - 64, 392, 16, ORANGE, -6)
    b += logo_disc(92, 62, 98)
    b += text('Little appetites', FR9I, 28, CX, 196, CHILI, anchor='middle')
    b += rule(208, CHILI)
    b += stext('KIDS', ANTON, 104, CX, 318, TEAL, BROWN, d=4.5, anchor='middle', track=0.06)
    b += stext('MEAL', ANTON, 104, CX, 426, CHILI, BROWN, d=4.5, anchor='middle', track=0.06)
    b += f'<rect x="{CX-80}" y="444" width="160" height="42" rx="21" fill="{TEALD}"/>'
    b += text('MVR 49', ANTON, 30, CX, 476, YELLOW, anchor='middle', track=0.06)
    b += text('MINI BURGER  ·  FRIES  ·  JUICE', JK8, 13, CX, 512, BROWN, anchor='middle', track=0.12)
    b += text('For kids under 12  ·  Every day', FR7I, 13, CX, 538, CHILI, anchor='middle')
    b += footer(BROWN, CHILI)
    return docv(b, 'url(#y)', defs)


# 19 ─ Meal for two: wine + hearts of fire
def p19():
    defs = lin('w', [(0, PLUM), (1, '#2A0C16')]) + lin('fl', FIRE)
    b = f'<circle cx="{CX-52}" cy="440" r="68" fill="{CHILI}"/>'
    b += f'<circle cx="{CX+52}" cy="440" r="68" fill="{ORANGE}"/>'
    b += f'<circle cx="{CX}" cy="440" r="52" fill="{CREAMW}"/><circle cx="{CX}" cy="440" r="46" fill="none" stroke="{CHILI}" stroke-width="1" stroke-dasharray="2 3"/>'
    b += logo_disc(92, 62, 98, disc=BROWN)
    b += text('Date night, sorted', FR9I, 28, CX, 196, YELLOW, anchor='middle')
    b += rule(208, YELLOW)
    b += stext('MEAL FOR', ANTON, 72, CX - 36, 306, CREAMW, '#2A0C16', d=3.5, anchor='middle', track=0.03)
    b += stext('2', ANTON, 108, CX + 146, 318, YELLOW, CHILI, d=4.5, anchor='middle')
    b += text('2 MAINS  ·  2 DRINKS  ·  1 DESSERT', JK8, 12, CX, 346, CREAMW, anchor='middle', track=0.12)
    b += text('MVR', JK8, 11, CX, 422, CHILI, anchor='middle', track=0.3)
    b += text('199', ANTON, 42, CX, 462, BROWN, anchor='middle', track=0.03)
    b += text('Every evening from 6PM', FR7I, 15, CX, 544, YELLOW, anchor='middle')
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#w)', defs)


# 20 ─ Weekend sale: bold stripes
def p20():
    defs = lin('bg', [(0, ORANGE), (1, CHILI)], x1=0, y1=0, x2=1, y2=1)
    b = stripes(YELLOW, 0.22, gap=34, wdt=15, angle=-35)
    b += f'<polygon points="0,236 {W},190 {W},470 0,516" fill="{BROWN}"/>'
    b += f'<polygon points="0,226 {W},180 {W},190 0,236" fill="{YELLOW}"/>'
    b += f'<polygon points="0,516 {W},470 {W},480 0,526" fill="{YELLOW}"/>'
    b += logo_disc(92, 62, 98)
    b += text('Weekend Mega Sale', FR9I, 28, CX, 172, CREAMW, anchor='middle')
    b += text('UP TO', JK8, 16, CX, 268, YELLOW, anchor='middle', track=0.4)
    b += stext('40%', ANTON, 128, CX - 44, 420, YELLOW, CHILI, d=5, anchor='middle')
    b += text('OFF', ANTON, 46, CX + 150, 360, CREAMW, anchor='middle', track=0.06)
    b += text('SELECTED', JK8, 9, CX + 150, 384, YELLOW, anchor='middle', track=0.2)
    b += text('ITEMS', JK8, 9, CX + 150, 398, YELLOW, anchor='middle', track=0.2)
    b += text('SATURDAY & SUNDAY ONLY', JK8, 14, CX, 552, CREAMW, anchor='middle', track=0.16)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#bg)', defs)


P.update({
    '11-fresh-juice-2-for-60': p11, '12-lunch-set-mvr75': p12, '13-celebration-cakes': p13,
    '14-free-delivery': p14, '15-sai-time': p15, '16-bbq-night': p16, '17-birthday-dessert': p17,
    '18-kids-meal': p18, '19-meal-for-two': p19, '20-weekend-mega-sale': p20,
})
