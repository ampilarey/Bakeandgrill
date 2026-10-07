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
print('done')
