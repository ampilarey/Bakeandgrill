"""Fold the tv and tvp halves of every TV template into its theme.json and list the
TV templates in index.json after the print ones (the print rows are left as they are).
   usage: python3 merge_tv.py   (after POSTER_VARIANT=tv and =tvp runs of build_tv.py)"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib
from catalog import CATS, STYLE_LABEL
from tv_posters import entries

THEMES = os.path.join(lib.REPO, 'backend/resources/poster-themes')
SIZES = {'TV': 'tv', 'TV4K': 'tv', 'TVP': 'tvp'}

rows = entries()
new = []
for r in rows:
    tdir = os.path.join(THEMES, r['cat_folder'], r['key'])
    halves = {}
    for v in ('tv', 'tvp'):
        f = os.path.join(tdir, f'variant-{v}.json')
        if not os.path.isfile(f):
            sys.exit(f'{r["key"]}: variant-{v}.json missing; run build_tv.py for both variants first')
        halves[v] = json.load(open(f))
    for v in ('tv', 'tvp'):
        os.remove(os.path.join(tdir, f'variant-{v}.json'))
    ids = {v: sorted(t['id'] for t in halves[v]['text_slots']) + sorted(p['id'] for p in halves[v]['photo_slots']) for v in halves}
    if ids['tv'] != ids['tvp']:
        sys.exit(f'{r["key"]}: the tv and tvp variants record different slots: {ids}')
    theme = {
        'id': r['id'], 'key': r['key'], 'title': r['title'], 'kind': 'screen',
        'category': {'key': r['cat'], 'number': r['cat_no'], 'name': r['cat_name']},
        'style': r['style'], 'style_label': STYLE_LABEL[r['style']], 'layout': r['layout'], 'palette': r['palette'],
        'has_photo': bool(halves['tv']['photo_slots']),
        'size_to_variant': dict(SIZES),
        'draw_order': 'backdrop draw list in order; {"photo_slot":"pN"} = draw photo slot pN there. Then logo, QR, text slots.',
        'slot_ids_match_across_variants': True,
        'variants': {'tv': halves['tv'], 'tvp': halves['tvp']},
    }
    json.dump(theme, open(os.path.join(tdir, 'theme.json'), 'w'), indent=1, ensure_ascii=False)
    new.append({'id': r['id'], 'key': r['key'], 'title': r['title'], 'kind': 'screen', 'category': r['cat'], 'style': r['style'],
                'has_photo': theme['has_photo'], 'photo_slots': len(halves['tv']['photo_slots']), 'text_slots': len(halves['tv']['text_slots']),
                'path': f"{r['cat_folder']}/{r['key']}"})

index_path = os.path.join(THEMES, 'index.json')
index = json.load(open(index_path))
keep = [t for t in index['themes'] if t.get('kind', 'print') != 'screen']
index['themes'] = keep + new
index['sizes'] = {**{k: v for k, v in index['sizes'].items() if k not in SIZES}, **SIZES}
index['count'] = len(index['themes'])
json.dump(index, open(index_path, 'w'), indent=1)
print('merged', len(new), 'TV templates;', len(index['themes']), 'themes in the index')
