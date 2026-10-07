"""Brand icons from the current light logo (owner, 2026-09-30 / 2026-10-07)."""
import sys, os
from PIL import Image

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend', 'public', 'brand')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'brand-icons-out'
os.makedirs(OUT, exist_ok=True)
CREAM = (247, 245, 242, 255)          # docs/brand/PALETTE.md "Cream" #F7F5F2
CREAM_TEXT = (255, 253, 249)          # #FFFDF9, lettering on dark

def tight(im):
    return im.crop(im.getbbox())

light = tight(Image.open(f'{SRC}/logo-light.png').convert('RGBA'))
mark = tight(Image.open(f'{SRC}/logo-mark.png').convert('RGBA'))

def place(canvas_size, logo, fill, bg, nudge_up=0.0):
    w, h = canvas_size
    c = Image.new('RGBA', canvas_size, bg)
    scale = min(w * fill / logo.width, h * fill / logo.height)
    lg = logo.resize((max(1, round(logo.width * scale)), max(1, round(logo.height * scale))), Image.LANCZOS)
    x = (w - lg.width) // 2
    y = (h - lg.height) // 2 - round(h * nudge_up)
    c.alpha_composite(lg, (x, y))
    return c

def save(img, name, opaque=False):
    p = os.path.join(OUT, name)
    (img.convert('RGB') if opaque else img).save(p, optimize=True)
    return p

# Home-screen / app icons: cream tile, the full logo. iOS fills transparency
# with black, so every touch / app icon is opaque.
for size in (192, 512):
    save(place((size, size), light, 0.80, CREAM), f'icon-{size}.png', opaque=True)
save(place((180, 180), light, 0.80, CREAM), 'apple-touch-icon.png', opaque=True)
# Maskable: Android crops to a circle inside the inner 80%; keep the logo in ~60%.
save(place((512, 512), light, 0.60, CREAM), 'icon-maskable-512.png', opaque=True)

# Browser tab: the flame alone reads at 16 px where "B&G CAFE" cannot.
fav32 = place((32, 32), mark, 0.94, (0, 0, 0, 0))
save(fav32, 'favicon-32.png')
ico_src = place((256, 256), mark, 0.94, (0, 0, 0, 0))
ico_src.save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])

# The logo on a dark surface: same artwork, lettering in cream, no black square.
dark = Image.open(f'{SRC}/logo-light.png').convert('RGBA')
px = dark.load()
for yy in range(dark.height):
    for xx in range(dark.width):
        r, g, b, a = px[xx, yy]
        if a == 0:
            continue
        mx, mn = max(r, g, b), min(r, g, b)
        sat = 0 if mx == 0 else (mx - mn) / mx
        # The brown lettering (dark, low colour); flames are bright and saturated.
        if mx < 110 and sat < 0.75:
            px[xx, yy] = (*CREAM_TEXT, a)
save(dark, 'logo-dark.png')

# Plain logo files (transparent, the light logo) and the in-app badge.
save(Image.open(f'{SRC}/logo-light.png').convert('RGBA'), 'logo.png')

# Link previews (WhatsApp, Facebook…): 1200x630 cream card.
save(place((1200, 630), light, 0.78, CREAM), 'og-default.png', opaque=True)
# Profile pictures (Facebook, Instagram, WhatsApp, Telegram crop to a circle):
# 1080 square, the whole logo inside the circle.
save(place((1080, 1080), light, 0.64, CREAM), 'profile-picture-1080.png', opaque=True)

# The light logo on a cream square, and the stand-in tile for menu items with no
# photo (cream 4:3, the logo in a soft circle). Same geometry as the first build
# (2026-09-30); remade here so a change to logo-light.png reaches them too.
PAGE = (248, 246, 243, 255)           # #F8F6F3
def bounds(im):
    return im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
def on_square(size, scale, bg):
    x0, y0, x1, y1 = bounds(full)
    w, h = x1 - x0, y1 - y0
    s = size * scale / max(w, h)
    lg = full.crop((x0, y0, x1, y1)).resize((round(w * s), round(h * s)), Image.LANCZOS)
    c = Image.new('RGBA', (size, size), bg)
    c.alpha_composite(lg, (round((size - w * s) / 2), round((size - h * s) / 2)))
    return c
full = Image.open(f'{SRC}/logo-light.png').convert('RGBA')
save(on_square(1080, 0.78, PAGE), 'logo-light-cream.png', opaque=True)
from PIL import ImageDraw
tile = Image.new('RGBA', (1200, 900), PAGE)
ImageDraw.Draw(tile).ellipse((200, 50, 1000, 850), fill=(0xF1, 0xE7, 0xDC, 255))
tile.alpha_composite(on_square(900, 0.6, (0, 0, 0, 0)), (150, 0))
save(tile, 'default-item-image.png', opaque=True)

# logo.svg (site root): the light logo, trimmed, as a picture inside an SVG.
import base64, io
buf = io.BytesIO()
light.resize((326, 512), Image.LANCZOS).save(buf, 'PNG', optimize=True)
with open(os.path.join(OUT, 'logo.svg'), 'w') as f:
    f.write('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="326" height="512" viewBox="0 0 326 512">'
            '<title>Bake &amp; Grill</title><image width="326" height="512" href="data:image/png;base64,'
            + base64.b64encode(buf.getvalue()).decode() + '"/></svg>\n')
print('done')
