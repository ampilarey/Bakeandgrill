"""26 more templates (owner, 2026-11-05: "Can u add more designs to poster template?"), two per
category. catalog.py numbers them after the first 110 (BG-111 onwards) so no saved poster or
template changes key."""
from archetypes import ARCH
from kit5 import P_

B = 'bajiya-photo'
BS = 'bajiya-square'
BC = 'bajiya-cutout'
I = lambda n: 'illus:' + n

D = [
 # ── 01 Discounts & Sales ──
 ('disc', 'payday-sale-tag', 'price_tag', 'rust', dict(eyebrow='It\'s payday', headline='PAYDAY SALE', photo=I('burger'),
   tag_top='SAVE', price='20%', tag_bottom='ON EVERY ORDER OVER MVR 150', line='Last three days of the month', deco='rays')),
 ('disc', 'clearance-evening-bakes', 'countdown', 'mocha', dict(eyebrow='Before we close', headline='EVENING BAKES', h=9, m=0,
   time='HALF PRICE AFTER 9PM', sub='BREAD · BUNS · PASTRIES OF THE DAY', line='Fresh today, cheaper tonight')),

 # ── 02 Combos & Price Deals ──
 ('combo', 'breakfast-combo-split', 'split_diag', 'mint', dict(photo=I('toast'), eyebrow='Start right', headline='BREAKFAST COMBO',
   sub='TOAST · EGGS · TEA OR COFFEE', price_top='ONLY', price='MVR 49', pill='EVERY DAY  ·  7AM – 11AM')),
 ('combo', 'pick-two-menu', 'menu_trio', 'rust', dict(eyebrow='Pick any two', headline='2 FOR MVR 60', items=[
   (I('sandwich'), 'SANDWICH', 'Club, tuna or chicken', '35'), (I('fries'), 'FRIES', 'Salted or peri peri', '25'),
   (I('shake'), 'SHAKE', 'Any flavour', '40')], line='Mix and match from these three')),

 # ── 03 Buy 1 Get 1 & Freebies ──
 ('free', 'free-fries-weekend', 'sticker_bomb', 'chili', dict(eyebrow='Weekend treat', headline='FREE FRIES', sub='WITH ANY MEAL, FRIDAY & SATURDAY',
   stickers=[('ANY', 'MEAL'), ('', 'FREE FRIES'), ('DINE', 'IN'), ('TAKE', 'AWAY'), ('ALL', 'WEEKEND')], deco='dots')),
 ('free', 'coffee-bogo-mint', 'photo_circle', 'mint', dict(eyebrow='Two cups, one price', headline='COFFEE BUY 1 GET 1', photo=I('coffee'),
   badge_top='2ND CUP', badge='FREE', pill='EVERY MORNING  ·  7AM – 10AM', line='Bring someone along')),

 # ── 04 Time Deals ──
 ('time', 'early-bird-coffee', 'countdown', 'mint', dict(eyebrow='Up early?', headline='EARLY BIRD', h=7, m=0,
   time='7AM – 9AM', sub='ANY COFFEE + CROISSANT FOR MVR 40', line='The first hour tastes best')),
 ('time', 'afternoon-tea-polaroid', 'polaroid', 'mocha', dict(eyebrow='The 4 o\'clock break', headline='AFTERNOON TEA', photo=I('tea'),
   caption='tea, cake & a quiet hour', sticker_top='SET', sticker='MVR 35', line='EVERY DAY  ·  3PM – 6PM')),

 # ── 05 Item Spotlight & New ──
 ('item', 'bajiya-magazine-cover', 'magazine', 'rust', dict(masthead='FRESH', photo=B, sticker_top='ONLY', sticker='MVR 5',
   tag='HOT TODAY', headline='OUR FAMOUS BAJIYA', line='CRISPY  ·  SPICY  ·  FRESH EVERY HOUR', issue='BAKE & GRILL  ·  HOUSE FAVOURITE')),
 ('item', 'back-by-demand-cutout', 'photo_circle', 'night', dict(eyebrow='You asked, it\'s back', headline='BACK BY DEMAND', photo=BC,
   badge_top='FOR A', badge='LIMITED TIME', pill='GET IT BEFORE IT GOES AGAIN', deco='rays')),

 # ── 06 Drinks & Coffee ──
 ('drink', 'iced-coffee-arch', 'arch', 'mocha', dict(photo=I('iced'), pill='MVR 40', eyebrow='Cool down',
   headline='ICED COFFEE', line='LATTE  ·  MOCHA  ·  CARAMEL  ·  VANILLA')),
 ('drink', 'juice-bar-grid', 'big_grid', 'lime', dict(eyebrow='Fresh juice bar', words=['FRESH', 'JUICE', 'NO', 'SUGAR', 'MVR', '30'],
   tiles=['#F7670B', '#0B7A75', '#FFC72C', '#E5007D', '#064A47', '#D92B1C'], line='ORANGE · WATERMELON · PAPAYA · LIME MINT')),

 # ── 07 Bakery & Desserts ──
 ('bake', 'bread-of-the-day-top', 'photo_top', 'mocha', dict(photo=I('toast'), eyebrow='Out of the oven', headline='BREAD OF THE DAY',
   sub='BAKED HERE EVERY MORNING', pill='LOAVES  ·  BUNS  ·  ROLLS', sticker_top='FROM', sticker='MVR 12', deco='dots')),
 ('bake', 'cake-by-the-slice-split', 'split_diag', 'berry', dict(photo=I('cake'), eyebrow='Sweet tooth?', headline='CAKE BY THE SLICE',
   sub='CHOCOLATE · RED VELVET · CARROT', price_top='SLICE', price='MVR 30', pill='WHOLE CAKES ON ORDER')),

 # ── 08 Grill & Meals ──
 ('grill', 'mixed-grill-circle', 'photo_circle', 'rust', dict(eyebrow='Every evening from 6PM', headline='MIXED GRILL', photo=I('skewer'),
   badge_top='FOR TWO', badge='MVR 179', pill='CHICKEN · BEEF · FISH · RICE · SAUCES', deco='rays')),
 ('grill', 'double-burger-polaroid', 'polaroid', 'chili', dict(eyebrow='Go big', headline='DOUBLE BURGER', photo=I('burger'),
   caption='two patties, double cheese', sticker_top='ONLY', sticker='MVR 99', line='ADD FRIES & A DRINK FOR MVR 25', deco='rays')),

 # ── 09 Events & Catering ──
 ('event', 'meeting-platters-tag', 'price_tag', 'lagoon', dict(eyebrow='For meetings & trainings', headline='MEETING PLATTERS', photo=B,
   tag_top='PER PERSON', price='MVR 45', tag_bottom='SHORT EATS · SANDWICHES · TEA', line='Order a day ahead', deco='dots')),
 ('event', 'catering-menu-trio', 'menu_trio', 'mocha', dict(eyebrow='We cater', headline='CATERING TRAYS', items=[
   (B, 'SHORT EATS', '50 pieces, mixed', '250'), (I('sandwich'), 'SANDWICHES', '24 halves', '220'),
   (I('cake'), 'CAKE', 'One kilo, any flavour', '350')], line='Delivered and set up on time')),

 # ── 10 Online, Delivery & Loyalty ──
 ('online', 'order-online-qr-mint', 'qr_promo', 'mint', dict(eyebrow='Skip the queue', headline='ORDER AHEAD', sub='ORDER ONLINE, PICK UP WHEN IT\'S READY',
   qr='https://bakeandgrill.mv/order/', steps=['SCAN', 'PAY', 'PICK UP'], deco='dots')),
 ('online', 'points-every-order-stickers', 'sticker_bomb', 'rust', dict(eyebrow='Our rewards', headline='EARN POINTS', sub='ON EVERY ORDER, ONLINE OR AT THE COUNTER',
   stickers=[('1 POINT', 'PER MVR 10'), ('', 'FREE TREATS'), ('BIRTHDAY', 'GIFT'), ('ASK', 'AT THE TILL'), ('', 'NO CARD NEEDED')])),

 # ── 11 Festivals & Seasons ──
 ('fest', 'ramadan-suhoor', 'festive', 'mocha', dict(kind='ramadan', eyebrow='Ramadan Kareem', headline='SUHOOR BOXES', photo=I('toast'),
   offer='MVR 55 PER BOX', line='Order by 10PM, picked up before suhoor')),
 ('fest', 'eid-gift-boxes', 'festive', 'rust', dict(kind='eid', eyebrow='Eid Mubarak', headline='EID GIFT BOXES', photo=I('gift'),
   offer='FROM MVR 150', line='Cakes, cookies & short eats, wrapped to give')),

 # ── 12 Kids, Family & Students ──
 ('family', 'kids-meal-tag', 'price_tag', 'sunshine', dict(eyebrow='For little ones', headline='KIDS MEAL', photo=I('fries'),
   tag_top='ONLY', price='MVR 39', tag_bottom='MINI BURGER · FRIES · JUICE', line='Under 12s', deco='dots')),
 ('family', 'family-night-magazine', 'magazine', 'lagoon', dict(masthead='FAMILY', photo=I('burger'), sticker_top='FEEDS', sticker='4',
   tag='NIGHT', headline='FAMILY NIGHT DEAL', line='GRILL PLATTER · RICE · 4 DRINKS · MVR 249', issue='BAKE & GRILL  ·  EVERY THURSDAY')),

 # ── 13 Notices & Info ──
 ('notice', 'ramadan-hours', 'notice', 'mocha', dict(eyebrow='During Ramadan', headline='RAMADAN HOURS', rows=[
   ('Iftar', 'From sunset'), ('Evening', '8:00 PM – 1:00 AM'), ('Suhoor orders', 'Until 3:00 AM'), ('Daytime', 'Takeaway only')],
   line='Ramadan Mubarak from all of us')),
 ('notice', 'how-to-order', 'notice', 'mint', dict(eyebrow='New here?', headline='HOW TO ORDER', rows=[
   ('1. Choose', 'From the menu board'), ('2. Order', 'At the counter or by QR'), ('3. Pay', 'Cash, card or QR'), ('4. Collect', 'We call your number')],
   line='Ask our team if you need a hand')),
]

P = {}
META = {}
for cat, slug, arch, pal, content in D:
    def mk(a=arch, pl=pal, c=content):
        return lambda: ARCH[a](P_(pl), c)
    P[f'{cat}-{slug}'] = mk()
    META[f'{cat}-{slug}'] = dict(category=cat, slug=slug, layout=arch, palette=pal,
                                 has_photo=any(k in content for k in ('photo', 'items')))
