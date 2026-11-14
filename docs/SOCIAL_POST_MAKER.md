# Social post maker

Social Hub → **Make a post**. Built 2026-11-14 for the owner: "a separate poster maker for social media platforms.
It should be easy. One click and adding different items like price, Order now. From 1 poster automatically makes
poster for different platforms", then "many different designs. Easy use. Saved for later. One click and change the
design and layout but information remains same".

## How to use it

1. **What is it for?** Search the menu and pick a dish: its name, price and photo fill in (an offer price brings the
   old price too). Or type a Headline and a Price. Pick a photo opens the Media Library.
2. **Pick a design.** Start from a ready-made post (New dish, Today's offer, Price drop, Best seller, Back in stock,
   Free delivery, Call to order, Scan to order, Weekend special, Frozen pack, Limited time, Simple and clean): one tap
   sets the design, the colour, the parts and the usual words, and leaves your headline, price and photo alone. Or
   tap any of the twenty designs and twenty colours, four hundred looks. Surprise me picks a design and a colour; the
   arrows step through the designs.
3. **Add or remove parts.** Switches for Price, Old price, Sticker, Order button, Second button, Phone number,
   Website, Logo, QR code, Small line above and Line below. Two buttons sit side by side ("Order now" and "Call us");
   Button style draws the main one Filled, Outline or in the Highlight colour, or leaves it as the design has it. A part's box shows only while it is on. Sticker and button words have
   one-tap suggestions.
4. **Save it for later.** A saved post keeps its words, photo and design. Open it next week, change the price, save.

The picture is shown in four shapes, all made from the same post:

| Shape | Size | For |
|---|---|---|
| Feed post | 1080 × 1350 | Instagram and Facebook |
| Square | 1080 × 1080 | Viber, Telegram, any feed |
| Story | 1080 × 1920 | Stories, WhatsApp status, TikTok |
| Wide | 1200 × 630 | A Facebook link, a website banner |

**Download** saves the shape on screen, **All 4 sizes** saves each. **Share** (phones) hands the picture to another
app. **Post it** opens the Social Hub composer with the picture and a caption ready for the connected channels
(Facebook, Instagram, Telegram, Viber). TikTok and WhatsApp status are posted from the phone with the Story picture.

## How it is built

- `apps/admin-dashboard/src/components/socialposter/`
  - `types.ts`: `PostSpec` (the words, the photo, which parts show), `LAYOUTS`, `PALETTES`, `SIZES`, `captionOf()`.
  - `draw.ts`: `renderPost(ctx, W, H, spec, layout, palette, assets)`. Lengths are shares of the picture's short
    side, so a thumbnail and the full picture are the same drawing. Each layout places its parts by shape (wide,
    square, tall) and never crops. `stack()` sets the words and shrinks them together until they fit their box.
  - `assets.ts`: the fonts (the site's own, from `/fonts/`) and pictures, loaded once.
  - `SocialPosterMaker.tsx`: the screen.
- Server: `social_posters` (name, layout, palette, spec), `SocialPosterController` under `/api/admin/social/posters`.
  Reading needs `social.view`; saving, deleting and sending a picture check `social.compose`. A picture sent to be
  posted is redrawn as a JPEG and kept under `storage/app/public/social-posters/`.

## Adding to it

- A design: a function in `LAYOUT_DRAW` (`draw.ts`) and a row in `LAYOUTS`. Draw for `wide` and for the rest; check
  all four shapes with a long headline and with every part on.
- A ready-made post: a row in `TEMPLATES` (a real layout key and colour key, the parts to switch, the usual words).
- A colour: a row in `PALETTES` (ground and its ink, second colour and its ink, highlight and its ink).
- A part: a key in `PartKey`, `PART_NAMES`, `PART_ORDER`, `blankSpec()`, the controller's `PARTS`, and where it draws.

## Not built

- Your real pack label drawn on a pouch in the picture, as in the sample the owner sent.
- More than one dish on a post.
- Posting to stories, TikTok or WhatsApp status from here (those platforms do not let a site do it).
