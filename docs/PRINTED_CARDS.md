# Printed cards

Discount, gift, promo-code, loyalty stamp and handout cards, designed in Admin and printed on
any plastic card printer or on A4 (owner, 2026-10-18: a Matica 210, "should not limit to a
specific card brand").

## Where

- **Promotions → Printed cards** (`/promotions/cards`, `promotions.manage`): saved designs, the
  live preview (front and back), Make PDF, and the print log.
- **Print** buttons on a gift card just issued, a promo code, a discount card, and **Print all
  cards** on a discount card batch open the same printing in a pop-up (`PrintCardModal`), with
  a saved design to pick.

## How it works with any printer

Every card printer's driver prints a PDF whose page is the card. The PDF from **Card printer**
has one card face per page at the card's exact size (CR80 is 85.6 × 53.98 mm, the bank-card
size every brand takes), backgrounds running to the edge. In the print window: pick the card
printer, set its card size to match in the driver's settings (and edge to edge if offered), and
print at **Actual size / 100%**, never Fit.

- **Both sides**: front then back of each card, for a printer that prints both sides.
- **Fronts, then backs**: every front, then every back, for a one-sided printer: print, turn the
  stack over, feed it again. Backs carry no code, so their order does not matter.
- **A4 sheet**: as many cards as fit (ten CR80) with cut marks; a back sheet mirrors its columns.

## What is on a card

Designs (`card_designs`, `App\Domains\Cards\CardSpec`): Classic, Photo (a picture from the media
library, darkened), Minimal (cream with a rust edge, serif headline) and Stamp card (4 to 12
stamps on the back, the last one free); sizes CR80, CR79, CR100, business card or typed; wide
or tall; rust, dark brown, golden amber or cream; English, Dhivehi or both. The big line is the
card's value unless typed ("20% OFF", "MVR 500.00").

Codes (`App\Domains\Cards\CardSource`): a discount card batch prints a different code on every
card, numbered "No. 12 of 200", and a range reprints a misprint; a promo prints its one code;
a gift card prints the code only while it is known (just issued), checked against its hash; a
handout or stamp card has no code. The QR opens the order app with the code filled in at
checkout (`/order/?promo=` or `?gift=`, `apps/online-order-web/src/lib/cardCode.ts`).

The PDF comes back in the API reply, never through a link, because a gift card's code spends
money. Each print is logged (`card_prints`) and audited (`cards.printed`). A discount batch also
needs `promotions.discount_cards`.

Rendering: `CardSheet` lays each face out as boxes in mm and `cards/sheet.blade.php` draws them
for the browser preview and for dompdf alike, with the label fonts (`labels.partials.fonts`) and
Dhivehi in visual order for the PDF (`ThaanaVisual`); a photo is cropped to the card by GD
(`CardImages`). `PrintedCardsTest`, `cardCode.test.ts`.
