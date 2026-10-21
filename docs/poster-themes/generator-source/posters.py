from lib import *

P = {}


def frame(color, inset=14, sw=0.8, gap=2.2):
    """Double hairline frame inside the safe area, broken at the corners for stand-offs."""
    a, b = BLEED + inset, BLEED + inset + gap
    out = ''
    for i, r in enumerate([a, b]):
        out += f'<rect x="{r}" y="{r}" width="{W-2*r}" height="{H-2*r}" fill="none" stroke="{color}" stroke-width="{sw if i==0 else sw*0.5}"/>'
    return out


def rule(y, color, half=60, dot=True):
    s = f'<line x1="{CX-half}" y1="{y}" x2="{CX-6}" y2="{y}" stroke="{color}" stroke-width="0.9"/>'
    s += f'<line x1="{CX+6}" y1="{y}" x2="{CX+half}" y2="{y}" stroke="{color}" stroke-width="0.9"/>'
    if dot:
        s += star(CX, y, 3.2, color)
    return s


# 1 ─ Breakfast 20% off (dark)
def p1():
    b = flame(W - 40, H - 150, 420, AMBER, 0.06, -12)
    b += logo(CX, 36, 118, dark_bg=True)
    b += text('Morning Special', FR9I, 30, CX, 200, AMBER, anchor='middle')
    b += rule(214, AMBER)
    sz = fit('20%', ANTON, 300, 200)
    b += text('20%', ANTON, sz, CX, 392, CREAM, anchor='middle')
    b += text('OFF', ANTON, 78, CX, 478, RUST, anchor='middle', track=0.06)
    b += text('ALL BREAKFAST', JK8, 17, CX, 518, CREAM, anchor='middle', track=0.22)
    b += text('MONDAY – THURSDAY  ·  7AM – 11AM', JK7, 10.5, CX, 542, AMBER, anchor='middle', track=0.12)
    b += footer(CREAM, AMBER)
    return doc(b, BROWN)


# 2 ─ Buy 1 get 1 coffee (cream)
def cup(cx, base, h, body, accent, steam=True):
    w = h * 0.78
    top = base - h
    s = f'<path d="M{cx-w/2} {top} L{cx+w/2} {top} L{cx+w/2*0.8} {base} L{cx-w/2*0.8} {base} Z" fill="{body}"/>'
    s += f'<rect x="{cx-w/2-4}" y="{top-8}" width="{w+8}" height="10" rx="3" fill="{body}"/>'
    s += f'<rect x="{cx-w/2+2}" y="{top+h*0.35}" width="{w-4}" height="{h*0.22}" fill="{accent}"/>'
    if steam:
        for dx in (-w * 0.22, 0, w * 0.22):
            x0 = cx + dx
            s += (f'<path d="M{x0} {top-16} c-7 -10 7 -16 0 -26 c-7 -10 7 -16 0 -26" fill="none" '
                  f'stroke="{body}" stroke-width="3.2" stroke-linecap="round" opacity="0.55"/>')
    return s


def p2():
    b = frame(RUST)
    b += logo(CX, 42, 96, dark_bg=False)
    b += text('Coffee Hour', FR9I, 28, CX, 182, RUST, anchor='middle')
    b += rule(196, RUST)
    b += text('BUY 1', ANTON, 104, CX - 34, 316, BROWN, anchor='middle', track=0.03)
    b += text('GET 1', ANTON, 104, CX - 34, 424, RUST, anchor='middle', track=0.03)
    b += burst(W - 78, 330, 42, 18, 6, AMBER, rot=8)
    b += text('FREE', ANTON, 25, W - 78, 339, BROWN, anchor='middle', track=0.04)
    b += cup(CX - 54, 468, 22, BROWN, RUST, steam=False) + cup(CX - 14, 468, 22, RUST, BROWN, steam=False)
    b += text('ON ALL HOT & ICED COFFEES', JK8, 13.5, CX, 500, BROWN, anchor='middle', track=0.16)
    b += text('EVERY DAY  ·  3PM – 5PM', JK7, 11, CX, 522, RUST, anchor='middle', track=0.14)
    b += footer(BROWN, RUST, y=H - SAFE - 16)
    return doc(b, CREAM)


# 3 ─ Grill combo (rust)
def p3():
    b = flame(-30, 120, 360, BROWN, 0.12, 14)
    b += f'<circle cx="{CX}" cy="92" r="66" fill="{BROWN}"/>'
    b += logo(CX, 38, 104, dark_bg=True)
    b += text('The Grill Combo', FR9I, 30, CX, 196, CREAM2, anchor='middle')
    b += rule(208, CREAM2)
    items = ['BURGER', 'FRIES', 'DRINK']
    y = 264
    for i, it in enumerate(items):
        b += text(it, ANTON, 44, CX, y + i * 60, CREAM, anchor='middle', track=0.06)
        if i < 2:
            b += star(CX, y + i * 60 + 11, 3.4, CREAM2)
    # price tag
    b += f'<rect x="{CX-120}" y="408" width="240" height="118" rx="6" fill="{BROWN}"/>'
    b += text('ONLY', JK8, 11, CX, 432, AMBER, anchor='middle', track=0.3)
    b += text('MVR', ANTON, 30, CX - 70, 505, AMBER, anchor='middle')
    b += text('99', ANTON, 92, CX + 26, 512, CREAM, anchor='middle')
    b += text('Dine in · Takeaway · Delivery', JK7, 10.5, CX, 548, CREAM, anchor='middle', track=0.06)
    b += footer(CREAM, CREAM2)
    return doc(b, RUST)


def logo_disc(cy, r, h, disc=BROWN, top=None):
    return f'<circle cx="{CX}" cy="{cy}" r="{r}" fill="{disc}"/>' + logo(CX, top if top is not None else cy - h * 0.53, h, dark_bg=True)


# 4 ─ Happy hour short eats (amber)
def p4():
    b = ''
    for i, (x, y, r) in enumerate([(40, 250, 26), (60, 470, 18), (W - 70, 120, 16)]):
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{BROWN}" stroke-width="1" opacity="0.25"/>'
    b += logo_disc(92, 66, 104)
    b += text('Hedhikaa Happy Hour', FR9I, 27, CX, 196, BROWN, anchor='middle')
    b += rule(208, BROWN)
    b += text('30%', ANTON, 124, CX - 44, 352, CREAM, anchor='middle')
    b += text('OFF', ANTON, 52, CX + 142, 300, BROWN, anchor='middle')
    b += text('SHORT', ANTON, 30, CX + 142, 330, BROWN, anchor='middle', track=0.06)
    b += text('EATS', ANTON, 30, CX + 142, 358, BROWN, anchor='middle', track=0.06)
    # time pill
    b += f'<rect x="{CX-112}" y="384" width="224" height="58" rx="29" fill="{BROWN}"/>'
    b += text('4PM – 6PM', ANTON, 40, CX, 428, CREAM, anchor='middle', track=0.06)
    b += text('EVERY DAY', JK8, 13, CX, 470, BROWN, anchor='middle', track=0.3)
    b += text('Bajiya  ·  Gulha  ·  Kavaabu  ·  Masroshi', FR7I, 15, CX, 500, BROWN, anchor='middle')
    b += text('Fresh from our kitchen, hot every hour', JK7, 9.5, CX, 528, BROWN, anchor='middle', track=0.04)
    b += footer(BROWN, BROWN)
    return doc(b, AMBER)


# 5 ─ Weekend family feast (dark)
def p5():
    b = flame(CX, 330, 520, RUST, 0.10)
    b += logo(CX, 34, 104, dark_bg=True)
    b += text('This Weekend', FR9I, 28, CX, 190, AMBER, anchor='middle')
    b += rule(202, AMBER)
    b += text('FAMILY', ANTON, 96, CX, 300, CREAM, anchor='middle', track=0.04)
    b += text('FEAST', ANTON, 96, CX, 392, CREAM, anchor='middle', track=0.08)
    b += text('MIXED GRILL PLATTER  ·  FEEDS 4', JK8, 12.5, CX, 420, AMBER, anchor='middle', track=0.14)
    # save badge
    b += burst(CX, 482, 52, 22, 6, RUST)
    b += text('SAVE', JK8, 10, CX, 466, CREAM, anchor='middle', track=0.3)
    b += text('MVR 150', ANTON, 26, CX, 494, CREAM, anchor='middle', track=0.02)
    b += text('FRIDAY & SATURDAY  ·  DINNER', JK7, 11, CX, 556, CREAM, anchor='middle', track=0.14)
    b += footer(CREAM, AMBER)
    return doc(b, BROWN)


# 6 ─ Order online, QR (cream)
def p6():
    b = f'<rect x="0" y="0" width="{W}" height="236" fill="{BROWN}"/>'
    b += logo(CX, 34, 112, dark_bg=True)
    b += text('Skip the queue', FR9I, 28, CX, 214, AMBER, anchor='middle')
    b += text('ORDER ONLINE', ANTON, 64, CX, 316, BROWN, anchor='middle', track=0.04)
    b += text('15% OFF', ANTON, 92, CX, 408, RUST, anchor='middle', track=0.03)
    b += text('YOUR FIRST ORDER', JK8, 14, CX, 434, BROWN, anchor='middle', track=0.22)
    b += qr('https://bakeandgrill.mv/order/', CX - 48, 452, 96, BROWN, CREAM)
    b += f'<rect x="{CX-54}" y="446" width="108" height="108" rx="6" fill="none" stroke="{RUST}" stroke-width="1.4"/>'
    b += text('Scan to order', FR7I, 11, CX - 66, 494, RUST, anchor='end')
    b += text('Pickup or delivery', FR7I, 11, CX + 66, 494, RUST)
    b += text('bakeandgrill.mv/order', JK7, 9, CX + 66, 510, BROWN)
    b += footer(BROWN, RUST)
    return doc(b, CREAM)


# 7 ─ Student deal (rust)
def p7():
    b = flame(W + 10, 420, 360, BROWN, 0.12, -16)
    b += logo_disc(92, 66, 104)
    b += text('Study Break', FR9I, 30, CX, 196, CREAM2, anchor='middle')
    b += rule(208, CREAM2)
    b += text('STUDENTS', ANTON, 74, CX, 290, CREAM, anchor='middle', track=0.06)
    b += text('GET', JK8, 16, CX - 130, 352, CREAM2, anchor='middle', track=0.2)
    b += text('10%', ANTON, 120, CX + 10, 400, BROWN, anchor='middle')
    b += text('OFF', JK8, 16, CX + 152, 352, CREAM2, anchor='middle', track=0.2)
    # ID card
    cx0, cy0 = CX - 70, 428
    b += f'<rect x="{cx0}" y="{cy0}" width="140" height="84" rx="8" fill="{CREAM}"/>'
    b += f'<rect x="{cx0}" y="{cy0}" width="140" height="18" rx="8" fill="{BROWN}"/><rect x="{cx0}" y="{cy0+10}" width="140" height="8" fill="{BROWN}"/>'
    b += f'<circle cx="{cx0+30}" cy="{cy0+50}" r="16" fill="{AMBER}"/>'
    for i, ww in enumerate([70, 56, 40]):
        b += f'<rect x="{cx0+58}" y="{cy0+36+i*12}" width="{ww}" height="5" rx="2.5" fill="{BROWN}" opacity="{0.8 - i*0.2}"/>'
    b += text('STUDENT ID', JK8, 7, cx0 + 70, cy0 + 12.5, CREAM, anchor='middle', track=0.25)
    b += text('Show a valid student ID at the counter', JK7, 11, CX, 540, CREAM, anchor='middle', track=0.03)
    b += footer(CREAM, CREAM2)
    return doc(b, RUST)


# 8 ─ Loyalty, 10th coffee (cream)
def p8():
    b = frame(BROWN)
    b += logo(CX, 42, 96, dark_bg=False)
    b += text('Our Loyalty Card', FR9I, 28, CX, 182, RUST, anchor='middle')
    b += rule(196, RUST)
    b += text('YOUR 10TH', ANTON, 76, CX, 286, BROWN, anchor='middle', track=0.04)
    b += text('COFFEE IS ON US', ANTON, 46, CX, 340, RUST, anchor='middle', track=0.05)
    # stamp grid 5 x 2
    gx, gy, step, r = CX - 2 * 52, 384, 52, 19
    for i in range(10):
        x = gx + (i % 5) * step
        y = gy + (i // 5) * step
        if i < 9:
            b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{BROWN}" stroke-width="1.6"/>'
            b += text(str(i + 1), JK8, 12, x, y + 4.3, BROWN, anchor='middle')
        else:
            b += f'<circle cx="{x}" cy="{y}" r="{r+2}" fill="{RUST}"/>'
            b += flame(x, y - 1, 26, CREAM)
    b += text('Collect a stamp with every coffee', JK8, 12, CX, 476, BROWN, anchor='middle', track=0.04)
    b += text('Earn points online too  ·  bakeandgrill.mv', JK7, 10, CX, 496, RUST, anchor='middle', track=0.04)
    b += footer(BROWN, RUST, y=H - SAFE - 16)
    return doc(b, CREAM)


# 9 ─ Catering & events (dark)
def p9():
    b = f'<rect x="0" y="{H-222}" width="{W}" height="222" fill="{RUST}"/>'
    b += flame(70, 240, 200, AMBER, 0.07, -10) + flame(W - 60, 300, 160, AMBER, 0.07, 12)
    b += logo(CX, 34, 104, dark_bg=True)
    b += text('Planning an event?', FR9I, 30, CX, 196, AMBER, anchor='middle')
    b += rule(210, AMBER)
    b += text('WE CATER', ANTON, 90, CX, 300, CREAM, anchor='middle', track=0.05)
    b += text('BIRTHDAYS  ·  OFFICE  ·  WEDDINGS  ·  FAMILY', JK8, 10.5, CX, 328, AMBER, anchor='middle', track=0.12)
    b += text('10% OFF', ANTON, 72, CX, 452, CREAM, anchor='middle', track=0.04)
    b += text('CATERING ORDERS OVER MVR 5,000', JK8, 12, CX, 478, BROWN, anchor='middle', track=0.12)
    b += text('Call or WhatsApp', FR7I, 13, CX, 510, CREAM2, anchor='middle')
    b += text('+960 912 0011', ANTON, 32, CX, 546, CREAM, anchor='middle', track=0.06)
    b += text('BAKEANDGRILL.MV', JK8, 9, CORNER + 2, H - SAFE - 6, CREAM, track=0.08)
    b += text('Book 3 days ahead  ·  T&Cs apply', JK5, 6.5, W - CORNER - 2, H - SAFE - 6, CREAM2, anchor='end')
    return doc(b, BROWN)


# 10 ─ Evening bakery (cream w/ rust band)
def p10():
    b = f'<rect x="0" y="216" width="{W}" height="230" fill="{RUST}"/>'
    b += logo(CX, 34, 112, dark_bg=False)
    b += text('After 8 PM', FR9I, 28, CX, 194, RUST, anchor='middle')
    b += text('HALF PRICE', ANTON, 84, CX, 322, CREAM, anchor='middle', track=0.04)
    b += text('BAKERY', ANTON, 84, CX, 414, BROWN, anchor='middle', track=0.12)
    b += star(CX - 150, 384, 7, CREAM2) + star(CX + 150, 384, 7, CREAM2)
    b += text('50% OFF BREADS, BUNS & PASTRIES', JK8, 13, CX, 482, BROWN, anchor='middle', track=0.12)
    b += text('Baked today, priced to go. While stocks last.', FR5I, 13, CX, 510, RUST, anchor='middle')
    b += footer(BROWN, RUST)
    return doc(b, CREAM)


P.update({
    '01-breakfast-20-off': p1, '02-coffee-buy1get1': p2, '03-grill-combo-mvr99': p3,
    '04-short-eats-happy-hour': p4, '05-weekend-family-feast': p5, '06-order-online-15-off': p6,
    '07-student-10-off': p7, '08-loyalty-10th-coffee': p8, '09-catering-10-off': p9,
    '10-evening-bakery-50-off': p10,
})
