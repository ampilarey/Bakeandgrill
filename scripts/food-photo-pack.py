#!/usr/bin/env python3
"""A dish photo pack from a picture on a plain background (a poster, a studio shot).

Owner, 2026-10-10: "Can u make the bajiya in this photo without background and
suitable for other uploads". Writes, into OUT_DIR:

  NAME-cutout.png / .webp          see-through, MASTER px wide: Admin, Menu, item,
                                   Photos & video, 2 Thumbnail cut-out (and labels)
  NAME-menu-photo-1200x900.jpg     4:3 on the menu cream: 1 Main photo
  NAME-white-1200x900.jpg          4:3 on white: delivery apps, other sites
  NAME-square-1080.jpg             1:1 on cream: social posts, WhatsApp catalogue
  NAME-banner-1400x600.jpg         7:3, food on the right: a category banner (the
                                   website writes the name on the left)
  README.txt, NAME-photo-pack.zip

How the cut is made: colour distance from the backdrop (Lab), backdrop = what is
connected to the box's border, the large blobs kept (drops nearby lettering),
holes filled except pockets of plain backdrop, GrabCut to settle the outline,
then edge alpha from the local food colour, (I - B).(F - B) / |F - B|^2, with
the food colour carried out to the edge so no backdrop grey is left in a
part-clear pixel. It needs an even backdrop; a busy one needs a photo editor.

  python3 scripts/food-photo-pack.py POSTER.png bajiya OUT_DIR --box 280,870,1090,1460

Needs OpenCV, numpy and Pillow.
"""
import argparse
import os
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageFilter

CREAM = (248, 246, 243)   # --color-bg, the menu's cream
WHITE = (255, 255, 255)


def cut_out(path, box):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'cannot read {path}')
    if box:
        x0, y0, x1, y1 = box
        img = img[y0:y1, x0:x1]
    crop = img.copy()
    h, w = crop.shape[:2]

    border = np.concatenate([crop[0, :], crop[-1, :], crop[:, 0], crop[:, -1]])
    bg_bgr = np.median(border, axis=0).astype(np.float32)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(np.float32)
    bg_lab = cv2.cvtColor(bg_bgr.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]
    dist = np.sqrt(((lab - bg_lab) ** 2).sum(axis=2))

    # Backdrop: close to its colour and connected to the border.
    low = (dist < 9).astype(np.uint8)
    _, labels = cv2.connectedComponents(low, connectivity=4)
    edge_labels = set(np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])))
    bg = np.isin(labels, [lb for lb in edge_labels if lb != 0]) & (low == 1)

    # The large blobs only, holes filled.
    n, labels, stats, _ = cv2.connectedComponentsWithStats((~bg).astype(np.uint8), connectivity=8)
    areas = stats[1:, cv2.CC_STAT_AREA]
    fg = np.isin(labels, [i + 1 for i, a in enumerate(areas) if a > 0.05 * areas.max()])
    cnts, _ = cv2.findContours(fg.astype(np.uint8) * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros((h, w), np.uint8)
    cv2.drawContours(filled, cnts, -1, 255, thickness=cv2.FILLED)
    fg = filled > 0

    # GrabCut settles the outline.
    gc = np.full((h, w), cv2.GC_BGD, np.uint8)
    k9 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    gc[cv2.dilate(fg.astype(np.uint8), k9, iterations=1) == 1] = cv2.GC_PR_BGD
    gc[fg] = cv2.GC_PR_FGD
    gc[cv2.erode(fg.astype(np.uint8), k9, iterations=2) == 1] = cv2.GC_FGD
    cv2.grabCut(crop, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    hard = np.isin(gc, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
    cnts, _ = cv2.findContours(hard * 255, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    biggest = max(cv2.contourArea(c) for c in cnts)
    hard = np.zeros((h, w), np.uint8)
    cv2.drawContours(hard, [c for c in cnts if cv2.contourArea(c) > 0.05 * biggest], -1, 1, thickness=cv2.FILLED)

    # Pockets of plain backdrop the fill closed over go back to clear.
    n, plabels, pstats, _ = cv2.connectedComponentsWithStats(((dist < 6.0) & (hard == 1)).astype(np.uint8), connectivity=8)
    for i in range(1, n):
        if pstats[i, cv2.CC_STAT_AREA] >= 12:
            hard[plabels == i] = 0

    # Edge alpha from the local food colour.
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    interior = cv2.erode(hard, k3, iterations=2)
    f_est = cv2.inpaint(crop, (interior == 0).astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA).astype(np.float32)
    crop_f = crop.astype(np.float32)
    fb = f_est - bg_bgr
    denom = (fb ** 2).sum(axis=2)
    a_local = np.clip(((crop_f - bg_bgr) * fb).sum(axis=2) / np.maximum(denom, 1e-6), 0.0, 1.0)
    a_dist = np.clip((dist - 4.0) / 18.0, 0.0, 1.0)
    outer = cv2.dilate(hard, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)), iterations=1)
    band = (outer == 1) & (interior == 0)
    alpha = np.zeros((h, w), np.float32)
    alpha[interior == 1] = 1.0
    edge = np.where(denom > 30.0 ** 2, a_local, a_dist)
    alpha[band] = edge[band]
    alpha[outer == 0] = 0.0
    alpha = np.where(band, cv2.GaussianBlur(alpha, (3, 3), 0.7), alpha)
    alpha[alpha < 0.04] = 0.0

    rgb = np.clip(np.where(band[..., None], f_est, crop_f), 0, 255).astype(np.uint8)
    rgba = cv2.cvtColor(rgb, cv2.COLOR_BGR2BGRA)
    rgba[..., 3] = np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8)
    ys, xs = np.where(rgba[..., 3] > 8)
    pad = 12
    rgba = rgba[max(0, ys.min() - pad):min(h, ys.max() + pad + 1), max(0, xs.min() - pad):min(w, xs.max() + pad + 1)]
    return Image.fromarray(cv2.cvtColor(rgba, cv2.COLOR_BGRA2RGBA))


def resize_rgba(img, size):
    """Resize in premultiplied space so edges keep no dark or light rim."""
    return img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def master(img, width):
    up = resize_rgba(img, (width, round(img.height * width / img.width)))
    rgb = up.convert('RGB')
    sharp = rgb.filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
    alpha = up.split()[3]
    rgb.paste(sharp, (0, 0), alpha.point(lambda a: 255 if a >= 250 else 0))  # solid food only
    return Image.merge('RGBA', (*rgb.split(), alpha))


def compose(cut, size, bg, box_frac, centre_frac):
    cw, ch = size
    s = min(cw * box_frac[0] / cut.width, ch * box_frac[1] / cut.height)
    item = resize_rgba(cut, (round(cut.width * s), round(cut.height * s)))
    x = round(cw * centre_frac[0] - item.width / 2)
    y = round(ch * centre_frac[1] - item.height / 2)
    canvas = Image.new('RGBA', size, bg + (255,))
    # A soft shadow from the food's own outline, dropped a little.
    tint = Image.new('RGBA', item.size, (70, 45, 20, 255))
    tint.putalpha(item.split()[3].point(lambda v: int(v * 0.38)))
    shadow = Image.new('RGBA', size, (0, 0, 0, 0))
    shadow.alpha_composite(tint, (x, y + max(4, round(item.height * 0.022))))
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(max(6, round(item.height * 0.03)))))
    canvas.alpha_composite(item, (x, y))
    return canvas.convert('RGB')


README = """{title} photo pack

{name}-cutout.png
  See-through background. Admin > Menu > {title} > Photos & video >
  2 Thumbnail cut-out. The menu cards float it over a circle, and pack labels
  use it when the item has no label photo of its own.
{name}-cutout.webp
  The same picture, a smaller file.
{name}-menu-photo-1200x900.jpg
  Admin > Menu > {title} > Photos & video > 1 Main photo. On the menu's cream.
{name}-white-1200x900.jpg
  The same on white, for delivery apps and other sites.
{name}-square-1080.jpg
  Social posts, the WhatsApp catalogue.
{name}-banner-1400x600.jpg
  A category banner. The food sits on the right because the website writes the
  category name on the left.

Cut from a {src_w} x {src_h} px picture of the dish; the larger sizes are enlarged from it.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('name')
    ap.add_argument('out')
    ap.add_argument('--box', help='x0,y0,x1,y1 around the dish, on a plain backdrop')
    ap.add_argument('--title', help='name as Admin shows it (default: NAME capitalised)')
    ap.add_argument('--master', type=int, default=1200, help='cut-out width in px')
    args = ap.parse_args()

    box = tuple(int(v) for v in args.box.split(',')) if args.box else None
    os.makedirs(args.out, exist_ok=True)
    raw = cut_out(args.src, box)
    cut = master(raw, args.master)
    n = args.name
    files = {}

    def save(img, filename, **kw):
        path = os.path.join(args.out, filename)
        img.save(path, **kw)
        files[filename] = path

    save(cut, f'{n}-cutout.png', optimize=True)
    save(cut, f'{n}-cutout.webp', quality=90, method=6)
    jpg = dict(quality=90, optimize=True, progressive=True)
    save(compose(cut, (1200, 900), CREAM, (0.84, 0.76), (0.5, 0.52)), f'{n}-menu-photo-1200x900.jpg', **jpg)
    save(compose(cut, (1200, 900), WHITE, (0.84, 0.76), (0.5, 0.52)), f'{n}-white-1200x900.jpg', **jpg)
    save(compose(cut, (1080, 1080), CREAM, (0.84, 0.70), (0.5, 0.53)), f'{n}-square-1080.jpg', **jpg)
    save(compose(cut, (1400, 600), CREAM, (0.50, 0.80), (0.70, 0.52)), f'{n}-banner-1400x600.jpg', **jpg)

    readme = os.path.join(args.out, 'README.txt')
    with open(readme, 'w', encoding='utf-8') as fh:
        fh.write(README.format(title=args.title or n.capitalize(), name=n, src_w=raw.width, src_h=raw.height))
    files['README.txt'] = readme

    zpath = os.path.join(args.out, f'{n}-photo-pack.zip')
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for filename, path in files.items():
            z.write(path, filename)
    for filename in [*files, os.path.basename(zpath)]:
        path = os.path.join(args.out, filename)
        print(f'{filename:34s} {os.path.getsize(path) // 1024:5d} KB')


if __name__ == '__main__':
    main()
