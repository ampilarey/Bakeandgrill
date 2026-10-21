from lib import *
from posters import frame, rule, cup, logo_disc

P = {}
FIRE = [(0, YELLOW), (0.5, ORANGE), (1, CHILI)]
MARGINS = [(SAFE + 4, 230, 56, 560), (W - 56, 230, W - SAFE - 4, 560)]


# 1 ─ Breakfast 20% off: sunrise
def p1():
    defs = rad('sun', [(0, YELLOW), (0.45, ORANGE), (1, CHILI)], cx=0.5, cy=0.42, r=0.8)
    b = rays(CX, 330, 28, YELLOW, 0.22)
    b += f'<circle cx="{CX}" cy="330" r="150" fill="{YELLOW}" opacity="0.35"/>'
    b += logo_disc(92, 66, 104)
    b += stext('Morning Special', FR9I, 30, CX, 200, CREAMW, PLUM, d=1.4, anchor='middle')
    b += rule(214, CREAMW)
    sz = fit('20%', ANTON, 300, 200)
    b += stext('20%', ANTON, sz, CX, 392, CREAMW, BROWN, d=5, anchor='middle')
    b += stext('OFF', ANTON, 78, CX, 478, BROWN, YELLOW, d=2.5, anchor='middle', track=0.06)
    b += f'<rect x="{CX-150}" y="496" width="300" height="32" rx="16" fill="{BROWN}"/>'
    b += text('ALL BREAKFAST', JK8, 16, CX, 518, YELLOW, anchor='middle', track=0.22)
    b += text('MONDAY – THURSDAY  ·  7AM – 11AM', JK8, 10.5, CX, 548, BROWN, anchor='middle', track=0.12)
    b += footer(BROWN, PLUM)
    return docv(b, 'url(#sun)', defs)


# 2 ─ Coffee BOGO: lagoon teal + fire
def p2():
    defs = lin('tl', [(0, TEAL), (1, TEALD)])
    b = confetti(2, 40, [YELLOW, ORANGE, CREAMW], MARGINS)
    b += frame(YELLOW)
    b += logo_disc(92, 62, 98)
    b += text('Coffee Hour', FR9I, 30, CX, 196, YELLOW, anchor='middle')
    b += rule(208, YELLOW)
    b += stext('BUY 1', ANTON, 104, CX - 34, 316, CREAMW, TEALD, d=4, anchor='middle', track=0.03)
    b += stext('GET 1', ANTON, 104, CX - 34, 424, YELLOW, CHILI, d=4, anchor='middle', track=0.03)
    b += burst(W - 78, 330, 44, 18, 6, ORANGE, rot=8)
    b += burst(W - 78, 330, 36, 18, 4, CHILI, rot=18)
    b += text('FREE', ANTON, 25, W - 78, 339, CREAMW, anchor='middle', track=0.04)
    b += cup(CX - 54, 468, 22, CREAMW, ORANGE, steam=False) + cup(CX - 14, 468, 22, YELLOW, CHILI, steam=False)
    b += text('ON ALL HOT & ICED COFFEES', JK8, 13.5, CX, 500, CREAMW, anchor='middle', track=0.16)
    b += text('EVERY DAY  ·  3PM – 5PM', JK8, 11, CX, 522, YELLOW, anchor='middle', track=0.14)
    b += footer(CREAMW, YELLOW, y=H - SAFE - 16)
    return docv(b, 'url(#tl)', defs)


# 3 ─ Grill combo: chili heat
def p3():
    defs = lin('hot', [(0, ORANGE), (0.55, CHILI), (1, PLUM)]) + lin('fl', FIRE[::-1])
    b = flame(-20, 470, 300, 'url(#fl)', 0.55, 12) + flame(W + 10, 500, 260, 'url(#fl)', 0.45, -14)
    b += logo_disc(92, 66, 104)
    b += stext('The Grill Combo', FR9I, 30, CX, 196, YELLOW, PLUM, d=1.4, anchor='middle')
    b += rule(208, YELLOW)
    y = 264
    for i, it in enumerate(['BURGER', 'FRIES', 'DRINK']):
        b += stext(it, ANTON, 44, CX, y + i * 60, CREAMW, PLUM, d=2, anchor='middle', track=0.06)
        if i < 2:
            b += star(CX, y + i * 60 + 11, 3.4, YELLOW)
    b += f'<rect x="{CX-116}" y="412" width="240" height="118" rx="8" fill="{PLUM}"/>'
    b += f'<rect x="{CX-120}" y="408" width="240" height="118" rx="8" fill="{YELLOW}"/>'
    b += text('ONLY', JK8, 11, CX, 432, CHILI, anchor='middle', track=0.3)
    b += text('MVR', ANTON, 30, CX - 70, 505, CHILI, anchor='middle')
    b += text('99', ANTON, 92, CX + 26, 512, BROWN, anchor='middle')
    b += text('Dine in · Takeaway · Delivery', JK8, 10.5, CX, 552, CREAMW, anchor='middle', track=0.06)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#hot)', defs)


# 4 ─ Short eats happy hour: sunshine
def p4():
    defs = rad('y', [(0, '#FFE07A'), (0.6, YELLOW), (1, '#F9A11B')], cy=0.45)
    b = rays(CX - 44, 310, 24, ORANGE, 0.16)
    b += confetti(4, 26, [CHILI, ORANGE, TEAL], MARGINS)
    b += logo_disc(92, 66, 104)
    b += text('Hedhikaa Happy Hour', FR9I, 27, CX, 196, CHILI, anchor='middle')
    b += rule(208, CHILI)
    b += stext('30%', ANTON, 124, CX - 44, 352, CHILI, BROWN, d=4, anchor='middle')
    b += text('OFF', ANTON, 52, CX + 142, 300, BROWN, anchor='middle')
    b += text('SHORT', ANTON, 30, CX + 142, 330, TEALD, anchor='middle', track=0.06)
    b += text('EATS', ANTON, 30, CX + 142, 358, TEALD, anchor='middle', track=0.06)
    b += f'<rect x="{CX-108}" y="388" width="224" height="58" rx="29" fill="{BROWN}"/>'
    b += f'<rect x="{CX-112}" y="384" width="224" height="58" rx="29" fill="{TEAL}"/>'
    b += text('4PM – 6PM', ANTON, 40, CX, 428, YELLOW, anchor='middle', track=0.06)
    b += text('EVERY DAY', JK8, 13, CX, 470, BROWN, anchor='middle', track=0.3)
    b += text('Bajiya  ·  Gulha  ·  Kavaabu  ·  Masroshi', FR7I, 15, CX, 500, CHILI, anchor='middle')
    b += text('Fresh from our kitchen, hot every hour', JK7, 9.5, CX, 528, BROWN, anchor='middle', track=0.04)
    b += footer(BROWN, CHILI)
    return docv(b, 'url(#y)', defs)


# 5 ─ Family feast: dark with a blazing flame
def p5():
    defs = lin('fl', FIRE) + rad('glow', [(0, '#3A1D0A'), (1, BROWN)], cy=0.55)
    b = flame(CX, 340, 540, 'url(#fl)', 0.85)
    b += logo_disc(92, 66, 104)
    b += stext('This Weekend', FR9I, 28, CX, 196, CREAMW, BROWN, d=1.4, anchor='middle')
    b += rule(208, YELLOW)
    b += stext('FAMILY', ANTON, 96, CX, 304, CREAMW, BROWN, d=4, anchor='middle', track=0.04)
    b += stext('FEAST', ANTON, 96, CX, 396, CREAMW, BROWN, d=4, anchor='middle', track=0.08)
    b += f'<rect x="{CX-140}" y="406" width="280" height="22" rx="11" fill="{BROWN}"/>'
    b += text('MIXED GRILL PLATTER  ·  FEEDS 4', JK8, 11.5, CX, 421.5, YELLOW, anchor='middle', track=0.14)
    b += burst(CX, 484, 54, 22, 6, TEAL)
    b += burst(CX, 484, 46, 22, 4, TEALD, rot=8)
    b += text('SAVE', JK8, 10, CX, 468, YELLOW, anchor='middle', track=0.3)
    b += text('MVR 150', ANTON, 26, CX, 496, CREAMW, anchor='middle', track=0.02)
    b += f'<rect x="{CX-128}" y="542" width="256" height="24" rx="12" fill="{BROWN}"/>'
    b += text('FRIDAY & SATURDAY  ·  DINNER', JK8, 11, CX, 558, YELLOW, anchor='middle', track=0.14)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#glow)', defs)


# 6 ─ Order online: fire header, teal accents
def p6():
    defs = lin('hd', [(0, CHILI), (0.6, ORANGE), (1, YELLOW)], x1=0, y1=0, x2=1, y2=1)
    b = f'<rect x="0" y="0" width="{W}" height="236" fill="url(#hd)"/>'
    b += rays(CX, 92, 24, YELLOW, 0.18).replace('<path', '<path clip-path="url(#hdclip)"')
    b += logo_disc(92, 62, 98)
    b += stext('Skip the queue', FR9I, 28, CX, 214, CREAMW, PLUM, d=1.4, anchor='middle')
    b += f'<path d="M0 236 Q {CX} 262 {W} 236 Z" fill="{YELLOW}"/>'
    b += text('ORDER ONLINE', ANTON, 64, CX, 320, TEALD, anchor='middle', track=0.04)
    b += stext('15% OFF', ANTON, 92, CX, 410, ORANGE, CHILI, d=3.5, anchor='middle', track=0.03)
    b += text('YOUR FIRST ORDER', JK8, 14, CX, 436, BROWN, anchor='middle', track=0.22)
    b += f'<rect x="{CX-56}" y="446" width="112" height="112" rx="8" fill="{TEAL}"/>'
    b += qr('https://bakeandgrill.mv/order/', CX - 48, 454, 96, BROWN, CREAMW, quiet=3)
    b += text('Scan to order', FR7I, 11, CX - 68, 498, TEAL, anchor='end')
    b += text('Pickup or delivery', FR7I, 11, CX + 68, 498, TEAL)
    b += text('bakeandgrill.mv/order', JK7, 9, CX + 68, 514, BROWN)
    b += footer(BROWN, CHILI)
    clip = f'<clipPath id="hdclip"><rect x="0" y="0" width="{W}" height="236"/></clipPath>'
    return docv(b, CREAMW, defs + clip)


# 7 ─ Students: teal + yellow
def p7():
    defs = lin('tl', [(0, '#0E8F88'), (1, TEALD)])
    b = rays(CX + 10, 360, 22, '#13A39A', 0.35)
    b += confetti(7, 36, [YELLOW, ORANGE, CREAMW], MARGINS)
    b += logo_disc(92, 66, 104)
    b += text('Study Break', FR9I, 30, CX, 196, YELLOW, anchor='middle')
    b += rule(208, YELLOW)
    b += stext('STUDENTS', ANTON, 74, CX, 290, CREAMW, TEALD, d=3, anchor='middle', track=0.06)
    b += text('GET', JK8, 16, CX - 130, 352, YELLOW, anchor='middle', track=0.2)
    b += stext('10%', ANTON, 120, CX + 10, 400, YELLOW, CHILI, d=4.5, anchor='middle')
    b += text('OFF', JK8, 16, CX + 152, 352, YELLOW, anchor='middle', track=0.2)
    cx0, cy0 = CX - 70, 428
    b += f'<rect x="{cx0+4}" y="{cy0+4}" width="140" height="84" rx="8" fill="{TEALD}"/>'
    b += f'<rect x="{cx0}" y="{cy0}" width="140" height="84" rx="8" fill="{CREAMW}"/>'
    b += f'<rect x="{cx0}" y="{cy0}" width="140" height="18" rx="8" fill="{ORANGE}"/><rect x="{cx0}" y="{cy0+10}" width="140" height="8" fill="{ORANGE}"/>'
    b += f'<circle cx="{cx0+30}" cy="{cy0+50}" r="16" fill="{YELLOW}"/>'
    for i, ww in enumerate([70, 56, 40]):
        b += f'<rect x="{cx0+58}" y="{cy0+36+i*12}" width="{ww}" height="5" rx="2.5" fill="{TEAL}" opacity="{1 - i*0.25}"/>'
    b += text('STUDENT ID', JK8, 7, cx0 + 70, cy0 + 12.5, CREAMW, anchor='middle', track=0.25)
    b += text('Show a valid student ID at the counter', JK8, 11, CX, 542, CREAMW, anchor='middle', track=0.03)
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#tl)', defs)


# 8 ─ Loyalty: cream with a rainbow of brand stamps
def p8():
    defs = lin('bd', [(0, ORANGE), (1, CHILI)], x1=0, y1=0, x2=1, y2=0)
    b = f'<rect x="0" y="0" width="{W}" height="220" fill="url(#bd)"/>'
    b += f'<path d="M0 220 Q {CX} 246 {W} 220 Z" fill="{CHILI}" opacity="0.0"/>'
    b += confetti(8, 22, [YELLOW, CREAMW], [(SAFE + 30, SAFE + 6, 120, 165), (W - 120, SAFE + 6, W - SAFE - 30, 165)])
    b += logo_disc(92, 62, 98)
    b += text('Our Loyalty Card', FR9I, 28, CX, 200, CREAMW, anchor='middle')
    b += stext('YOUR 10TH', ANTON, 76, CX, 300, TEALD, YELLOW, d=2.5, anchor='middle', track=0.04)
    b += stext('COFFEE IS ON US', ANTON, 46, CX, 354, CHILI, YELLOW, d=2, anchor='middle', track=0.05)
    cols = [YELLOW, ORANGE, CHILI, TEAL, YELLOW, ORANGE, CHILI, TEAL, YELLOW]
    gx, gy, step, r = CX - 2 * 52, 396, 52, 19
    for i in range(10):
        x = gx + (i % 5) * step
        y = gy + (i // 5) * step
        if i < 9:
            c = cols[i]
            b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>'
            b += text(str(i + 1), JK8, 12, x, y + 4.3, BROWN if c == YELLOW else CREAMW, anchor='middle')
        else:
            b += burst(x, y, r + 7, 14, 4, CHILI)
            b += flame(x, y - 1, 24, YELLOW)
    b += text('Collect a stamp with every coffee', JK8, 12, CX, 486, BROWN, anchor='middle', track=0.04)
    b += text('Earn points online too  ·  bakeandgrill.mv', JK8, 10, CX, 506, TEAL, anchor='middle', track=0.04)
    b += footer(BROWN, CHILI)
    return docv(b, CREAMW, defs)


# 9 ─ Catering: party confetti on deep plum-brown, fire band
def p9():
    defs = lin('dk', [(0, BROWN), (1, PLUM)]) + lin('band', [(0, ORANGE), (1, CHILI)], x1=0, y1=0, x2=1, y2=0)
    b = confetti(9, 70, [YELLOW, ORANGE, TEAL, CREAMW, CHILI],
                 [(SAFE + 30, SAFE + 4, W - SAFE - 30, 30), (SAFE + 4, 40, 90, 160), (W - 90, 40, W - SAFE - 4, 160), (SAFE + 4, 340, 60, 370), (W - 60, 340, W - SAFE - 4, 370)])
    b += f'<rect x="0" y="{H-222}" width="{W}" height="222" fill="url(#band)"/>'
    b += f'<path d="M0 {H-222} Q {CX} {H-250} {W} {H-222} Z" fill="{ORANGE}"/>'
    b += logo_disc(92, 66, 104, disc=PLUM)
    b += text('Planning an event?', FR9I, 30, CX, 196, YELLOW, anchor='middle')
    b += rule(210, YELLOW)
    b += stext('WE CATER', ANTON, 90, CX, 300, CREAMW, CHILI, d=3.5, anchor='middle', track=0.05)
    b += text('BIRTHDAYS  ·  OFFICE  ·  WEDDINGS  ·  FAMILY', JK8, 10.5, CX, 328, YELLOW, anchor='middle', track=0.12)
    b += stext('10% OFF', ANTON, 72, CX, 452, YELLOW, PLUM, d=3, anchor='middle', track=0.04)
    b += text('CATERING ORDERS OVER MVR 5,000', JK8, 12, CX, 478, CREAMW, anchor='middle', track=0.12)
    b += text('Call or WhatsApp', FR7I, 13, CX, 510, YELLOW, anchor='middle')
    b += stext('+960 912 0011', ANTON, 32, CX, 546, CREAMW, PLUM, d=1.5, anchor='middle', track=0.06)
    b += text('BAKEANDGRILL.MV', JK8, 9, CORNER + 2, H - SAFE - 6, CREAMW, track=0.08)
    b += text('Book 3 days ahead  ·  T&Cs apply', JK5, 6.5, W - CORNER - 2, H - SAFE - 6, CREAMW, anchor='end')
    return docv(b, 'url(#dk)', defs)


# 10 ─ Evening bakery: dusk gradient
def p10():
    defs = lin('dusk', [(0, YELLOW), (0.35, ORANGE), (0.7, CHILI), (1, PLUM)])
    b = f'<circle cx="{CX}" cy="250" r="190" fill="{YELLOW}" opacity="0.28"/>'
    b += f'<circle cx="{CX}" cy="250" r="120" fill="#FFE07A" opacity="0.35"/>'
    b += logo_disc(92, 66, 104)
    b += stext('After 8 PM', FR9I, 30, CX, 196, BROWN, YELLOW, d=1.2, anchor='middle')
    b += stext('HALF PRICE', ANTON, 84, CX, 322, CREAMW, CHILI, d=4, anchor='middle', track=0.04)
    b += stext('BAKERY', ANTON, 84, CX, 414, YELLOW, PLUM, d=4, anchor='middle', track=0.12)
    b += star(CX - 150, 384, 7, YELLOW) + star(CX + 150, 384, 7, YELLOW)
    b += f'<rect x="{CX-170}" y="458" width="340" height="34" rx="17" fill="{PLUM}"/>'
    b += text('50% OFF BREADS, BUNS & PASTRIES', JK8, 12.5, CX, 480, YELLOW, anchor='middle', track=0.12)
    b += text('Baked today, priced to go. While stocks last.', FR5I, 13, CX, 516, CREAMW, anchor='middle')
    b += footer(CREAMW, YELLOW)
    return docv(b, 'url(#dusk)', defs)


P.update({
    '01-breakfast-20-off': p1, '02-coffee-buy1get1': p2, '03-grill-combo-mvr99': p3,
    '04-short-eats-happy-hour': p4, '05-weekend-family-feast': p5, '06-order-online-15-off': p6,
    '07-student-10-off': p7, '08-loyalty-10th-coffee': p8, '09-catering-10-off': p9,
    '10-evening-bakery-50-off': p10,
})
