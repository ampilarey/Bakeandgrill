"""All 110 templates, grouped into 13 categories with a global number."""
import posters, posters2, posters3, posters4, posters5

CATS = [
    ('disc',   '01', 'Discounts & Sales',          'Percent-off, flash sales, weekend sales'),
    ('combo',  '02', 'Combos & Price Deals',       'Set meals and fixed-price bundles'),
    ('free',   '03', 'Buy 1 Get 1 & Freebies',     'BOGO, free item with purchase, bring a friend'),
    ('time',   '04', 'Time Deals',                 'Happy hour, breakfast, lunch, late night'),
    ('item',   '05', 'Item Spotlight & New',       'One dish in the spotlight, new on the menu'),
    ('drink',  '06', 'Drinks & Coffee',            'Coffee, juice, shakes, tea'),
    ('bake',   '07', 'Bakery & Desserts',          'Croissants, cakes, cupcakes, donuts'),
    ('grill',  '08', 'Grill & Meals',              'Burgers, skewers, platters, sandwiches'),
    ('event',  '09', 'Events & Catering',          'Party packs, private bookings, weddings, office'),
    ('online', '10', 'Online, Delivery & Loyalty', 'QR ordering, delivery, loyalty cards, points'),
    ('fest',   '11', 'Festivals & Seasons',        'Ramadan, Eid, Independence Day, New Year, holidays'),
    ('family', '12', 'Kids, Family & Students',    'Kids meals, family platters, student deals'),
    ('notice', '13', 'Notices & Info',             'Opening hours, hiring, holiday hours, Wi-Fi'),
]
CAT = {c[0]: c for c in CATS}

OLD = {  # number -> category
    '01': 'time', '02': 'free', '03': 'combo', '04': 'time', '05': 'family', '06': 'online', '07': 'family',
    '08': 'online', '09': 'event', '10': 'bake', '11': 'drink', '12': 'combo', '13': 'bake', '14': 'online',
    '15': 'drink', '16': 'grill', '17': 'free', '18': 'family', '19': 'combo', '20': 'disc', '21': 'combo',
    '22': 'drink', '23': 'drink', '24': 'time', '25': 'free', '26': 'disc', '27': 'free', '28': 'online',
    '29': 'free', '30': 'drink',
}
STYLE_LABEL = {
    'classic': 'Classic brand colours',
    'colour': 'Colourful',
    'extra': 'Extra colourful',
    'photo': 'With item photo',
}


def entries():
    rows = []
    for mod, style in ((posters, 'classic'), (posters2, 'colour'), (posters3, 'colour'), (posters4, 'extra')):
        for name, fn in mod.P.items():
            num, slug = name.split('-', 1)
            rows.append(dict(cat=OLD[num], slug=slug + ('-classic' if style == 'classic' else ''), style=style,
                             fn=fn, has_photo=False, layout='original', palette=None))
    for key, fn in posters5.P.items():
        m = posters5.META[key]
        rows.append(dict(cat=m['category'], slug=m['slug'], style='photo' if m['has_photo'] else 'colour',
                         fn=fn, has_photo=m['has_photo'], layout=m['layout'], palette=m['palette']))
    order = {c[0]: i for i, c in enumerate(CATS)}
    srank = {'photo': 0, 'extra': 1, 'colour': 2, 'classic': 3}
    rows.sort(key=lambda r: (order[r['cat']], srank[r['style']], r['slug']))
    for i, r in enumerate(rows, 1):
        c = CAT[r['cat']]
        r['num'] = f'{i:03d}'
        r['id'] = f'BG-{i:03d}'
        r['cat_no'], r['cat_name'] = c[1], c[2]
        r['cat_folder'] = f"{c[1]}-{c[2].replace(' & ', '-and-').replace(', ', '-').replace(' ', '-')}"
        r['key'] = f"bg{i:03d}-{r['slug']}"
        r['title'] = r['slug'].replace('-classic', '').replace('-', ' ').title().replace('Mvr', 'MVR')
        r['file'] = f"BakeGrill_A2_{r['id']}_{r['cat']}_{r['slug']}"
    return rows


if __name__ == '__main__':
    rs = entries()
    from collections import Counter
    print(len(rs), Counter(r['cat'] for r in rs), Counter(r['style'] for r in rs))
