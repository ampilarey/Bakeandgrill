"""60 new templates (many with photo frames), each tagged with a category."""
from archetypes import ARCH
from kit5 import P_

B = 'bajiya-photo'
BS = 'bajiya-square'
BC = 'bajiya-cutout'
I = lambda n: 'illus:' + n

D = [
 # ── 01 Discounts & Sales ──
 ('disc', 'mega-deals-stickers', 'sticker_bomb', 'sunset', dict(eyebrow='This week only', headline='MEGA DEALS', sub='SAVE ON YOUR FAVOURITES',
   stickers=[('UP TO', '50% OFF'), ('NEW', 'COMBOS'), ('', 'FREE FRIES'), ('ANY', '2 FOR 1'), ('FROM', 'MVR 15')])),
 ('disc', 'sale-colour-grid', 'big_grid', 'berry', dict(eyebrow='Big weekend sale', words=['UP TO', '50%', 'OFF', 'THIS', 'WEEK', 'ONLY'],
   line='SELECTED ITEMS  ·  WHILE STOCKS LAST')),
 ('disc', 'flash-sale-pastries', 'photo_top', 'chili', dict(photo=I('croissant'), eyebrow='Flash sale', headline='30% OFF PASTRIES',
   sub='TODAY ONLY', pill='CROISSANTS · DANISHES · PUFFS', sticker_top='TODAY', sticker='30%', deco='stripes')),
 ('disc', 'today-only-clock', 'countdown', 'cyan', dict(eyebrow='Hurry, ends at 6PM', headline='TODAY ONLY', h=6, m=0,
   time='20% OFF EVERYTHING', sub='DINE IN · TAKEAWAY · DELIVERY', line='One day. All the menu.')),
 ('disc', 'short-eats-magazine-sale', 'magazine', 'sunshine', dict(masthead='SALE', photo=B, sticker_top='SAVE', sticker='25%',
   tag='SHORT EATS', headline='25% OFF ALL HEDHIKAA', line='EVERY AFTERNOON  ·  3PM – 6PM', issue='BAKE & GRILL  ·  SALE EDITION')),

 # ── 02 Combos & Price Deals ──
 ('combo', 'burger-combo-tag', 'price_tag', 'sunset', dict(eyebrow='Burger + fries + drink', headline='BURGER COMBO', photo=I('burger'),
   tag_top='ONLY', price='MVR 99', tag_bottom='DINE IN  ·  TAKEAWAY', line='Every day, all day', deco='rays')),
 ('combo', 'lunch-box-coupon', 'coupon_photo', 'cyan', dict(photo=B, headline='LUNCH BOX', sub='RICE · CURRY · 2 SHORT EATS · DRINK',
   price_top='ONLY', price='MVR 65')),
 ('combo', 'value-meals-menu', 'menu_trio', 'night', dict(eyebrow='Value meals', headline='MEAL DEALS', items=[
   (I('burger'), 'BURGER MEAL', 'Burger, fries & drink', '89'), (I('sandwich'), 'CLUB SANDWICH', 'With fries & juice', '75'),
   (I('skewer'), 'GRILL SKEWERS', 'Two skewers & rice', '95')], line='Ask for today\'s drink of the day')),
 ('combo', 'snack-pack-circle', 'photo_circle', 'lime', dict(eyebrow='Quick bite', headline='SNACK PACK', photo=I('fries'),
   badge_top='ONLY', badge='MVR 25', pill='FRIES + 2 SHORT EATS + SOFT DRINK', line='Perfect for the walk home')),
 ('combo', 'any-3-short-eats-grid', 'big_grid', 'sunshine', dict(eyebrow='Mix & match short eats', words=['ANY', '3', 'FOR', 'MVR', '30', '!'],
   tiles=['#D92B1C', '#0B7A75', '#1C1408', '#F7670B', '#E5007D', '#00A3E0'], line='BAJIYA · GULHA · KAVAABU · MASROSHI')),
 ('combo', 'tea-and-short-eats-arch', 'arch', 'lagoon', dict(photo=B, pill='MVR 20', eyebrow='Kalhu sai + 2 hedhikaa', headline='TEA & SHORT EATS',
   line='EVERY AFTERNOON  ·  3PM – 6PM')),

 # ── 03 Buy 1 Get 1 & Freebies ──
 ('free', 'donuts-buy1get1', 'photo_circle', 'berry', dict(eyebrow='Sweet deal', headline='BUY 1 GET 1 FREE', photo=I('donuts'),
   badge_top='ALL', badge='DONUTS', pill='EVERY WEDNESDAY  ·  ALL DAY', deco='confetti')),
 ('free', 'free-coffee-breakfast', 'polaroid', 'cyan', dict(eyebrow='Morning treat', headline='FREE COFFEE', photo=I('coffee'),
   caption='with any breakfast set', sticker_top='', sticker='FREE', line='7AM – 11AM  ·  DINE IN')),
 ('free', 'free-drink-burger', 'split_diag', 'sunshine', dict(photo=I('burger'), eyebrow='Burger o\'clock', headline='FREE DRINK',
   sub='WITH EVERY BURGER, EVERY DAY', price_top='DRINK', price='FREE', pill='SOFT DRINK OR ICED TEA')),
 ('free', 'second-cake-slice-free', 'price_tag', 'lagoon', dict(eyebrow='Cake o\'clock', headline='2ND SLICE FREE', photo=I('cake'),
   tag_top='YOUR 2ND SLICE', price='FREE', tag_bottom='ANY CAKE OF THE DAY', line='Share it, or don\'t', deco='dots')),
 ('free', 'bring-a-friend-coupon', 'coupon_photo', 'chili', dict(photo=I('burger'), headline='BRING A FRIEND', sub='BUY ONE BURGER, GET ONE FREE',
   price_top='YOUR FRIEND', price='EATS FREE', code='Tuesdays  ·  Show this poster at the counter')),

 # ── 04 Time Deals ──
 ('time', 'happy-hour-clock', 'countdown', 'sunset', dict(eyebrow='Every afternoon', headline='HAPPY HOUR', h=3, m=0,
   time='3PM – 5PM', sub='30% OFF SHORT EATS & COFFEE', line='The best two hours of the day')),
 ('time', 'late-night-grill-clock', 'countdown', 'night', dict(eyebrow='Open late', headline='LATE NIGHT GRILL', h=10, m=0,
   time='10PM – 1AM', sub='BURGERS · SKEWERS · FRIES', line='Thursday to Saturday')),
 ('time', 'breakfast-till-11', 'photo_top', 'sunshine', dict(photo=I('eggs'), eyebrow='Rise & shine', headline='BREAKFAST TILL 11',
   sub='SETS FROM MVR 45', pill='EGGS · TOAST · COFFEE OR TEA', sticker_top='FROM', sticker='MVR 45', deco='dots')),
 ('time', 'sunday-brunch-arch', 'arch', 'creampop', dict(photo=I('toast'), pill='SUNDAYS 9AM – 1PM', eyebrow='Slow mornings',
   headline='SUNDAY BRUNCH', line='BOTTOMLESS TEA & COFFEE WITH ANY BRUNCH SET', deco='dots')),
 ('time', 'lunch-rush-magazine', 'magazine', 'lagoon', dict(masthead='LUNCH', photo=B, sticker_top='SAVE', sticker='15%',
   tag='12PM – 3PM', headline='LUNCH RUSH: 15% OFF', line='WEEKDAYS  ·  DINE IN & TAKEAWAY', issue='BAKE & GRILL  ·  LUNCH EDITION', deco='dots')),

 # ── 05 Item Spotlight & New ──
 ('item', 'new-bajiya-box', 'photo_circle', 'sunset', dict(eyebrow='Just landed', headline='NEW: BAJIYA BOX', photo=BC,
   badge_top='ONLY', badge='MVR 35', pill='6 PIECES  ·  FRESH EVERY HOUR', line='Crispy outside. Spicy inside.')),
 ('item', 'chefs-pick-photo-top', 'photo_top', 'lagoon', dict(photo=B, eyebrow='Chef\'s pick', headline='CRISPY BAJIYA',
   sub='MALDIVIAN CLASSIC', pill='MVR 5 EACH  ·  6 FOR MVR 25', sticker_top='', sticker='HOT', line='Made fresh in our kitchen every morning')),
 ('item', 'signature-burger-arch', 'arch', 'berry', dict(photo=I('burger'), pill='MVR 89', eyebrow='Try it today',
   headline='SIGNATURE BURGER', line='DOUBLE PATTY  ·  CHEESE  ·  HOUSE SAUCE')),
 ('item', 'short-eats-polaroid', 'polaroid', 'sunshine', dict(eyebrow='Fresh out the fryer', headline='SHORT EATS', photo=BS,
   caption='hot every hour', sticker_top='3 FOR', sticker='MVR 12', line='BAJIYA  ·  GULHA  ·  KAVAABU  ·  MASROSHI')),
 ('item', 'new-mango-shake-split', 'split_diag', 'chili', dict(photo=I('shake-yellow'), eyebrow='New on the menu', headline='MANGO SHAKE',
   sub='REAL MANGO  ·  SOFT SERVE  ·  CREAM', price_top='ONLY', price='MVR 45', pill='LIMITED TIME', deco='dots')),
 ('item', 'todays-special-tag', 'price_tag', 'night', dict(eyebrow='Today\'s special', headline='BAJIYA PLATTER', photo=B,
   tag_top='12 PIECES', price='MVR 60', tag_bottom='WITH CHILLI & LIME SAUCE', line='Feeds 3 to 4', line2='Great for sharing')),

 # ── 06 Drinks ──
 ('drink', 'coffee-bar-menu', 'menu_trio', 'cyan', dict(eyebrow='Our coffee bar', headline='COFFEE & MORE', items=[
   (I('coffee'), 'CAPPUCCINO', 'Double shot, silky milk', '35'), (I('iced'), 'ICED LATTE', 'Cold, creamy, strong', '40'),
   (I('shake'), 'MILKSHAKE', 'Strawberry or chocolate', '45')], line='Ask for oat milk', deco='dots')),
 ('drink', 'fresh-juice-circle', 'photo_circle', 'chili', dict(eyebrow='Squeezed to order', headline='FRESH JUICE', photo=I('juice'),
   badge_top='ANY', badge='MVR 30', pill='ORANGE · WATERMELON · LIME MINT', line='No sugar added, just fruit')),
 ('drink', 'shake-of-the-month', 'polaroid', 'berry', dict(eyebrow='Shake of the month', headline='STRAWBERRY SHAKE', photo=I('shake'),
   caption='thick, pink & dreamy', sticker_top='ONLY', sticker='MVR 45', line='THIS MONTH ONLY', deco='confetti')),
 ('drink', 'cold-brew-split', 'split_diag', 'cyan', dict(photo=I('iced'), eyebrow='It\'s back', headline='COLD BREW',
   sub='STEEPED FOR 18 HOURS', price_top='FROM', price='MVR 40', pill='ADD VANILLA OR CARAMEL FREE')),
 ('drink', 'karak-sai-arch', 'arch', 'sunshine', dict(photo=I('tea'), pill='MVR 12', eyebrow='Proper tea',
   headline='KARAK & KALHU SAI', line='ALL DAY  ·  EVERY DAY', deco='dots')),
 ('drink', 'smoothies-tag', 'price_tag', 'berry', dict(eyebrow='Blended fresh', headline='SMOOTHIES', photo=I('shake-yellow'),
   tag_top='FROM', price='MVR 40', tag_bottom='MANGO · BERRY · BANANA', line='Add protein +MVR 10', deco='dots')),

 # ── 07 Bakery & Desserts ──
 ('bake', 'sweet-counter-menu', 'menu_trio', 'creampop', dict(eyebrow='The sweet counter', headline='BAKED TODAY', items=[
   (I('cake'), 'CAKE SLICE', 'Chocolate or red velvet', '30'), (I('donuts'), 'DONUTS', 'Glazed & sprinkled', '15'),
   (I('cupcake'), 'CUPCAKES', 'Frosted fresh daily', '18')], line='Whole cakes on order, 48 hours ahead', deco='dots')),
 ('bake', 'fresh-croissants-top', 'photo_top', 'berry', dict(photo=I('croissant'), eyebrow='Out of the oven at 7AM',
   headline='FRESH CROISSANTS', sub='BUTTER · CHOCOLATE · CHEESE', pill='MVR 18 EACH  ·  3 FOR MVR 45', sticker_top='HOT', sticker='7AM')),
 ('bake', 'cupcakes-tag', 'price_tag', 'sunshine', dict(eyebrow='Little joys', headline='CUPCAKES', photo=I('cupcake'),
   tag_top='EACH', price='MVR 15', tag_bottom='BOX OF 6 FOR MVR 80', line='New flavour every week', deco='dots')),
 ('bake', 'custom-cakes-polaroid', 'polaroid', 'lagoon', dict(eyebrow='Made for your day', headline='CUSTOM CAKES', photo=I('cake'),
   caption='order 48 hours ahead', sticker_top='PRE-ORDER', sticker='10% OFF', line='BIRTHDAYS  ·  WEDDINGS  ·  OFFICE')),
 ('bake', 'baked-daily-grid', 'big_grid', 'sunset', dict(eyebrow='From our oven', words=['BAKED', 'DAILY', 'BREAD', 'BUNS', 'CAKES', 'PIES'],
   line='FRESH EVERY MORNING FROM 7AM')),
 ('bake', 'donut-day-circle', 'photo_circle', 'cyan', dict(eyebrow='Every Friday', headline='DONUT DAY', photo=I('donuts'),
   badge_top='ANY', badge='MVR 10', pill='GLAZED  ·  CHOCOLATE  ·  SPRINKLES', deco='confetti')),

 # ── 08 Grill & Meals ──
 ('grill', 'grill-faves-menu', 'menu_trio', 'sunset', dict(eyebrow='Off the grill', headline='GRILL FAVOURITES', items=[
   (I('burger'), 'BEEF BURGER', 'Flame-grilled, cheddar', '79'), (I('skewer'), 'CHICKEN SKEWERS', 'Two skewers, garlic sauce', '69'),
   (I('fries'), 'LOADED FRIES', 'Cheese & chilli', '45')], deco='rays')),
 ('grill', 'skewer-night-top', 'photo_top', 'night', dict(photo=I('skewer'), eyebrow='Every Wednesday', headline='SKEWER NIGHT',
   sub='ALL SKEWERS MVR 25', pill='CHICKEN · BEEF · FISH', sticker_top='FROM', sticker='6PM')),
 ('grill', 'burger-week-magazine', 'magazine', 'chili', dict(masthead='BURGER', photo=I('burger'), sticker_top='ALL', sticker='MVR 69',
   tag='WEEK', headline='BURGER WEEK IS HERE', line='5 BURGERS  ·  ONE PRICE  ·  7 DAYS', issue='BAKE & GRILL  ·  GRILL EDITION', deco='dots')),
 ('grill', 'grilled-fish-arch', 'arch', 'night', dict(photo=I('skewer'), pill='MVR 120', eyebrow='Fresh catch',
   headline='GRILLED FISH PLATTER', line='REEF FISH  ·  RICE  ·  SALAD  ·  GARLIC SAUCE')),
 ('grill', 'wraps-sandwiches-split', 'split_diag', 'sunset', dict(photo=I('sandwich'), eyebrow='Grab & go', headline='SANDWICHES',
   sub='CLUB · TUNA · CHICKEN · VEGGIE', price_top='FROM', price='MVR 45', pill='ADD FRIES FOR MVR 15')),
 ('grill', 'family-bucket-tag', 'price_tag', 'chili', dict(eyebrow='Feeds 4', headline='FAMILY BUCKET', photo=I('fries'),
   tag_top='ONLY', price='MVR 249', tag_bottom='WINGS · FRIES · 4 DRINKS', line='Dine in or takeaway', deco='rays')),

 # ── 09 Events & Catering ──
 ('event', 'party-packs-stickers', 'sticker_bomb', 'lagoon', dict(eyebrow='Throwing a party?', headline='PARTY PACKS', sub='SHORT EATS · CAKES · DRINKS · DELIVERED',
   stickers=[('FOR', '10 PEOPLE'), ('FROM', 'MVR 450'), ('', 'CAKE ADD-ON'), ('FREE', 'DELIVERY'), ('BOOK', '3 DAYS AHEAD')], deco='dots')),
 ('event', 'book-the-cafe-circle', 'photo_circle', 'night', dict(eyebrow='Private events', headline='BOOK OUR CAFE', photo=I('cake'),
   badge_top='UP TO', badge='40 GUESTS', pill='BIRTHDAYS  ·  MEETINGS  ·  GATHERINGS', line='Call +960 912 0011 to book', deco='confetti')),
 ('event', 'wedding-catering-arch', 'arch', 'berry', dict(photo=I('cake'), pill='FROM MVR 95 / GUEST', eyebrow='Your big day',
   headline='WEDDING CATERING', line='MENUS  ·  CAKES  ·  SERVICE  ·  SETUP')),
 ('event', 'office-lunch-grid', 'big_grid', 'lagoon', dict(eyebrow='Feeding the team?', words=['OFFICE', 'LUNCH', 'ORDERS', '10+', 'MEALS', '-10%'],
   line='ORDER BY 10AM  ·  DELIVERED BY 12:30')),
 ('event', 'birthday-party-polaroid', 'polaroid', 'sunset', dict(eyebrow='Make it a party', headline='BIRTHDAY PARTIES', photo=I('gift'),
   caption='cake, food & fun, sorted', sticker_top='FREE', sticker='CAKE', line='FOR PARTIES OF 15 OR MORE', deco='confetti')),

 # ── 10 Loyalty, Online & Delivery ──
 ('online', 'scan-and-order-qr', 'qr_promo', 'sunset', dict(eyebrow='No queue, no wait', headline='SCAN & ORDER', sub='ORDER FROM YOUR TABLE OR YOUR SOFA',
   qr='https://bakeandgrill.mv/order/', steps=['SCAN', 'ORDER', 'ENJOY'])),
 ('online', 'deals-qr', 'qr_promo', 'berry', dict(eyebrow='Never miss a deal', headline='TODAY\'S DEALS', sub='SCAN FOR THE FULL MENU & OFFERS',
   qr='https://bakeandgrill.mv/menu', steps=['SCAN', 'PICK', 'SAVE'], deco='confetti')),
 ('online', 'feedback-qr', 'qr_promo', 'cyan', dict(eyebrow='How did we do?', headline='TELL US', sub='YOUR FEEDBACK GOES STRAIGHT TO THE OWNER',
   qr='https://bakeandgrill.mv/complain', steps=['SCAN', 'RATE', 'THANK YOU'], deco='dots')),
 ('online', 'we-deliver-top', 'photo_top', 'chili', dict(photo=I('scooter'), eyebrow='Hot food to your door', headline='WE DELIVER',
   sub='ORDER ONLINE OR CALL', pill='BAKEANDGRILL.MV/ORDER', sticker_top='FREE OVER', sticker='MVR 300', deco='stripes')),
 ('online', 'every-10th-meal-free', 'big_grid', 'lime', dict(eyebrow='Loyalty card', words=['EAT', '9', 'TIMES', 'THE', '10TH', 'FREE'],
   tiles=['#E5007D', '#0B7A75', '#FFF3DC', '#FFC72C', '#D92B1C', '#064A47'], line='ASK FOR YOUR CARD AT THE COUNTER')),

 # ── 11 Festivals & Seasons ──
 ('fest', 'ramadan-iftar-set', 'festive', 'night', dict(kind='ramadan', eyebrow='Ramadan Kareem', headline='IFTAR SET', photo=B,
   offer='MVR 75 PER PERSON', line='Dates, short eats, soup & a main  ·  from sunset')),
 ('fest', 'eid-mubarak-cakes', 'festive', 'lagoon', dict(kind='eid', eyebrow='Eid Mubarak', headline='EID CAKES', photo=I('cake'),
   offer='20% OFF PRE-ORDERS', line='Order before the last fasting day')),
 ('fest', 'independence-day', 'festive', 'flag', dict(kind='national', eyebrow='26 July', headline='INDEPENDENCE DAY', photo=B,
   offer='26% OFF SHORT EATS', line='Celebrating the Maldives with you')),
 ('fest', 'new-year-platters', 'festive', 'night', dict(kind='newyear', eyebrow='Ring in the new year', headline='PARTY PLATTERS', photo=I('skewer'),
   offer='FROM MVR 299', line='Order by 29 December')),
 ('fest', 'valentines-meal-for-two', 'festive', 'berry', dict(kind='valentine', eyebrow='14 February', headline='DATE NIGHT', photo=I('cake'),
   offer='MEAL FOR 2  ·  MVR 199', line='Two mains, two drinks & a dessert to share')),
 ('fest', 'school-holidays', 'festive', 'cyan', dict(kind='summer', eyebrow='School holidays', headline='HOLIDAY TREATS', photo=I('shake-yellow'),
   offer='KIDS SHAKES MVR 25', line='All holiday long')),

 # ── 12 Kids, Family & Students ──
 ('family', 'kids-eat-free-sundays', 'photo_circle', 'sunshine', dict(eyebrow='Family Sundays', headline='KIDS EAT FREE', photo=I('fries'),
   badge_top='UNDER', badge='12s', pill='ONE FREE KIDS MEAL PER ADULT MAIN', deco='confetti')),
 ('family', 'student-meal-stickers', 'sticker_bomb', 'cyan', dict(eyebrow='Show your student ID', headline='STUDENT MEAL', sub='ANY BURGER OR WRAP + FRIES + DRINK',
   stickers=[('ONLY', 'MVR 39'), ('', 'FREE WIFI'), ('STUDY', 'SPOT'), ('OPEN', 'TILL LATE'), ('', 'EXAM FUEL')], deco='dots')),
 ('family', 'family-platter-arch', 'arch', 'lime', dict(photo=I('skewer'), pill='MVR 220', eyebrow='Together is better',
   headline='FAMILY PLATTER', line='FEEDS 4  ·  GRILL · RICE · SALAD · DRINKS')),
 ('family', 'exam-fuel-grid', 'big_grid', 'berry', dict(eyebrow='Exam season', words=['EXAM', 'FUEL', 'COFFEE', '+SNACK', 'MVR', '30'],
   line='WITH STUDENT ID  ·  ALL DAY')),

 # ── 13 Notices & Announcements ──
 ('notice', 'opening-hours', 'notice', 'creampop', dict(eyebrow='Come say hi', headline='OPENING HOURS', rows=[
   ('Saturday – Thursday', '7:00 AM – 11:00 PM'), ('Friday', '2:00 PM – 11:00 PM'), ('Kitchen closes', '10:30 PM'), ('Delivery', '11:00 AM – 10:00 PM')],
   line='Hours change on public holidays')),
 ('notice', 'now-open', 'notice', 'sunset', dict(eyebrow='Doors are open', headline='NOW OPEN', rows=[
   ('Fresh bakery', 'From 7AM'), ('Coffee bar', 'All day'), ('Grill', 'From 11AM'), ('Short eats', 'Hot every hour')],
   line='Come in and try something new', deco='rays')),
 ('notice', 'we-are-hiring', 'notice', 'sunshine', dict(eyebrow='Join our team', headline="WE'RE HIRING", rows=[
   ('Barista', 'Full time'), ('Grill cook', 'Full time'), ('Cashier', 'Part time'), ('Delivery rider', 'Part time')],
   line='Ask at the counter or call +960 912 0011', deco='dots')),
 ('notice', 'holiday-closing', 'notice', 'lagoon', dict(eyebrow='Please note', headline='HOLIDAY HOURS', rows=[
   ('First day of Eid', 'Closed'), ('Second day', '4:00 PM – 11:00 PM'), ('Third day', 'Normal hours'), ('Online orders', 'Open as usual')],
   line='Eid Mubarak from all of us')),
 ('notice', 'free-wifi', 'notice', 'berry', dict(eyebrow='Stay a while', headline='FREE WI-FI', rows=[
   ('Network', 'BakeAndGrill-Guest'), ('Password', 'Ask our team'), ('Charging', 'Plugs at the window seats'), ('Time limit', 'None. Relax.')],
   line='Please be kind to your neighbours', deco='confetti')),
]

P = {}
META = {}
for cat, slug, arch, pal, content in D:
    def mk(a=arch, pl=pal, c=content):
        return lambda: ARCH[a](P_(pl), c)
    P[f'{cat}-{slug}'] = mk()
    META[f'{cat}-{slug}'] = dict(category=cat, slug=slug, layout=arch, palette=pal,
                                 has_photo=any(k in content for k in ('photo', 'items')))
