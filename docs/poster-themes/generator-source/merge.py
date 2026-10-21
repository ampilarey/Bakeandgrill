"""Merge variant halves into theme.json, write index.json, catalogue, category sheets, all-in-one PDFs."""
import os, sys, json, glob, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
from catalog import entries, CATS, STYLE_LABEL

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
THEMES = os.path.join(OUT, 'repo/backend/resources/poster-themes')
rows = entries()
index = []
for r in rows:
    tdir = os.path.join(THEMES, r['cat_folder'], r['key'])
    L = json.load(open(os.path.join(tdir, 'variant-large.json')))
    S = json.load(open(os.path.join(tdir, 'variant-small.json')))
    os.remove(os.path.join(tdir, 'variant-large.json')); os.remove(os.path.join(tdir, 'variant-small.json'))
    theme = {
        'id': r['id'], 'key': r['key'], 'title': r['title'],
        'category': {'key': r['cat'], 'number': r['cat_no'], 'name': r['cat_name']},
        'style': r['style'], 'style_label': STYLE_LABEL[r['style']], 'layout': r['layout'], 'palette': r['palette'],
        'has_photo': bool(L['photo_slots']),
        'size_to_variant': {'A2': 'large', 'A3': 'large', 'A4': 'small', 'A5': 'small'},
        'draw_order': 'backdrop draw list in order; {"photo_slot":"pN"} = draw photo slot pN there. Then logo, QR, text slots.',
        'slot_ids_match_across_variants': [t['id'] for t in L['text_slots']] == [t['id'] for t in S['text_slots']],
        'variants': {'large': L, 'small': S},
    }
    json.dump(theme, open(os.path.join(tdir, 'theme.json'), 'w'), indent=1, ensure_ascii=False)
    index.append({'id': r['id'], 'key': r['key'], 'title': r['title'], 'category': r['cat'], 'style': r['style'],
                  'has_photo': theme['has_photo'], 'photo_slots': len(L['photo_slots']), 'text_slots': len(L['text_slots']),
                  'path': f"{r['cat_folder']}/{r['key']}"})
json.dump({'categories': [{'key': c[0], 'number': c[1], 'name': c[2], 'description': c[3],
                           'folder': next(r['cat_folder'] for r in rows if r['cat'] == c[0])} for c in CATS],
           'styles': STYLE_LABEL, 'sizes': {'A2': 'large', 'A3': 'large', 'A4': 'small', 'A5': 'small'},
           'count': len(index), 'themes': index},
          open(os.path.join(THEMES, 'index.json'), 'w'), indent=1)

# all-in-one per size
for size in ('A2', 'A3', 'A4', 'A5'):
    files = []
    for r in rows:
        files.append(os.path.join(OUT, f'print-{size}', r['cat_folder'], r['file'].replace('BakeGrill_A2_', f'BakeGrill_{size}_') + '.pdf'))
    subprocess.run(['qpdf', '--empty', '--pages', *files, '--', os.path.join(OUT, f'BakeGrill_{size}_ALL-110-templates.pdf')], check=True)

# catalogue + category sheets (from the large previews)
font = lambda sz: ImageFont.truetype(os.path.join(HERE, 'ttf/plus-jakarta-sans-latin-800-normal.ttf'), sz)
fontA = lambda sz: ImageFont.truetype(os.path.join(HERE, 'ttf/anton-latin-400-normal.ttf'), sz)
thumbs = {r['id']: Image.open(os.path.join(THEMES, r['cat_folder'], r['key'], 'preview-large.jpg')) for r in rows}
pages = []
for c in CATS:
    rs = [r for r in rows if r['cat'] == c[0]]
    tw, th = 300, 424
    per_page = 12
    for pg in range(0, len(rs), per_page):
        chunk = rs[pg:pg + per_page]
        page = Image.new('RGB', (1400, 1980), '#FFF3DC')
        d = ImageDraw.Draw(page)
        d.rectangle([0, 0, 1400, 150], fill='#1C1408')
        d.text((60, 30), f'{c[1]}  {c[2].upper()}', font=fontA(64), fill='#FFC72C')
        d.text((62, 112), c[3], font=font(22), fill='#FFF3DC')
        for i, r in enumerate(chunk):
            x = 60 + (i % 4) * (tw + 40)
            y = 190 + (i // 4) * (th + 170)
            t = thumbs[r['id']].copy(); t.thumbnail((tw, th))
            d.rectangle([x + 6, y + 6, x + t.width + 6, y + t.height + 6], fill='#C9BBA0')
            page.paste(t, (x, y))
            d.text((x, y + th + 14), r['id'], font=fontA(30), fill='#D92B1C')
            d.text((x + 108, y + th + 22), STYLE_LABEL[r['style']].upper(), font=font(14), fill='#0B7A75')
            ttl = r['title'] if len(r['title']) < 30 else r['title'][:28] + '…'
            d.text((x, y + th + 58), ttl, font=font(19), fill='#1C1408')
        pages.append(page)
    g = Image.new('RGB', (min(len(rs), 6) * 380 + 20, ((len(rs) + 5) // 6) * 527 + 20), '#e9e5df')
    for i, r in enumerate(rs):
        t = thumbs[r['id']].copy(); t.thumbnail((360, 600))
        g.paste(t, (20 + (i % 6) * 380, 20 + (i // 6) * 527))
    for size in ('A2', 'A3', 'A4', 'A5'):
        g.save(os.path.join(OUT, f'print-{size}', rs[0]['cat_folder'], f"PREVIEW_{rs[0]['cat_folder']}.jpg"), quality=84)
cover = Image.new('RGB', (1400, 1980), '#D92B1C')
d = ImageDraw.Draw(cover)
d.text((80, 160), 'BAKE & GRILL', font=fontA(150), fill='#FFF3DC')
d.text((80, 340), f'{len(rows)} POSTER TEMPLATES', font=fontA(96), fill='#FFC72C')
d.text((84, 480), 'A2 · A3 · A4 · A5   —   pick by number (BG-001 … BG-110)', font=font(28), fill='#FFF3DC')
y = 600
for c in CATS:
    ids = [r['id'] for r in rows if r['cat'] == c[0]]
    d.text((84, y), f'{c[1]}  {c[2]}', font=fontA(46), fill='#FFFFFF')
    d.text((760, y + 14), f'{len(ids)} designs   {ids[0]} – {ids[-1]}', font=font(24), fill='#FFC72C')
    y += 82
d.text((84, 1760), 'A2 & A3: wall and window posters.  A4 & A5: counter and table cards, with', font=font(24), fill='#FFF3DC')
d.text((84, 1796), 'bigger small print (nothing under 9 pt on A5) and no stand-off corners.', font=font(24), fill='#FFF3DC')
d.text((84, 1860), 'Prices, discounts and times are placeholders.', font=font(24), fill='#FFF3DC')
cover.save(os.path.join(OUT, 'BakeGrill_Templates_CATALOGUE.pdf'), save_all=True, append_images=pages, resolution=150)
print('merged', len(index))
