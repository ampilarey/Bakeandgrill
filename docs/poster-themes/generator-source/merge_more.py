"""Fold a later batch of print templates (BG-<FROM> onwards) into the repo: each one's large and
small halves become its theme.json, and index.json gains its row inside its category, after the
designs already there. Rows already in the index are replaced, so a rerun is safe; the first 110
and the TV designs are left as they are.
   usage: POSTER_VARIANT=large POSTER_FROM=111 python3 build_variant.py OUT
          POSTER_VARIANT=small POSTER_FROM=111 python3 build_variant.py OUT
          POSTER_FROM=111 python3 merge_more.py OUT        (OUT/repo is the repository)"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalog import entries, CATS, STYLE_LABEL

OUT = sys.argv[1]
FROM = int(os.environ.get('POSTER_FROM', '111'))
THEMES = os.path.join(OUT, 'repo/backend/resources/poster-themes')
SIZES = {'A2': 'large', 'A3': 'large', 'A4': 'small', 'A5': 'small'}

new = {}
for r in entries():
    if int(r['num']) < FROM:
        continue
    tdir = os.path.join(THEMES, r['cat_folder'], r['key'])
    halves = {}
    for v in ('large', 'small'):
        f = os.path.join(tdir, f'variant-{v}.json')
        if not os.path.isfile(f):
            sys.exit(f'{r["key"]}: variant-{v}.json missing; run build_variant.py for both variants first')
        halves[v] = json.load(open(f))
    L, S = halves['large'], halves['small']
    if [t['id'] for t in L['text_slots']] != [t['id'] for t in S['text_slots']]:
        sys.exit(f'{r["key"]}: the large and small variants record different text slots')
    for v in ('large', 'small'):
        os.remove(os.path.join(tdir, f'variant-{v}.json'))
    theme = {
        'id': r['id'], 'key': r['key'], 'title': r['title'],
        'category': {'key': r['cat'], 'number': r['cat_no'], 'name': r['cat_name']},
        'style': r['style'], 'style_label': STYLE_LABEL[r['style']], 'layout': r['layout'], 'palette': r['palette'],
        'has_photo': bool(L['photo_slots']),
        'size_to_variant': dict(SIZES),
        'draw_order': 'backdrop draw list in order; {"photo_slot":"pN"} = draw photo slot pN there. Then logo, QR, text slots.',
        'slot_ids_match_across_variants': True,
        'variants': {'large': L, 'small': S},
    }
    json.dump(theme, open(os.path.join(tdir, 'theme.json'), 'w'), indent=1, ensure_ascii=False)
    new[r['key']] = {'id': r['id'], 'key': r['key'], 'title': r['title'], 'category': r['cat'], 'style': r['style'],
                     'has_photo': theme['has_photo'], 'photo_slots': len(L['photo_slots']), 'text_slots': len(L['text_slots']),
                     'path': f"{r['cat_folder']}/{r['key']}"}

index_path = os.path.join(THEMES, 'index.json')
index = json.load(open(index_path))
prints = [t for t in index['themes'] if t.get('kind', 'print') != 'screen' and t['key'] not in new]
screens = [t for t in index['themes'] if t.get('kind', 'print') == 'screen']
order = {c[0]: i for i, c in enumerate(CATS)}
prints = sorted(prints + list(new.values()), key=lambda t: (order[t['category']], int(t['id'][3:])))
index['themes'] = prints + screens
index['count'] = len(index['themes'])
json.dump(index, open(index_path, 'w'), indent=1)
print('merged', len(new), 'print templates;', len(prints), 'print and', len(screens), 'TV in the index')
