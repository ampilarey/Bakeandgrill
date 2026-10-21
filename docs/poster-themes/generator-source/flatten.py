"""backdrop.svg -> backdrop.json: draw list in the PdfX4Document::fillPath op format."""
import re, json, sys
from svgelements import (SVG, Shape, Path, Move, Line, Close, CubicBezier, QuadraticBezier, Arc)


def hexcol(c):
    return None if c is None or c.value is None else '#%02X%02X%02X' % (c.red, c.green, c.blue)


def grads(raw):
    out = {}
    for m in re.finditer(r'<(linear|radial)Gradient id="([^"]+)"([^>]*)>(.*?)</\1Gradient>', raw, re.S):
        typ, gid, attrs, body = m.groups()
        a = dict(re.findall(r'(\w+)="([^"]+)"', attrs))
        stops = [[float(o), c.upper()] for o, c in re.findall(r'offset="([^"]+)" stop-color="([^"]+)"', body)]
        g = {'type': typ, 'units': 'objectBoundingBox', 'stops': stops}
        if typ == 'linear':
            g['coords'] = [float(a.get(k, d)) for k, d in (('x1', 0), ('y1', 0), ('x2', 0), ('y2', 1))]
        else:
            g['coords'] = [float(a.get(k, d)) for k, d in (('cx', .5), ('cy', .5), ('r', .5))]
        out[gid] = g
    return out


def clips(raw):
    return {cid: [float(x), float(y), float(w), float(h)] for cid, x, y, w, h in
            re.findall(r'<clipPath id="([^"]+)"><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/></clipPath>', raw)}


def r3(v):
    return round(float(v), 3)


def ops_of(shape):
    ops = []
    for seg in Path(shape).segments():
        if isinstance(seg, Move):
            ops.append(['M', [r3(seg.end.x), r3(seg.end.y)]])
        elif isinstance(seg, Close):
            ops.append(['Z', []])
        elif isinstance(seg, Line):
            ops.append(['L', [r3(seg.end.x), r3(seg.end.y)]])
        elif isinstance(seg, CubicBezier):
            ops.append(['C', [r3(seg.control1.x), r3(seg.control1.y), r3(seg.control2.x), r3(seg.control2.y), r3(seg.end.x), r3(seg.end.y)]])
        elif isinstance(seg, QuadraticBezier):
            p0, c, p = seg.start, seg.control, seg.end
            ops.append(['C', [r3(p0.x + 2/3*(c.x-p0.x)), r3(p0.y + 2/3*(c.y-p0.y)), r3(p.x + 2/3*(c.x-p.x)), r3(p.y + 2/3*(c.y-p.y)), r3(p.x), r3(p.y)]])
        elif isinstance(seg, Arc):
            for cb in seg.as_cubic_curves():
                ops.append(['C', [r3(cb.control1.x), r3(cb.control1.y), r3(cb.control2.x), r3(cb.control2.y), r3(cb.end.x), r3(cb.end.y)]])
    return ops


def flatten(svg_path, page_w=426.0):
    raw = open(svg_path).read()
    G, C = grads(raw), clips(raw)
    doc = SVG.parse(svg_path, reify=True, ppi=25.4)
    sx = page_w / doc.width if doc.width else 1
    items = []
    for e in doc.elements():
        if not isinstance(e, Shape):
            continue
        eid = getattr(e, 'id', None) or ''
        if eid.startswith('__photo_marker_'):
            items.append({'photo_slot': eid[len('__photo_marker_'):]})
            continue
        e = e * f'scale({sx})'
        ops = ops_of(e)
        if not ops:
            continue
        fr = (e.values.get('fill') or '').strip()
        item = {'ops': ops}
        if fr.startswith('url('):
            gid = fr[5:-1]
            item['fill'] = {'gradient': G[gid]}
            bb = Path(e).bbox()
            item['bbox'] = [r3(bb[0]), r3(bb[1]), r3(bb[2] - bb[0]), r3(bb[3] - bb[1])]
        elif fr == 'none':
            item['fill'] = None
        else:
            item['fill'] = hexcol(e.fill)
        op = float(e.values.get('opacity', 1) or 1) * float(e.values.get('fill-opacity', 1) or 1)
        if op < 0.999:
            item['opacity'] = round(op, 3)
        if e.values.get('fill-rule') == 'evenodd':
            item['rule'] = 'evenodd'
        st = e.values.get('stroke')
        if st and st != 'none' and hexcol(e.stroke):
            item['stroke'] = {'colour': hexcol(e.stroke), 'width_mm': r3(e.stroke_width * sx),
                              'dash': e.values.get('stroke-dasharray'), 'cap': e.values.get('stroke-linecap', 'butt')}
        cp = e.values.get('clip-path')
        if cp and cp.startswith('url('):
            item['clip_rect'] = C.get(cp[5:-1])
        if item['fill'] is None and 'stroke' not in item:
            continue
        items.append(item)
    return items


if __name__ == '__main__':
    it = flatten(sys.argv[1])
    json.dump(it, open(sys.argv[2], 'w'), separators=(',', ':'))
    print(len(it), 'items')
