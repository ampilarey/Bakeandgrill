"""The TV templates (2026-10-22): designs for the shop's screens, in the print
catalogue's 13 categories, each drawn for a landscape television and a portrait
screen by tv_archetypes.py. Numbered TV-001 upward, keys tv001-…"""
from catalog import CATS, CAT, STYLE_LABEL
from kit5 import P_
from tv_archetypes import ARCH

B = 'bajiya-photo'
BS = 'bajiya-square'
BC = 'bajiya-cutout'
I = lambda n: 'illus:' + n

D = [
 # ── 01 Discounts & Sales ──
 ('disc', 'weekend-sale-tiles', 'big_grid', 'berry', dict(eyebrow='Big weekend sale', words=['UP TO', '50%', 'OFF', 'THIS', 'WEEKEND', 'ONLY'],
   line='SELECTED ITEMS  ·  WHILE STOCKS LAST')),
 ('disc', 'flash-sale-pastries', 'photo_band', 'chili', dict(photo=I('croissant'), eyebrow='Flash sale', headline='30% OFF PASTRIES',
   sub='TODAY ONLY', price_top='TODAY', price='30%', line='Croissants · Danishes · Puffs')),
 ('disc', 'today-only-clock', 'countdown', 'cyan', dict(eyebrow='Hurry, ends at 6PM', headline='TODAY ONLY', h=6, m=0,
   time='20% OFF EVERYTHING', sub='DINE IN · TAKEAWAY · DELIVERY', line='One day. All the menu.')),

 # ── 02 Combos & Price Deals ──
 ('combo', 'burger-combo-tag', 'price_tag', 'sunset', dict(eyebrow='Burger + fries + drink', headline='BURGER COMBO', photo=I('burger'),
   tag_top='ONLY', price='MVR 99', tag_bottom='DINE IN  ·  TAKEAWAY', line='Every day, all day', deco='rays')),
 ('combo', 'value-meals-menu', 'menu_trio', 'night', dict(eyebrow='Value meals', headline='MEAL DEALS', items=[
   (I('burger'), 'BURGER MEAL', 'Burger, fries & drink', '89'), (I('sandwich'), 'CLUB SANDWICH', 'With fries & juice', '75'),
   (I('skewer'), 'GRILL SKEWERS', 'Two skewers & rice', '95')], line='Ask for today\'s drink of the day')),
 ('combo', 'any-3-short-eats', 'big_grid', 'sunshine', dict(eyebrow='Mix & match short eats', words=['ANY', '3', 'FOR', 'MVR', '30', '!'],
   tiles=['#D92B1C', '#0B7A75', '#1C1408', '#F7670B', '#E5007D', '#00A3E0'], line='BAJIYA · GULHA · KAVAABU · MASROSHI')),

 # ── 03 Buy 1 Get 1 & Freebies ──
 ('free', 'donuts-buy1get1', 'photo_side', 'berry', dict(eyebrow='Sweet deal', headline='BUY 1 GET 1 FREE', photo=I('donuts'),
   badge_top='ALL', badge='DONUTS', pill='EVERY WEDNESDAY  ·  ALL DAY', deco='confetti')),
 ('free', 'free-coffee-breakfast', 'polaroid', 'cyan', dict(eyebrow='Morning treat', headline='FREE COFFEE', photo=I('coffee'),
   caption='with any breakfast set', sticker_top='', sticker='FREE', line='7AM – 11AM  ·  DINE IN')),
 ('free', 'fries-friday-stickers', 'sticker_bomb', 'chili', dict(eyebrow='Every Friday', headline='FRIES FRIDAY', sub='FREE FRIES WITH ANY BURGER',
   stickers=[('', 'FREE'), ('ANY', 'BURGER'), ('ALL', 'DAY'), ('DINE IN OR', 'TAKEAWAY'), ('EVERY', 'FRIDAY')])),

 # ── 04 Time Deals ──
 ('time', 'happy-hour-clock', 'countdown', 'sunset', dict(eyebrow='Every afternoon', headline='HAPPY HOUR', h=3, m=0,
   time='3PM – 5PM', sub='30% OFF SHORT EATS & COFFEE', line='The best two hours of the day')),
 ('time', 'breakfast-till-11', 'photo_band', 'sunshine', dict(photo=I('eggs'), eyebrow='Rise & shine', headline='BREAKFAST TILL 11',
   sub='SETS FROM MVR 45', price_top='FROM', price='MVR 45', line='Eggs · Toast · Coffee or tea')),
 ('time', 'late-night-grill', 'countdown', 'night', dict(eyebrow='Open late', headline='LATE NIGHT GRILL', h=10, m=0,
   time='10PM – 1AM', sub='BURGERS · SKEWERS · FRIES', line='Thursday to Saturday')),

 # ── 05 Item Spotlight & New ──
 ('item', 'new-bajiya-box', 'photo_side', 'sunset', dict(eyebrow='Just landed', headline='NEW: BAJIYA BOX', photo=BC,
   badge_top='ONLY', badge='MVR 35', pill='6 PIECES  ·  FRESH EVERY HOUR', line='Crispy outside. Spicy inside.')),
 ('item', 'chefs-pick', 'photo_band', 'lagoon', dict(photo=B, eyebrow='Chef\'s pick', headline='CRISPY BAJIYA',
   sub='MALDIVIAN CLASSIC', price_top='EACH', price='MVR 5', line='Made fresh in our kitchen every morning')),
 ('item', 'new-mango-shake', 'magazine', 'chili', dict(masthead='NEW', photo=I('shake-yellow'), sticker_top='ONLY', sticker='MVR 45',
   tag='THIS MONTH', headline='MANGO SHAKE IS HERE', line='REAL MANGO  ·  SOFT SERVE  ·  CREAM', issue='BAKE & GRILL  ·  NEW ON THE MENU')),

 # ── 06 Drinks & Coffee ──
 ('drink', 'coffee-bar-menu', 'menu_trio', 'cyan', dict(eyebrow='Our coffee bar', headline='COFFEE & MORE', items=[
   (I('coffee'), 'CAPPUCCINO', 'Double shot, silky milk', '35'), (I('iced'), 'ICED LATTE', 'Cold, creamy, strong', '40'),
   (I('shake'), 'MILKSHAKE', 'Strawberry or chocolate', '45')], line='Ask for oat milk', deco='dots')),
 ('drink', 'fresh-juice', 'photo_side', 'chili', dict(eyebrow='Squeezed to order', headline='FRESH JUICE', photo=I('juice'),
   badge_top='ANY', badge='MVR 30', pill='ORANGE · WATERMELON · LIME MINT', line='No sugar added, just fruit')),
 ('drink', 'cold-brew-polaroid', 'polaroid', 'lagoon', dict(eyebrow='It\'s back', headline='COLD BREW', photo=I('iced'),
   caption='steeped for 18 hours', sticker_top='FROM', sticker='MVR 40', line='ADD VANILLA OR CARAMEL FREE')),

 # ── 07 Bakery & Desserts ──
 ('bake', 'sweet-counter-menu', 'menu_trio', 'creampop', dict(eyebrow='The sweet counter', headline='BAKED TODAY', items=[
   (I('cake'), 'CAKE SLICE', 'Chocolate or red velvet', '30'), (I('donuts'), 'DONUTS', 'Glazed & sprinkled', '15'),
   (I('cupcake'), 'CUPCAKES', 'Frosted fresh daily', '18')], line='Whole cakes on order, 48 hours ahead', deco='dots')),
 ('bake', 'fresh-croissants', 'photo_band', 'berry', dict(photo=I('croissant'), eyebrow='Out of the oven at 7AM',
   headline='FRESH CROISSANTS', sub='BUTTER · CHOCOLATE · CHEESE', price_top='EACH', price='MVR 18', line='3 for MVR 45')),
 ('bake', 'custom-cakes', 'polaroid', 'lagoon', dict(eyebrow='Made for your day', headline='CUSTOM CAKES', photo=I('cake'),
   caption='order 48 hours ahead', sticker_top='PRE-ORDER', sticker='10% OFF', line='BIRTHDAYS  ·  WEDDINGS  ·  OFFICE')),

 # ── 08 Grill & Meals ──
 ('grill', 'grill-faves-menu', 'menu_trio', 'sunset', dict(eyebrow='Off the grill', headline='GRILL FAVOURITES', items=[
   (I('burger'), 'BEEF BURGER', 'Flame-grilled, cheddar', '79'), (I('skewer'), 'CHICKEN SKEWERS', 'Two skewers, garlic sauce', '69'),
   (I('fries'), 'LOADED FRIES', 'Cheese & chilli', '45')], deco='rays')),
 ('grill', 'burger-week', 'magazine', 'chili', dict(masthead='BURGER', photo=I('burger'), sticker_top='ALL', sticker='MVR 69',
   tag='WEEK', headline='BURGER WEEK IS HERE', line='5 BURGERS  ·  ONE PRICE  ·  7 DAYS', issue='BAKE & GRILL  ·  GRILL EDITION', deco='dots')),
 ('grill', 'family-bucket-tag', 'price_tag', 'chili', dict(eyebrow='Feeds 4', headline='FAMILY BUCKET', photo=I('fries'),
   tag_top='ONLY', price='MVR 249', tag_bottom='WINGS · FRIES · 4 DRINKS', line='Dine in or takeaway', deco='rays')),

 # ── 09 Events & Catering ──
 ('event', 'party-packs-stickers', 'sticker_bomb', 'lagoon', dict(eyebrow='Throwing a party?', headline='PARTY PACKS', sub='SHORT EATS · CAKES · DRINKS · DELIVERED',
   stickers=[('FOR', '10 PEOPLE'), ('FROM', 'MVR 450'), ('', 'CAKE ADD-ON'), ('FREE', 'DELIVERY'), ('BOOK', '3 DAYS AHEAD')], deco='dots')),
 ('event', 'book-the-cafe', 'photo_side', 'night', dict(eyebrow='Private events', headline='BOOK OUR CAFE', photo=I('cake'),
   badge_top='UP TO', badge='40 GUESTS', pill='BIRTHDAYS  ·  MEETINGS  ·  GATHERINGS', line='Call +960 912 0011 to book', deco='confetti')),

 # ── 10 Online, Delivery & Loyalty ──
 ('online', 'scan-and-order', 'qr_promo', 'sunset', dict(eyebrow='No queue, no wait', headline='SCAN & ORDER', sub='ORDER FROM YOUR TABLE OR YOUR SOFA',
   qr='https://bakeandgrill.mv/order/', steps=['SCAN', 'ORDER', 'ENJOY'])),
 ('online', 'todays-deals-qr', 'qr_promo', 'berry', dict(eyebrow='Never miss a deal', headline='TODAY\'S DEALS', sub='SCAN FOR THE FULL MENU & OFFERS',
   qr='https://bakeandgrill.mv/menu', steps=['SCAN', 'PICK', 'SAVE'], deco='confetti')),
 ('online', 'we-deliver', 'photo_band', 'chili', dict(photo=I('scooter'), eyebrow='Hot food to your door', headline='WE DELIVER',
   sub='ORDER ONLINE OR CALL', price_top='FREE OVER', price='MVR 300', line='bakeandgrill.mv/order')),

 # ── 11 Festivals & Seasons ──
 ('fest', 'ramadan-iftar-set', 'festive', 'night', dict(kind='ramadan', eyebrow='Ramadan Kareem', headline='IFTAR SET', photo=B,
   offer='MVR 75 PER PERSON', line='Dates, short eats, soup & a main  ·  from sunset')),
 ('fest', 'eid-cakes', 'festive', 'lagoon', dict(kind='eid', eyebrow='Eid Mubarak', headline='EID CAKES', photo=I('cake'),
   offer='20% OFF PRE-ORDERS', line='Order before the last fasting day')),
 ('fest', 'independence-day', 'festive', 'flag', dict(kind='national', eyebrow='26 July', headline='INDEPENDENCE DAY',
   offer='26% OFF SHORT EATS', line='Celebrating the Maldives with you')),
 ('fest', 'new-year-platters', 'festive', 'night', dict(kind='newyear', eyebrow='Ring in the new year', headline='PARTY PLATTERS', photo=I('skewer'),
   offer='FROM MVR 299', line='Order by 29 December')),

 # ── 12 Kids, Family & Students ──
 ('family', 'kids-eat-free', 'photo_side', 'sunshine', dict(eyebrow='Family Sundays', headline='KIDS EAT FREE', photo=I('fries'),
   badge_top='UNDER', badge='12s', pill='ONE FREE KIDS MEAL PER ADULT MAIN', deco='confetti')),
 ('family', 'student-meal-stickers', 'sticker_bomb', 'cyan', dict(eyebrow='Show your student ID', headline='STUDENT MEAL', sub='ANY BURGER OR WRAP + FRIES + DRINK',
   stickers=[('ONLY', 'MVR 39'), ('', 'FREE WIFI'), ('STUDY', 'SPOT'), ('OPEN', 'TILL LATE'), ('', 'EXAM FUEL')], deco='dots')),

 # ── 13 Notices & Info ──
 ('notice', 'opening-hours', 'notice', 'creampop', dict(eyebrow='Come say hi', headline='OPENING HOURS', rows=[
   ('Saturday – Thursday', '7:00 AM – 11:00 PM'), ('Friday', '2:00 PM – 11:00 PM'), ('Kitchen closes', '10:30 PM'), ('Delivery', '11:00 AM – 10:00 PM')],
   line='Hours change on public holidays')),
 ('notice', 'we-are-hiring', 'notice', 'sunshine', dict(eyebrow='Join our team', headline="WE'RE HIRING", rows=[
   ('Barista', 'Full time'), ('Grill cook', 'Full time'), ('Cashier', 'Part time'), ('Delivery rider', 'Part time')],
   line='Ask at the counter or call +960 912 0011', deco='dots')),
 ('notice', 'free-wifi', 'notice', 'berry', dict(eyebrow='Stay a while', headline='FREE WI-FI', rows=[
   ('Network', 'BakeAndGrill-Guest'), ('Password', 'Ask our team'), ('Charging', 'Plugs at the window seats'), ('Time limit', 'None. Relax.')],
   line='Please be kind to your neighbours', deco='confetti')),
 ('notice', 'holiday-hours', 'notice', 'lagoon', dict(eyebrow='Please note', headline='HOLIDAY HOURS', rows=[
   ('First day of Eid', 'Closed'), ('Second day', '4:00 PM – 11:00 PM'), ('Third day', 'Normal hours'), ('Online orders', 'Open as usual')],
   line='Eid Mubarak from all of us')),
]


def entries():
    rows = []
    order = {c[0]: i for i, c in enumerate(CATS)}
    for cat, slug, arch, pal, content in D:
        def mk(a=arch, pl=pal, c=content):
            return lambda: ARCH[a](P_(pl), c)
        has_photo = any(k in content for k in ('photo', 'items'))
        style = 'photo' if has_photo else ('extra' if arch in ('sticker_bomb', 'big_grid') else 'colour')
        rows.append(dict(cat=cat, slug=slug, style=style, fn=mk(), has_photo=has_photo, layout=arch, palette=pal))
    rows.sort(key=lambda r: order[r['cat']])
    for i, r in enumerate(rows, 1):
        c = CAT[r['cat']]
        r['num'] = f'{i:03d}'
        r['id'] = f'TV-{i:03d}'
        r['cat_no'], r['cat_name'] = c[1], c[2]
        r['cat_folder'] = f"{c[1]}-{c[2].replace(' & ', '-and-').replace(', ', '-').replace(' ', '-')}"
        r['key'] = f"tv{i:03d}-{r['slug']}"
        r['title'] = r['slug'].replace('-', ' ').title().replace('Mvr', 'MVR').replace('Buy1Get1', 'Buy 1 Get 1').replace('Qr', 'QR')
    return rows


if __name__ == '__main__':
    rs = entries()
    from collections import Counter
    print(len(rs), Counter(r['cat'] for r in rs), Counter(r['style'] for r in rs))
