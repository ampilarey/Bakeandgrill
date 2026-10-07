#!/usr/bin/env python3
"""The downloadable logo packs in backend/public/brand/ (owner, 2026-10-07).

  python3 scripts/brand-packs.py                 the logo pack
  python3 scripts/brand-packs.py <video-dir>     and the animated pack, from the
                                                 output of brand-animated-logo-video.mjs

Run scripts/brand-icons.py and brand-animated-logo.py first; this only collects.
"""
import os, sys, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PUB = os.path.join(ROOT, 'backend/public')
BRAND = os.path.join(PUB, 'brand')

COLOURS = """Brand colours (from the mark itself)

Rust          #B74B0C   buttons, links, prices, headings that need colour
Dark brown    #1C1408   text, dark backgrounds
Golden amber  #CA7D1C   a warm supporting tone, use sparingly
Cream         #F7F5F2   paper and page background

On a black or dark brown background use the lighter rust #C56F3D so it stays readable.
"""

LOGO_README = """Bake & Grill Cafe - logo pack (updated 2026-10-07)

logo-light.png             Flame with brown lettering, see-through background. The logo. Use on white or cream.
logo-light-cream.png       The same on solid cream (#F8F6F3), square. Use where see-through is not allowed.
logo-dark.png              The same artwork with cream lettering, see-through. Use on dark screens and dark print.
logo-mark.png              The flame alone, see-through background. Use small: icons, favicons, stickers.
profile-picture-1080.png   The logo on cream, sized to sit inside a round crop: Facebook, Instagram, WhatsApp, Telegram.
app-icon-512.png           The logo on a cream square: app icons.
app-icon-maskable-512.png  The same with room around it, for Android icons cut to a circle.
link-preview-1200x630.png  The picture shown when a link to the site is shared.
favicon.ico                The browser tab icon (the flame).
default-item-image.png     Cream 4:3 tile with the logo in a soft circle. The stand-in for menu items with no photo.
logo-animated.svg          The logo with flickering, glowing flames, brown lettering. For websites on light backgrounds.
logo-animated-dark.svg     The same with cream lettering, for dark backgrounds. Open either in a web browser to see it move.

Videos and a GIF of the moving logo, for Facebook, Instagram and the like, are in
bake-and-grill-animated-logo-pack.zip.

The old black-square logo is retired: do not use it.
The top of the "&" is gold all the way up (the earlier files had a dark strip there):
replace any older copies you have handed out.

""" + COLOURS

ANIMATED_README = """Bake & Grill Cafe - the logo with moving flames (2026-10-07)

Every clip is 10 seconds and loops without a jump.

logo-animated-light-square.mp4   1080 x 1080, cream background. Facebook and Instagram posts, WhatsApp status, screens.
logo-animated-dark-square.mp4    The same on dark brown, cream lettering.
logo-animated-light-story.mp4    1080 x 1920 (upright). Facebook and Instagram stories and reels, TikTok, WhatsApp status.
logo-animated-dark-story.mp4     The same on dark brown.
logo-animated.gif                480 x 480. Where only a GIF will play: chats, email signatures, forums.
logo-animated-transparent.webm   See-through background, for video editing apps (CapCut, Premiere, Canva video) and websites.
logo-animated.svg                The original, sharp at any size, for websites (light background).
logo-animated-dark.svg           The same for dark backgrounds.
profile-picture-1080.png         Still logo for profile pictures: those must be a still picture on most platforms.

Where it can and cannot move

Facebook and Instagram posts, stories, reels: upload the MP4 (square for posts, story for stories and reels).
Facebook page cover: upload the square MP4 as a cover video if your page offers it; otherwise use a still.
Profile pictures (Facebook, Instagram, WhatsApp, Google): a still picture. Use profile-picture-1080.png.
WhatsApp: the MP4 or the GIF in chats and status.
Websites: the SVG files.
SVG files do not upload to social media; use the MP4 or GIF there.

""" + COLOURS


def pack(out, folder, readme, files):
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(folder + '/', '')
        z.writestr(folder + '/README.txt', readme)
        for name, path in files:
            z.write(path, f'{folder}/{name}')
    print(out, os.path.getsize(out), 'bytes')


pack(os.path.join(BRAND, 'bake-and-grill-logo-pack.zip'), 'bake-and-grill-logo-pack', LOGO_README, [
    ('logo-light.png', f'{BRAND}/logo-light.png'),
    ('logo-light-cream.png', f'{BRAND}/logo-light-cream.png'),
    ('logo-dark.png', f'{BRAND}/logo-dark.png'),
    ('logo-mark.png', f'{BRAND}/logo-mark.png'),
    ('profile-picture-1080.png', f'{BRAND}/profile-picture-1080.png'),
    ('app-icon-512.png', f'{PUB}/icon-512.png'),
    ('app-icon-maskable-512.png', f'{PUB}/icon-maskable-512.png'),
    ('link-preview-1200x630.png', f'{BRAND}/og-default.png'),
    ('favicon.ico', f'{PUB}/favicon.ico'),
    ('default-item-image.png', f'{BRAND}/default-item-image.png'),
    ('logo-animated.svg', f'{BRAND}/logo-animated.svg'),
    ('logo-animated-dark.svg', f'{BRAND}/logo-animated-dark.svg'),
])

if len(sys.argv) > 1:
    v = sys.argv[1]
    clips = ['logo-animated-light-square.mp4', 'logo-animated-dark-square.mp4', 'logo-animated-light-story.mp4',
             'logo-animated-dark-story.mp4', 'logo-animated.gif', 'logo-animated-transparent.webm']
    pack(os.path.join(BRAND, 'bake-and-grill-animated-logo-pack.zip'), 'bake-and-grill-animated-logo-pack', ANIMATED_README,
         [(c, os.path.join(v, c)) for c in clips] + [
             ('logo-animated.svg', f'{BRAND}/logo-animated.svg'),
             ('logo-animated-dark.svg', f'{BRAND}/logo-animated-dark.svg'),
             ('profile-picture-1080.png', f'{BRAND}/profile-picture-1080.png'),
         ])
