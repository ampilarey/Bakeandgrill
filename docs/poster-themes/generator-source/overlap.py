import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib, kit5
from catalog import entries
def ov(a, b, pad=0.5):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    return ax < bx + bw - pad and bx < ax + aw - pad and ay < by + bh - pad and by < ay + ah - pad
bad = 0
for r in entries():
    lib.EXPORT = []; kit5._PN[0] = 0
    r['fn'](); sl = [s for s in lib.EXPORT if s['kind'] == 'text' and s['default'].strip()]; lib.EXPORT = None
    for i in range(len(sl)):
        for j in range(i + 1, len(sl)):
            if ov(sl[i]['box'], sl[j]['box']):
                bad += 1; print(r['id'], repr(sl[i]['default'][:24]), '<>', repr(sl[j]['default'][:24]))
    for s in sl:
        x, y, w, h = s['box']
        if x < lib.SAFE - 0.1 or x + w > lib.W - lib.SAFE + 0.1 or y < lib.SAFE - 0.1 or y + h > lib.H - lib.SAFE + 0.1:
            bad += 1; print(r['id'], 'OUTSIDE SAFE', repr(s['default'][:30]), [round(v) for v in s['box']])
print(lib.VARIANT, 'issues', bad)
