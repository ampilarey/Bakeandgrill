/*
 * The admin's Help (owner, 2026-11-10: "there are lots of different features that I don't know how
 * to use"). Short task guides, not a manual: each is a thing someone wants to do, a few steps in
 * the screen's own words, and a button that opens the right screen.
 *
 * A guide belongs to one page of the menu (`page` is that page's path in navConfig.ts), so it
 * shows to whoever may open that page, and the "?" in the top bar opens the guides of the page
 * you are on. When a screen changes, its guide changes in the same commit. `guides.test.ts` holds
 * every guide to a real page and every page to either a guide or a place on the waiting list.
 */

export type Guide = {
  /** Stable id, used in links (`/help?guide=<id>`). */
  id: string;
  /** The menu page it belongs to: a `to` from navConfig.ts. */
  page: string;
  /** What the reader wants to do, as they would say it. */
  title: string;
  /** One line on when to use it, or what it is. */
  about?: string;
  steps: string[];
  /** Good to know: limits, what happens next, common surprises. */
  notes?: string[];
  /** The screen to open, when it is not simply the page. */
  open?: { to: string; label: string };
  /** Extra words a search should find it by. */
  words?: string;
};

export const GUIDES: Guide[] = [
  // ── Promotions ────────────────────────────────────────────────────────────
  {
    id: 'offer-period',
    page: '/promotions',
    title: 'Give a discount on every order for a day or a few hours',
    about: 'For example 10% off everything this Friday from 12 to 3.',
    open: { to: '/promotions/offers', label: 'Open Offers' },
    steps: [
      'Open Promotions → Offers and tap + New Promo.',
      'Tick "Automatic (all customers, no code)" at the top.',
      'Type a Promo Name. Customers and cashiers see this name.',
      'Set Discount Type to Percentage and type the value, for example 10.',
      'Set Starts At and Expires At.',
      'Tap Save Promo.',
    ],
    notes: [
      'The discount goes on by itself at the till and in the order app. The cart shows "Offer" with its name.',
      'It is decided when the order is saved. A ticket saved before the end keeps the discount even if it is paid after.',
    ],
    words: 'sale percent off happy hour automatic period date time',
  },
  {
    id: 'offer-first-customers',
    page: '/promotions',
    title: 'Give the first 50 customers a discount or a free item',
    open: { to: '/promotions/offers', label: 'Open Offers' },
    steps: [
      'Open Promotions → Offers and tap + New Promo.',
      'Tick "Automatic (all customers, no code)", or leave it off and type a Code.',
      'Choose the Discount Type: Percentage (for example 15) or Free item.',
      'Under "What the customer must buy / what they get", choose They get, pick the Item or Category by name and tap Add.',
      'Type 50 in "Max uses (all customers)" and 1 in "Uses per customer".',
      'Tap Save Promo.',
    ],
    notes: [
      'With a limit per customer, the order needs a customer on it. At the till, add the customer to the ticket first.',
      'The menu does not show the lower price for this kind of offer. It comes off when the order is made.',
      'The list shows how many have been used, for example 12 / 50.',
    ],
    words: 'limited first fifty once per customer launch opening',
  },
  {
    id: 'offer-some-orders',
    page: '/promotions',
    title: 'Make an offer for dine-in only, or for the order app only',
    open: { to: '/promotions/offers', label: 'Open Offers' },
    steps: [
      'Open the offer, or make a new one with + New Promo.',
      'Find "Which orders".',
      'Under "Where ordered" pick At the counter (till) or Order app.',
      'Under "Order type" pick Dine-in, Takeaway, Pickup or Delivery. You can pick more than one.',
      'Tap Save Promo.',
    ],
    notes: [
      'Nothing picked means every order.',
      'At the till the offer shows once the cashier has chosen the order type.',
      'If a saved ticket is switched from dine-in to takeaway, a dine-in offer comes off by itself.',
    ],
    words: 'online only app only takeaway delivery pickup channel',
  },
  {
    id: 'offer-free-with',
    page: '/promotions',
    title: 'Give a free item when the customer buys another',
    about: 'For example a free roshi with every curry.',
    open: { to: '/promotions/offers', label: 'Open Offers' },
    steps: [
      'Tap + New Promo and tick "Automatic (all customers, no code)".',
      'Set Discount Type to Free item.',
      'Under "What the customer must buy / what they get", choose Customer must buy, pick the item (the curry) and tap Add.',
      'Choose They get, pick the free item (the roshi) and tap Add.',
      'Under "How many free" choose One per order, or One for each item the customer must buy.',
      'Tap Save Promo.',
    ],
    notes: [
      'The free item must be on the order. The order app and the till prompt "You\'ve earned a free …" so it can be added.',
    ],
    words: 'buy one get one bogo combo free with gift',
  },
  {
    id: 'offer-code',
    page: '/promotions',
    title: 'Make a promo code',
    open: { to: '/promotions/offers', label: 'Open Offers' },
    steps: [
      'Tap + New Promo and leave "Automatic" unticked.',
      'Type a Promo Name and the Code the customer will type, for example RAMADAN20.',
      'Choose the Discount Type and its value.',
      'Optional: Min Order Amount, Max uses, Uses per customer, Starts At and Expires At.',
      'Tap Save Promo.',
    ],
    notes: [
      'For one customer only, pick them under "Restrict to Specific Customer".',
      'The customer types the code at checkout in the order app. At the till the cashier types it on the ticket.',
    ],
    words: 'coupon voucher code',
  },
  {
    id: 'offers-overlap',
    page: '/promotions',
    title: 'Decide what happens when two offers fit one order',
    open: { to: '/promotions/controls', label: 'Open Controls' },
    steps: [
      'Open Promotions → Controls.',
      'Find "When offers overlap".',
      'Choose Best one wins (the customer gets the bigger one) or Add them up (they get both).',
      'Save.',
    ],
    notes: [
      'Under Best one wins, a code smaller than an offer already on the ticket is refused, and the till says why.',
      'Free delivery always comes on top of the rest.',
      'A manual discount by the cashier also comes on top, within the caps set on this same page.',
    ],
    words: 'stack stacking combine two discounts best wins',
  },
  {
    id: 'discount-cards',
    page: '/promotions',
    title: 'Print discount cards to hand out',
    open: { to: '/promotions/discount-cards', label: 'Open Discount cards' },
    steps: [
      'Open Promotions → Discount cards and tap Issue cards.',
      'Type a Name, choose percentage or a fixed amount, and its value.',
      'Set the Quantity (up to 50 at a time) and Uses per card.',
      'Optional: Valid from, Expires and a minimum order.',
      'Tap Issue. Each card gets its own code.',
      'Tap Print all cards to print them, or Copy codes.',
    ],
    notes: [
      'A lost or misused card can be stopped: open the batch with View and tap Void on that card.',
    ],
    words: 'voucher card printed vip staff meal',
  },
  {
    id: 'daily-special',
    page: '/specials',
    title: 'Put a dish on special price',
    about: 'A lower menu price on one dish for a day or a period. The menu shows the new price.',
    steps: [
      'Open Daily Specials and tap + Add Discount.',
      'Pick the Menu Item, then type the Discount % or the Special Price. A dish with sizes has a row for each size.',
      'Set the Start Date and End Date. Start Time and End Time are optional.',
      'Save.',
    ],
    notes: [
      'Use Daily Specials when the price itself should look lower on the menu. Use Promotions → Offers for discounts on the whole order, codes and free items.',
    ],
    words: 'special price sale dish discount menu price today',
  },

  // ── Money ─────────────────────────────────────────────────────────────────
  {
    id: 'gst-off',
    page: '/finance',
    title: 'Stop charging GST on every bill',
    about: 'One switch. Off, no bill carries GST, whatever each dish and fee is set to.',
    open: { to: '/gst', label: 'Open GST' },
    steps: [
      'Open Finance → GST and tap the Settings tab.',
      'Switch off Charge GST on sales.',
      'Tap Save settings.',
    ],
    notes: [
      'It covers dishes, the packaging, small-order and delivery fees, the service charge, and wholesale invoices, at the till and online.',
      'Bills already made keep the GST they had.',
      'A till that is already open picks the change up when it is reloaded.',
      'Switch it back on and GST is charged again as each dish and fee is set.',
    ],
    words: 'gst tax off remove no tax 8% bill receipt',
  },
  {
    id: 'invoice-from-po',
    page: '/finance',
    title: 'Make an invoice from a customer\'s purchase order',
    about: 'Upload the PO a resort or company sent. It is read for you, you check it, and the invoice carries the PO number.',
    open: { to: '/finance/invoices', label: 'Open Invoices' },
    steps: [
      'Open Finance → Invoices and tap + From a PO.',
      'Tap Choose the PO (PDF) and pick the file the customer sent. A scan or a photo of the PO works too.',
      'Check the boxes it filled in: PO number, Bill to, Their TIN, Deliver to, Delivery date and each item with its quantity and price.',
      'Look at the totals. It says whether they match the PO\'s total.',
      'Tap Create invoice, then Download the invoice.',
    ],
    notes: [
      'A scan or a photo is read from the picture, which takes a few seconds. It can misread a number, so it says "Read from a scan": check every box and that the totals match the PO.',
      'For a photo, lay the PO flat in good light and fill the frame. A file it cannot read at all is typed by hand, and is still kept with the invoice.',
      'If the PO number already has an invoice it says so, to stop one PO being billed twice.',
      'Switch on Tax invoice only when you want it numbered in your GST series. It needs the customer\'s TIN.',
      'The PO file stays with the invoice: the page icon on its row opens it again.',
      'Search the list by PO number to find the invoice later.',
    ],
    words: 'purchase order po upload pdf scan scanned photo picture resort company invoice bill generate tin tax invoice delivery',
  },
  {
    id: 'check-payments',
    page: '/finance',
    title: 'Check today\'s QR, card and transfer payments',
    about: 'The customer types the QR amount themselves and the card machine is keyed by hand, so each one is ticked against MPOS, the slip or the bank app.',
    open: { to: '/finance/settlements?view=checks', label: 'Open Check payments' },
    steps: [
      'Open Finance → Bank settlements. It opens on Check payments.',
      'Pick the day at the top: Today, Yesterday, or another range.',
      'For each payment compare the amount with MPOS, the slip or the bank app.',
      'Tap Matches when it is the same.',
      'Tap Different when it is not, and type the amount that really arrived. A reference and a note are optional.',
    ],
    notes: [
      'The QR, Card and Transfer boxes at the top filter the list. Tap one again, or Show all, to see everything.',
      'A whole day can be ticked at once when everything matches.',
      'A check never changes the payment. A short payment is collected from the customer or fixed on the order.',
      'A transfer already matched on the bank statement shows "Bank statement" and needs no tick.',
    ],
    words: 'mpos bml qr card machine transfer reconcile settlement match',
  },
  {
    id: 'credit-repayments',
    page: '/customers',
    title: 'See who paid their credit account, and how',
    open: { to: '/customers/credit', label: 'Open Accounts on credit' },
    steps: [
      'Open Customers → Accounts on credit.',
      'Tap Repayments.',
      'Pick the period: Today, Yesterday, Last 7 days, Last 30 days or All.',
      'The boxes show the total, how much was cash and how much to match at the bank.',
      'Filter by Cash, Card (machine), Bank transfer or Online (BML), or search a name or phone.',
    ],
    notes: [
      'A payment the customer made online says "Customer (paid online)" under Recorded by.',
      'Download CSV saves the list as a spreadsheet.',
    ],
    words: 'credit repayment paid owes account receivable',
  },
  {
    id: 'credit-chase',
    page: '/customers',
    title: 'Remind a customer what they owe, or send a pay link',
    open: { to: '/customers/credit', label: 'Open Accounts on credit' },
    steps: [
      'Open Customers → Accounts on credit.',
      'Find the customer. The list shows what each owes and what is overdue.',
      'Tap Send reminder to text them the balance.',
      'Tap Pay link (Send pay link) to text a link they can pay by card.',
    ],
    notes: [
      'When they pay online the account is settled by itself and they get a text.',
      'The credit limit, payment terms and whether credit is open are in Settings → Credit & wallet.',
    ],
    words: 'owe overdue reminder pay link invoice debt',
  },
  {
    id: 'shift-variance',
    page: '/shifts',
    title: 'Read the shift history and the cash difference',
    steps: [
      'Open Shifts & Cash. Live Shifts shows the tills open now.',
      'Tap History for closed shifts.',
      'Variance is the cash counted at close against what the till expected.',
      'Red with a minus is short. Gold with a plus is over. Green is exact.',
      'Tap a row to see the cash put in and taken out during the shift.',
    ],
    notes: [
      'Cashiers open and close their own shift on the till, not here.',
    ],
    words: 'cash drawer short over variance close shift count',
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  {
    id: 'items-sold',
    page: '/reports',
    title: 'See every item sold on a date, or between two times',
    open: { to: '/reports?tab=Items%20Sold', label: 'Open Items Sold' },
    steps: [
      'Open Reports → Sales → Items Sold.',
      'Pick the days with the quick buttons or the From and To dates.',
      'Optional: set the hours, a category, a staff member or an order type.',
      'Each size of a dish is its own row. Tap a name to open that item\'s own page with charts by hour, day and weekday.',
      'Tap Export to save the list.',
    ],
    words: 'sold items quantity best sellers category report hours',
  },
  {
    id: 'ticket-times',
    page: '/reports',
    title: 'See how long orders take',
    open: { to: '/reports?tab=Ticket%20Times', label: 'Open Ticket Times' },
    steps: [
      'Open Reports → Operations → Ticket Times.',
      'Pick the days.',
      'The stages are: rung up to kitchen, cooking, ready to collected, waiting to pay, and the whole ticket.',
      'Typical is the middle ticket. Slow is the time one ticket in ten is slower than.',
      'The slowest tickets are listed at the bottom. Tap one to open its order.',
    ],
    notes: [
      'One order\'s own timeline is on the order: open it in Orders to see each step and the minutes between.',
    ],
    words: 'speed wait time kitchen slow how long timeline',
  },
  {
    id: 'sales-over-time',
    page: '/dashboard',
    title: 'Compare sales with last week or last month',
    steps: [
      'Open the Dashboard and scroll to Sales over time.',
      'Pick a period: Today, This week, Last 30 days, All, or Pick dates.',
      'The tiles show each figure against the period just before. Tap a tile to chart it.',
      'Use the arrows to step back and forward by the same length of time.',
      'Narrow it by time of day, staff or order type.',
    ],
    notes: [
      'Sales count every paid order, whatever stage it is at in the kitchen.',
    ],
    words: 'sales trend compare chart graph revenue',
  },
  {
    id: 'visitors',
    page: '/visitors',
    title: 'See how many people visit the website and order app',
    steps: [
      'Open Website visitors.',
      'Pick a period at the top.',
      'The page shows visitors against the period before, the busiest hours, which pages they open, where they come from and what device they use.',
      '"The way to an order" shows how many reach the menu, the cart and checkout.',
    ],
    notes: [
      'Tap "Don\'t count this device" on your own phone and computer so your visits are left out.',
      'No names, IP addresses or cookies are stored.',
    ],
    words: 'analytics traffic visits website order app',
  },

  // ── Menu ──────────────────────────────────────────────────────────────────
  {
    id: 'menu-photo',
    page: '/menu',
    title: 'Add or change a dish photo',
    steps: [
      'Open Menu Items and open the dish.',
      'Tap the "Photos & video" tab.',
      'Tap Upload and pick the photo. On a computer you can also drag the photo onto the box.',
      'Crop it and save.',
    ],
    words: 'picture image upload photo drag drop',
  },
  {
    id: 'menu-sold-out',
    page: '/menu',
    title: 'Mark a dish sold out, or hide it',
    steps: [
      'Open Menu Items and open the dish.',
      'In Basics, untick "Selling today" when it has run out. It shows as sold out until you tick it again.',
      'Untick "On menu" to hide it everywhere. It is kept, so you can bring it back.',
      'Save.',
    ],
    words: 'sold out unavailable hide remove 86 out of stock',
  },
  {
    id: 'menu-recipe',
    page: '/menu',
    title: 'Set a dish\'s recipe and see what it costs to make',
    steps: [
      'Open Menu Items.',
      'On the dish\'s row tap the Recipe & cost button.',
      'Add each ingredient and how much one portion uses.',
      'Tap Save recipe. The box closes and tells you the cost.',
    ],
    notes: [
      'The cost is used for margins in the reports and for the lowest price a discount may reach.',
    ],
    words: 'recipe cost ingredients margin food cost',
  },
  {
    id: 'menu-best-sellers',
    page: '/menu',
    title: 'Keep a dish out of the best sellers lists',
    about: 'For things like water bottles that sell a lot but should not be promoted.',
    steps: [
      'Open Menu Items and open the dish.',
      'Go to the Best sellers section.',
      'Tick "Keep out of best sellers" and save.',
    ],
    notes: [
      'It leaves the website, the order app, the till\'s Popular now row and the TV board. Sales reports still count it.',
    ],
    words: 'best seller popular hide water',
  },
  {
    id: 'menu-sizes',
    page: '/menu',
    title: 'Give a dish sizes, each with its own price',
    steps: [
      'Open Menu Items and open the dish.',
      'In Price & sizes, tick "This product has variants".',
      'Tap "+ Add variant". Type the size\'s name and its price.',
      'Add the other sizes the same way. The arrows beside a name set the order customers see.',
      'Save.',
    ],
    notes: [
      'Switch "On sale" off to hide one size without removing it.',
      'Switch "Count stock" on to keep a count for that size. The In stock and Alert at boxes then appear.',
      '"Uses of the recipe" is how much of the dish\'s recipe one of this size takes: 1 for a full, 0.5 for a half.',
    ],
    words: 'size sizes variant variants small large portion half price',
  },
  {
    id: 'menu-item-sales',
    page: '/menu',
    title: 'See how a dish is selling',
    steps: [
      'Open Menu Items. The "Sold (30 days)" column shows how many of each dish sold in the last 30 days.',
      'Tap the column\'s heading to put the best sellers first. Tap again for the slowest. On a phone, pick "Best selling (30 days)" or "Slowest selling (30 days)" in the sort box.',
      'Open a dish. The box at the top shows what sold in the last 30 days and in all, when it last sold, and each size.',
      'Tap "See full sales" for the charts by hour, day and month.',
    ],
    notes: [
      'Only someone who may open the reports sees these figures.',
      'Every paid order counts. Cancelled orders do not.',
      'In "Edit in table", add the column from the Columns button.',
    ],
    words: 'sold total sales summary slow best selling how many item',
  },
  {
    id: 'menu-coming-soon',
    page: '/menu',
    title: 'Announce a dish before it goes on sale',
    steps: [
      'Open Menu Items and open the dish.',
      'Go to the Coming soon section and set the day it goes on sale.',
      'Save.',
    ],
    notes: [
      'Until that day customers see "Coming soon" and can tap "Tell me when it\'s on sale".',
      'On the day it goes on sale by itself and the people who asked get a text.',
    ],
    words: 'launch new dish coming soon notify',
  },

  // ── Floor ─────────────────────────────────────────────────────────────────
  {
    id: 'number-stands',
    page: '/tables',
    title: 'Set up number stands for customers who seat themselves',
    steps: [
      'Open Tables and find Number stands.',
      'Type how many stands you have in "How many" and tap Save. They are named No. 1 upward. Zero turns them off.',
    ],
    notes: [
      'A dine-in ticket with no table gets the lowest free number by itself. The cashier hands over that stand.',
      'The number is on the kitchen slip, the kitchen screen and the receipt.',
      'A number stays in use after payment until the order is served.',
    ],
    words: 'number stand table seat self seating',
  },
  {
    id: 'table-qr',
    page: '/tables',
    title: 'Print a QR card so customers order from the table',
    steps: [
      'Open Tables.',
      'On the table\'s card tap QR.',
      'Print the card and put it on the table.',
    ],
    notes: [
      'A customer who scans it orders in the order app and the order arrives with the table already on it.',
    ],
    words: 'qr code table order scan',
  },

  // ── Labels ────────────────────────────────────────────────────────────────
  {
    id: 'labels-map',
    page: '/labels',
    title: 'Find my way around Labels',
    open: { to: '/labels/mine', label: 'Open My labels' },
    steps: [
      'Open Labels. It opens on My labels: every label you have, one row each.',
      'Tap Print on a row to set how many and the dates, then print.',
      'Tap View on a row to see the label without printing it. The row also says its pack size, count, price and barcode.',
      'Tap Edit on a row to change the label itself: its wording, picture, size and layout.',
      'To rename a label, tap Edit and change Product name, then Save.',
      'A label opens at the size it was saved at. To change its size, tap Edit, pick the size under Shape and size, then Save.',
      'Tap New label for a new one, in four steps.',
      'Batches lists every lot printed, with the code on its QR. Box labels is for delivery boxes. Setup holds the wording, logos, bottom strips, templates, your rolls, the printer and which menu items get labels.',
    ],
    notes: [
      'Save appears only while editing a label, and it keeps your changes. A printed sheet is not saved by hand: every print is kept under Sheets printed before, at the bottom of My labels.',
      'Print several on one sheet opens the full form: several products together, with a batch and dates for each.',
      'Scan a pack to print its sticker again is a fold at the bottom of My labels.',
    ],
    words: 'labels tabs where find saved custom print setup settings',
  },
  {
    id: 'make-label',
    page: '/labels',
    title: 'Make a new label',
    open: { to: '/labels/make', label: 'Open New label' },
    steps: [
      'Open Labels and tap the New label tab.',
      'Step 1: say what the label is for. Pick a menu item, or something not on the menu.',
      'Step 2: pick the label from the picture cards.',
      'Step 3: check the preview. Tap any part of it to change that part.',
      'Step 4: type how many and print.',
    ],
    notes: [
      'The label is then in My labels, to print again with Print on its row.',
      'On a phone the PDF is the one to print.',
    ],
    words: 'sticker label new make pack expiry',
  },
  {
    id: 'round-label',
    page: '/labels',
    title: 'Make a round label (Frozen Jhol Momo and other tubs and lids)',
    about: 'A round sticker for a lid or a tub: the brand on a rust cap, the name, the photo beside the ingredients, the dates in two boxes, and the storage line on the foot.',
    open: { to: '/labels/make', label: 'Open New label' },
    steps: [
      'Open Labels and tap the New label tab.',
      'Step 1: tap Something else, then New custom label.',
      'In Start from, pick Frozen Jhol Momo (round). The name, photo, ingredients, storage and a round 80 mm size fill in.',
      'Change anything that differs, such as the price, the number of pieces or the photo, then Save.',
      'Check the preview, then type how many and print.',
    ],
    notes: [
      'For another product, pick Jar lid (round) in Start from, or pick any round size under Shape and size.',
      'Round sizes run from 30 to 200 mm. From 56 mm the photo shows beside the ingredients; from 70 mm there is also a QR code and a batch line.',
      'Under 45 mm there is no room for ingredients: the label keeps the name, the dates and the storage line.',
      'The colours of the foot follow the bottom strip you picked for the label.',
    ],
    words: 'round circle circular label sticker lid tub jar jhol momo template',
  },
  {
    id: 'labels-kind',
    page: '/labels',
    title: 'Make a label a sticker, a pouch label, a bottle wrap or a tub label',
    steps: [
      'Open Labels. On My labels tap Edit on the label, or make a new one on New label.',
      'Type the Product name in the first box. It is the name printed on the label.',
      'Under "What kind of label" tap Sticker, Pouch or bag, Wrap-around, Tub lid or Tub side.',
      'The label moves to a size that prints that kind, and the preview draws it.',
      'The settings for that kind open just below: the strips for a wrap-around label, the colour and cooking method for a pouch.',
      'Change the size under Shape and size if yours is different, then Save.',
    ],
    notes: [
      'A wrap-around label is any wide, short size. Picking a size that is not wide turns it back into a sticker.',
      'Switching away from Pouch and back keeps the pouch picks you made.',
      'On a wrap-around label, "Words on the band" is only the coloured band along the bottom. Left empty, the band carries the net weight, or is left off when there is none. It never repeats the product name.',
      'The preview in this form leaves both dates blank. You pick the dates when you tap Print.',
      'Storage starts on "None: no storage line". Pick Frozen, Chilled or Room temperature to print that line, or pick a Label type that brings one.',
      'A label with no Label type prints no heading until you type one in Wording on the sticker. Pick a Label type, such as Frozen Hedhika, to print that type\'s heading.',
    ],
    words: 'kind type wrap around bottle pouch bag tub lid side sticker preview not showing',
  },
  {
    id: 'lid-and-side-labels',
    page: '/labels',
    title: 'Make a lid label and a side label for a tub',
    about: 'Two labels for one tub: a round one on the lid with the name and the photo, and a rectangular one on the side with the ingredients, the dates and the rest. Both are made in one go.',
    open: { to: '/labels/make', label: 'Open New label' },
    steps: [
      'Open Labels and tap the New label tab.',
      'Step 1: tap Something else, then Lid and side labels.',
      'In Start from, pick a ready-made product such as Frozen Jhol Momo, or leave A blank label and type the Product name.',
      'Keep the Photo, or tap Upload a photo to take one from this phone or computer (a picture can also be dropped on the box), or tap Pick from Library. Then check Ingredients, Allergens, Shelf life, Pieces, Net weight and Price.',
      'For a shop that scans at the till, type the Barcode or tap Make one. The lid prints it under the name with the price.',
      'Open More details for the Dhivehi name, the heading, storage, language, Label type, brand, how to use, a note, the Dhivehi wording, the Storage line, Nutrition per 100 g, Badges, the Bottom strip and Complaints QR.',
      'Pick the Lid label size (round) and the Side label size, then tap Make the 2 labels.',
      'Both labels show with a preview. Tap Edit on either for every other option of a label, tap Print, or find them later in My labels as "Name (Lid)" and "Name (Side)".',
    ],
    notes: [
      'The lid prints the brand, the photo, the name, the pieces and price, the barcode and the storage line. It has no ingredients and no dates: those are on the side label with the QR codes.',
      'A lid under 70 mm is too small for a barcode that scans, so it is left off and the screen says so.',
      'A side label 86 mm wide or more, such as 100 × 50 mm, prints two QR codes: FEEDBACK opens the complaints page and PACK INFO shows that pack\'s dates and batch. A narrower side label has room for the pack\'s code only.',
      'Badges print on the side label. Nutrition needs a full-size side label.',
      'The name prints without "(Lid)" or "(Side)".',
      'Print the side label from My labels to set its Made on and Use by dates.',
      'To turn a label you already have into a lid or a side label, tap Edit on it and pick Tub lid or Tub side under What kind of label.',
      'A menu item needs nothing made: in My labels tap Print on the item, then under Which label pick Lid: name and photo, print, and again with Side: the details.',
      'To print both on one A4 sheet, tap Print on the menu item (or on the Lid or Side label), pick Lid and side together under Which label, choose the Side label size, type How many pairs and press Print. Each round lid has its side label beside it with the same dates.',
      'On the pair sheet each half prints from its own label: the lid with its barcode and price, the side with its badges and QR codes. To cut, follow the grey dashed lines across the page first, then the one between each lid and its side, then trim each label along its own solid grey outline.',
      'A sheet holds 3 pairs with an 80 mm lid and a 100 × 50 mm side. The pair sheet is for plain A4 sticker paper cut by hand, not for a label printer or ready-cut sheets.',
      'Measure the lid and the flat part of the tub\'s side before picking the sizes.',
    ],
    words: 'lid top side tub container box two labels round circle rectangle name photo details jhol momo',
  },
  {
    id: 'pouch-label',
    page: '/labels',
    title: 'Make a label for a zip pouch (frozen momo and other packs)',
    open: { to: '/labels', label: 'Open Labels' },
    steps: [
      'Open Labels and tap the New label tab.',
      'Step 1: tap Something else, then Pouch labels in every size.',
      'Type the product name. The three sizes are filled in: Small, Medium and Large with their pieces, price and label size. Change any of them.',
      'Keep The momo photo, tap Upload a photo to take one from this phone or computer (or drop a picture on the box), or tap Pick from Library.',
      'Tap Make the 3 labels. Each size shows with its preview. Tap Print on the one you want.',
      'Later, print them from My labels: tap Print on the size you want.',
    ],
    notes: [
      'What the pouch looks like has five choices: gold, clear or white, brown paper, black, and black and white for a label printer.',
      'How it is cooked changes the pill under the name. While How to use is blank it also prints that method\'s instructions. Check the times against your own product.',
      'The big number is the pack quantity. The size word prints as "Small Pack", so nobody reads it as small momo. Where the pack size goes has three choices: a tag on the panel, a round badge on the photo, or a line under the count.',
      'Bake & Grill\'s logo and name print beside the ingredients. The phone prints once, in the line along the bottom, and the complaints QR at the right.',
      'Each size is a custom label of its own, so its wording is changed with Edit on its row in My labels, in Pouch label (zip pouches and bags).',
      'For a menu item, the same Pouch label box is on the item\'s Label tab.',
      'Print on its row opens at the pouch size. On the full Print labels form, a pouch label ticked at another size shows a note with Use 140 × 62 mm. Tap it, or the label prints as an ordinary sticker.',
    ],
    words: 'pouch bag momo frozen microwave steam fry zip label packet',
  },
  {
    id: 'bottle-label',
    page: '/labels',
    title: 'Make a label that goes right round a bottle (Theluli Rihaakuru)',
    open: { to: '/labels', label: 'Open Labels' },
    steps: [
      'Open Labels and tap the New label tab.',
      'Step 1: tap Something else, then New custom label.',
      'In Start from pick Theluli Rihaakuru bottle (4 sides). The name, the Amma brand, the photo, the ingredients and the size (215 × 40 mm) fill in.',
      'Check the wording. Type the net weight, and the price if you want it printed. For a barcode, type your number or tap Make one. Then tap Add label.',
      'The label opens at the bottle\'s size, on Looks right. Tap Next: how many.',
      'It starts at one full A4 sheet: five labels, turned sideways. Change the number for more sheets, then tap Print or PDF.',
    ],
    notes: [
      'The label is divided into four equal sides: name, picture and price; ingredients with the recycling marks; dates and barcode; then Bake & Grill\'s details with the complaints QR. Each fold lands on a corner of the bottle.',
      'A bottle\'s corners are rounded, so 3 mm is kept clear each side of every fold. For a rounder corner, open Wrap-around label (wide sizes) and raise Room at each corner (mm).',
      'Leave the price empty when shops set their own. A barcode made with Make one starts with 2: each shop adds that number to its till once, then scans it.',
      'Every label has a thin border, which makes it easy to cut out. To print without it, open Wrap-around label (wide sizes) and untick Border around the label.',
      'For another bottle, open Wrap-around label (wide sizes) on the label and set The bottle\'s shape: round, or 2, 3 or 4 flat sides.',
      'Measure round your own bottle before printing a full sheet. If it is not 21.5 cm, type your own size.',
    ],
    words: 'bottle jar wrap rihaakuru amma square sides round label',
  },

  {
    id: 'label-expiry',
    page: '/labels',
    title: 'Set the expiry date on a label in one tap',
    open: { to: '/labels/mine', label: 'Open My labels' },
    steps: [
      'Open Labels and tap Print on the label\'s row.',
      'Made on starts as today. Change it if the pack was made another day.',
      'Under Use by tap 1 month, 2 months, 3 months or 6 months. The date is worked out from Made on.',
      'Tap Shelf life to go back to the label\'s own shelf life.',
    ],
    notes: [
      'The months are for this print only. The label\'s own shelf life is not changed.',
      'Change Made on afterwards and a months pick moves with it. A date you typed yourself stays as typed.',
      'The same chips are on the New label steps and on the full Print labels form.',
    ],
    words: 'expiry expire date use by best before month shelf life',
  },
  {
    id: 'print-a-label',
    page: '/labels',
    title: 'Print a label I already made',
    open: { to: '/labels/mine', label: 'Open My labels' },
    steps: [
      'Open Labels. On My labels, tap Print on the label\'s row. A pop-up opens. Nothing prints yet.',
      'Set How many labels. It starts at one full sheet.',
      'Check Made on. For the expiry, leave Shelf life, tap 1, 2, 3 or 6 months, or type a date in Use by.',
      'Look at the dates on the picture of the label.',
      'Tap Print, or PDF on a phone.',
    ],
    notes: [
      'Paper shows the size and sheet it will print on. Tap Change to pick another size or one of your rolls. The label opens at the same size next time.',
      'Type a Batch number to tell this lot from the next. It prints on every label and shows on the Batches tab.',
      'To write the dates by hand, switch off Print the dates above Made on: Mfg date prints blank, and under Use by on the label pick Blank, or 1, 2, 3 or 6 months, or the shelf life, to print "Mfg + 3 months". More holds Packed for and Quantity per pack.',
      'For a promotion flash, pack numbers, cut marks or several products on one sheet, tap open every option under More.',
      'Print stays off while the use-by date has passed or the wording lock refuses the label.',
      'For a sharp print on a colour printer: print at Actual size (100%), not Fit to page, choose the best quality, and set the paper type to Labels or Thick. A computer usually prints sharper than a phone.',
    ],
    words: 'print label sticker dates expiry how many paper sheet quality sharp blurry',
  },
  {
    id: 'label-batches',
    page: '/labels',
    title: 'See every batch I printed, and find one by its code',
    open: { to: '/labels/batches', label: 'Open Batches' },
    steps: [
      'Open Labels and tap the Batches tab. Every lot of stickers and every box label printed is listed, newest first.',
      'Each row shows the product or the shop, how many, the batch number, the dates and whether it is past its date.',
      'To find one, type its code, its batch number, the product or the shop in the search box.',
      'Tap the code to open the page a customer sees when they scan the QR.',
      'Tap Print again on a sticker row to print that sticker once more.',
    ],
    notes: [
      'Every print has a code of its own. The QR marked PACK INFO on a label opens its page: dates, batch, ingredients and a way to tell you about a problem with that pack.',
      'The code prints on the big sticker, the pouch label, the bottle label (beside the barcode) and the compact, upright small and large round ones. A label too small for a QR that scans leaves it out, and the preview says so.',
      'A box label carries SCAN FOR BOX INFO. Its page lists who the box is for and what it holds, without the contact\'s name or number.',
      'Type a Batch number when you print to tell one lot from the next.',
      'Labels, Setup, Settings has the switch for the code if you do not want it printed.',
    ],
    words: 'batch batches code qr pack info box all list view find',
  },
  {
    id: 'saved-labels',
    page: '/labels',
    title: 'Find a sheet I printed before, print it again or remove it',
    open: { to: '/labels/saved', label: 'Open Sheets printed before' },
    steps: [
      'Open Labels. At the bottom of My labels, open Sheets printed before. Every sheet printed is listed, newest first.',
      'Tap Print to print the same sheet again, or PDF to download it.',
      'Tap Change to open it and alter it, Copy for a second one like it, or Pin to keep it at the top.',
      'Tap Remove to delete it, then confirm.',
    ],
    notes: [
      'You do not save by hand. Every print is kept here.',
      'To print a label with new dates, use Print on its row in My labels instead.',
      'Removing a sheet removes that sheet only. The label itself stays in My labels, where its own Remove is.',
      'Tap a sheet\'s name to rename it.',
    ],
    words: 'saved labels reprint print again delete remove history',
  },

  // ── People and alerts ─────────────────────────────────────────────────────
  {
    id: 'staff-permissions',
    page: '/staff',
    title: 'Let one staff member use a page others cannot',
    steps: [
      'Open Staff.',
      'On the person\'s row tap More, then Permissions.',
      'Switch on what they should be able to do. The sections follow the admin menu.',
      'A switch you change away from their role is marked "For them".',
    ],
    notes: [
      'To change it for everyone in a role, use Settings → Roles & permissions.',
      'Someone given a permission sees the page in their menu the next time they open the admin.',
    ],
    words: 'access role permission allow staff manager cashier',
  },
  {
    id: 'alert-switch',
    page: '/notifications',
    title: 'Turn a text, email or Telegram alert on or off',
    open: { to: '/notifications/messages', label: 'Open Messages' },
    steps: [
      'Open Notifications → Messages.',
      'Find the alert. The search box takes a word such as refund, shift or stock.',
      'Each row has a switch for SMS, Email and Telegram. Switch off the ones you do not want.',
    ],
    notes: [
      'The row is the only switch for that alert. There is no second one elsewhere.',
      'To hear when a till opens or closes its shift, use "Owner: a shift is opened" and "Owner: a shift is closed". The closing one carries the cash counted against expected, the orders and the sales.',
    ],
    words: 'sms email telegram alert notification switch off stop shift opened closed',
  },
  {
    id: 'alert-who',
    page: '/notifications',
    title: 'Choose who gets an alert',
    open: { to: '/notifications/messages', label: 'Open Messages' },
    steps: [
      'Open Notifications → Messages and find the alert.',
      'Tap Edit, then "Who gets it".',
      'Add or remove groups (a role, people on shift) or single people.',
      'Save.',
    ],
    notes: [
      'To see everything one person receives, open People and look at their alerts.',
    ],
    words: 'recipient who receives alert owner manager',
  },
  {
    id: 'needs-attention',
    page: '/needs-attention',
    title: 'See what is waiting for someone today',
    steps: [
      'Tap the inbox button in the top bar, next to the bell. The number on it is how many things wait.',
      'Each row is one kind of work: refunds to approve, complaints to answer, payments to check, reviews, customer messages and more.',
      'Tap a row to open the page where it is done.',
    ],
    notes: [
      'You only see rows for pages you can open.',
      'Red means it has waited too long.',
    ],
    words: 'inbox todo waiting pending tasks',
  },

  // ── Daily running ─────────────────────────────────────────────────────────
  {
    id: 'orders-find',
    page: '/orders',
    title: 'Find an order and see what happened to it',
    steps: [
      'Open Orders.',
      'Tap "Search & filters" and narrow by order number, customer, phone, type, status, cashier or station.',
      'Tap View on the order.',
      'The order shows its items, payments and a timeline: when it was rung up, sent to the kitchen, ready, paid and collected.',
    ],
    notes: [
      'Export CSV saves the list you are looking at.',
    ],
    words: 'search order receipt lookup history timeline',
  },
  {
    id: 'orders-send-bill',
    page: '/orders',
    title: 'Send a customer their bill, pay link or receipt',
    steps: [
      'Open Orders and tap View on the order.',
      'For an unpaid order tap Send Bill, or Send Pay Link so they can pay by card.',
      'For a paid order tap "Send receipt SMS".',
      'Check the phone number and send.',
    ],
    notes: [
      '"Copy invoice / receipt link" copies the link so you can paste it into WhatsApp or Viber.',
    ],
    words: 'bill invoice receipt sms link pay online',
  },
  {
    id: 'orders-refund',
    page: '/orders',
    title: 'Refund a paid order, or cancel an unpaid one',
    steps: [
      'Open Orders and tap View on the order.',
      'For a paid order tap Request Refund, choose what is refunded and type what happened.',
      'For an order with no payment tap "Void / cancel this order".',
    ],
    notes: [
      'A refund request waits for approval. It shows in Needs attention and under Finance → Refunds.',
      'Once a payment is recorded the order cannot be voided: use Request Refund.',
    ],
    words: 'refund void cancel money back',
  },
  {
    id: 'kds-watch',
    page: '/kds',
    title: 'Watch the kitchen queue from the admin',
    steps: [
      'Open Kitchen Display.',
      'Orders move through Pending, Cooking and Ready.',
      'The figures at the top show the average wait and how many are over their prep target.',
      'Pick a station to see only its dishes. Tap Fullscreen for a wall screen.',
    ],
    notes: [
      'Cooks work on the kitchen screen app. This page is for watching.',
    ],
    words: 'kitchen screen kds queue cooking',
  },
  {
    id: 'reservation-new',
    page: '/reservations',
    title: 'Take a table booking by phone',
    steps: [
      'Open Reservations and tap + New booking.',
      'Type the guest name and phone, then pick the date, time and party size.',
      'Add notes such as a birthday or a high chair.',
      'Tap Confirm.',
    ],
    notes: [
      'Opening and closing time, slot length, the largest party and how far ahead people can book are under Settings → Booking Rules on this page.',
    ],
    words: 'booking reserve table reservation',
  },
  {
    id: 'delivery-assign',
    page: '/delivery',
    title: 'Give a delivery to a driver',
    steps: [
      'Open Delivery Orders.',
      'On the order tap Assign Driver and pick the driver.',
      'The driver gets it on their phone and marks it picked up, on the way and delivered.',
      'Tap Details to see where it is and the proof of delivery.',
    ],
    words: 'driver delivery assign dispatch',
  },
  {
    id: 'kitchen-plan',
    page: '/kitchen',
    title: 'Plan what the kitchen makes for a day',
    steps: [
      'Open Kitchen. Plan suggests what to make for a day, slot by slot, from what sold on days like it.',
      'Holidays holds the public holidays, school terms and closures the plan allows for.',
      'Today shows what has been made and what the counter has received.',
      'Receiving lists batches waiting for the counter to accept them. Variances shows what came short, over or was rejected.',
    ],
    notes: [
      '"How it did" compares saved plans with what then sold.',
      'Stock thrown away is logged under Inventory → Waste logs. Waste & remakes here is for production.',
    ],
    words: 'production plan batches handover receiving variance',
  },
  {
    id: 'addon-new',
    page: '/modifiers',
    title: 'Add an extra customers can choose, like extra cheese',
    steps: [
      'Open Add-ons and tap + New add-on.',
      'Type the Name and the Price. 0 means free.',
      'Optional: pick the Ingredient it uses and the amount per add-on, so stock goes down when it is sold.',
      'Save, then attach it to dishes in the dish\'s Add-ons section in Menu Items.',
    ],
    words: 'modifier extra topping add on option',
  },
  {
    id: 'stock-count',
    page: '/inventory',
    title: 'Do a stock count',
    steps: [
      'Open Inventory and tap Stock Count.',
      'Type what you counted for each item under Counted Qty.',
      'Tap Submit Stock Count.',
    ],
    notes: [
      'The Variance column shows the difference between the count and what the system expected.',
      'To change one item only, use its adjustment on the Stock tab: Add, Remove, or Set to exact amount.',
    ],
    words: 'stock take count inventory adjust',
  },
  {
    id: 'stock-low',
    page: '/inventory',
    title: 'See what is running low and set when to reorder',
    steps: [
      'Open Inventory. The Stock tab lists every item with what is on hand.',
      'Use the Low stock filter to see only items at or under their reorder point.',
      'Tap Edit on an item to set its Reorder point, Preferred supplier and Supplier lead days.',
    ],
    notes: [
      'Low items also show on the Dashboard under Worth a look.',
    ],
    words: 'low stock reorder minimum running out',
  },
  {
    id: 'stock-waste',
    page: '/inventory',
    title: 'Record stock that was thrown away',
    steps: [
      'Open Inventory and tap Waste logs.',
      'Tap + Log Waste, pick the item, then type the quantity and the reason.',
      'Save. The stock goes down and the waste shows in the reports.',
    ],
    words: 'waste spoiled expired thrown away write off',
  },
  {
    id: 'purchase-flow',
    page: '/purchasing',
    title: 'Buy stock: from a request to goods received',
    steps: [
      'Staff ask for what is needed under Requests with New request. A manager approves or rejects it there.',
      'Under Purchase orders, tap + Create Manual PO for a new order, or Auto-Suggest POs to get orders drafted from low stock.',
      'When the goods arrive, open the order and tap Receive. Check the quantities and tap Confirm Receipt.',
      'Tap Upload Receipt to keep the supplier\'s bill with the order.',
    ],
    notes: [
      'Receiving is what adds the stock to Inventory and updates what each item costs.',
      'Price changes shows what each item costs now against before.',
    ],
    words: 'purchase order supplier buy receive po request',
  },
  {
    id: 'suppliers-paid',
    page: '/purchasing',
    title: 'Stop a shop showing as owed when you already paid',
    about: 'You pay at the shop and bring the goods, so nothing is owed. This is how to say so.',
    open: { to: '/purchasing/suppliers', label: 'Open Suppliers' },
    steps: [
      'For a new order: in + Create Manual PO, under Did you pay?, keep Paid in full. It is the choice it starts on, and it remembers your last one.',
      'For orders already showing as owed: open Purchasing → Suppliers and find the Owed to suppliers card.',
      'Tap Paid beside a shop to mark all of its orders as paid, or All paid for every shop on the card.',
      'Tap Yes, paid.',
    ],
    notes: [
      'Each order is marked paid in cash on the day it was bought.',
      'An order paid in full in cash stays paid if you correct its price or quantity afterwards.',
      'A shop run from Requests that is turned into a purchase order is already paid, as the buyer paid at the shop.',
      'If one order really is still owed, open the shop\'s page and undo that order\'s payment.',
      'Choose Not paid yet only for a shop that gives you credit.',
    ],
    words: 'owe owed supplier shop paid pay cash payable debt purchase order po mark paid',
  },
  {
    id: 'read-bills',
    page: '/purchasing',
    title: 'Enter a pile of supplier bills without typing them',
    about: 'Send photos or PDFs of the bills. Each is read into a purchase order: the shop, the date, the items, quantities and prices. You check it and save.',
    open: { to: '/purchasing/orders', label: 'Open Purchase Orders' },
    steps: [
      'Open Purchasing → Orders. At the top is Bills to check.',
      'Tap Read bills and pick the photos or PDFs, as many as you have. On a phone you can take the photos there and then.',
      'Each bill is read in a few seconds and joins the list with its shop, date, number of items and total.',
      'Tap Check on a bill. The manual purchase order opens, filled in. View the bill opens the picture to hold beside it.',
      'Go down the lines. A line that says Not in your inventory needs an item: pick one, or save it as a new item.',
      'When the lines add up to the bill\'s total, tap Create PO.',
    ],
    notes: [
      'Nothing is saved until you tap Create PO. Every box can be changed first.',
      'The bill is kept with the order as its receipt, and leaves the list.',
      'A line bought by the carton or case asks once how many are in one, then remembers it for that item.',
      'A line marked check this line was hard to read, or its quantity times price did not come to its amount.',
      'You can close the page while bills are being read. They are finished in the background and wait on the list.',
      'The same file is not taken twice, and a bill number already on file is pointed out.',
      'Branches of one shop: the first time a bill comes under another name, change Bought from to the shop you already have. That name is remembered, and the next bill from that branch goes to the same shop.',
      'Items work the same way: pick the right item for a line once, and that wording on a later bill finds it by itself.',
      'Brands: there is one item per product, such as Butter. The brand on the bill goes in the line\'s Brand box, so prices can be compared by brand without splitting the stock.',
      'Units: a line is in the item\'s own unit unless the bill sells it by a pack. A new item is counted in the smallest unit, such as piece or kg, and the pack is set up on top.',
      'If it says reading bills is not set up, it needs a key: see the guide Set up the API keys.',
      'Did you pay? works as on any manual order: it starts on Paid in full.',
    ],
    words: 'bill bills invoice receipt photo scan ocr read automatic claude ai upload camera supplier purchase order po enter pile',
  },
  {
    id: 'bills-by-telegram',
    page: '/telegram',
    title: 'Send a supplier bill to the bot and approve it there',
    about: 'Take a photo of a bill and send it to the staff bot. It is read and comes back with what it found and an Approve button.',
    open: { to: '/telegram', label: 'Open Telegram' },
    steps: [
      'In your chat with the staff bot, send a photo of the bill, or a PDF.',
      'The bot answers Got the bill. In a moment the reading arrives, laid out like the manual order: Bought from, Purchase date, each item with its quantity, price and pack, the Order total against the bill\'s, and Did you pay?',
      'Check it against the bill.',
      'Tap Approve: paid in cash, or Approve: not paid yet.',
      'The purchase order is made as received, so the stock goes in, and the bill is kept as its receipt.',
    ],
    notes: [
      'A product that is not in your inventory yet is added when you approve. The message says its name and what it is counted in first, and the button reads Add and approve.',
      'Bought by the bundle, carton or case? The pack is set up from the bill. If the bill does not say how many are in one, the bot asks: tap the button and send the number.',
      'When a figure was hard to read or the lines do not add up, the bot says so, with Open in Admin. The bill waits under Purchasing → Orders → Bills to check.',
      'Adding a new product needs the permission to manage inventory. Without it, a bill with a new product goes to Admin.',
      'Remove takes the bill off the list. Nothing is entered from it.',
      'Only someone who may enter purchases can send bills or approve them.',
      'The same photo is not taken twice.',
      'It needs a key for reading bills: see Set up the API keys.',
      'A bill approved here is received at once. One checked in Admin is saved as a draft to receive, as any manual order is.',
    ],
    words: 'telegram bot bill slip receipt invoice photo upload approve supplier purchase order send',
  },
  {
    id: 'bill-reader-key',
    page: '/integrations',
    title: 'Set up the API keys: Claude and Google',
    about: 'Reading bills and the assistant ask an outside service. Here you give each service its key, and switch between Claude and Google. It is the one place a key is typed.',
    open: { to: '/integrations/keys', label: 'Open API keys' },
    steps: [
      'Open System → Integrations → API keys.',
      'Get a key: for Claude at console.anthropic.com → API keys, for Google at aistudio.google.com → Get API key.',
      'Paste it into that service\'s box and tap Save key.',
      'Tap Test. A made-up bill is sent, and the screen says whether it was read.',
      'Tap Use this one on the service you want. It then says In use, and it reads the bills and does the assistant\'s work.',
    ],
    notes: [
      'A key is kept encrypted and is never shown again, only its last four characters.',
      'You can keep a key for both and switch whenever you like. Bills already read stay as they are.',
      'Remove key takes a typed key away. A key in the server\'s .env file, if there is one, is then used.',
      'Leave Model empty unless you know the exact name of another model.',
      'Making pictures always uses Google, so it needs the Google key even when Claude is in use. Its model is at the bottom of the same tab.',
      'Bills are made out to (your own names, such as the shop and its parent company) stays under Purchasing → Settings → 7 · Reading bills.',
      'Each bill read costs a few cents, charged by the service to your account with them.',
      'Only someone who may change settings sees this part.',
    ],
    words: 'api key claude anthropic google gemini ocr bill reader switch provider service ai key settings',
  },
  {
    id: 'wholesale-invoice',
    page: '/wholesale',
    title: 'Invoice a shop for its deliveries',
    open: { to: '/wholesale/invoicing', label: 'Open Invoicing' },
    steps: [
      'Open Wholesale → Invoicing and pick the shop.',
      'Deliveries marked Ready can be billed. One with missing stock needs a decision first: choose Charge missing stock or Waive missing charge.',
      'Tap Preview to check the invoice.',
      'Tap Invoice deliveries, then Send to shop or Send SMS.',
    ],
    notes: [
      'A delivery marked Mismatch is blocked until it is reconciled under Deliveries.',
      'Shops and their prices are under Shops. What each shop owes is in Reports.',
    ],
    words: 'wholesale trade shop invoice delivery bill',
  },

  // ── Customers and marketing ───────────────────────────────────────────────
  {
    id: 'catering-follow',
    page: '/catering',
    title: 'Follow an event or catering order',
    steps: [
      'Open Events & Catering. Each row is one event with its date and where it stands.',
      'Search by name or phone, or filter by status.',
      'Tap an event to see what was asked for, the quote and the payments.',
    ],
    notes: [
      'New requests text the catering team. Who gets that text is set under Notifications → Messages.',
    ],
    words: 'event catering quote party order',
  },
  {
    id: 'loyalty-rules',
    page: '/loyalty',
    title: 'Set how customers earn and spend points',
    steps: [
      'Open Loyalty and tap Program Settings.',
      'Under Earn rules set the points per MVR 1 spent.',
      'Under Redeem rules set what points are worth, the smallest and largest redemption and the most of an order that points may cover.',
      'Optional: Points expiry (days). Customers are warned before points run out.',
      'Save.',
    ],
    notes: [
      'Tiers gives regular customers a multiplier on what they earn.',
      'Customer Accounts lists every balance. Adjust adds or takes points with a reason.',
      'Print counter sign makes a sign that explains the programme.',
    ],
    words: 'points rewards loyalty earn redeem tier',
  },
  {
    id: 'sms-campaign',
    page: '/sms',
    title: 'Send a text to a group of customers',
    steps: [
      'Open SMS campaigns and tap + New Campaign.',
      'Type a Campaign Name and choose the Audience: any customer, a customer group, a loyalty tier, or birthdays in a month.',
      'Write the message.',
      'Send it now, or set it to run daily, weekly or monthly. Leave the schedule empty to send by hand from the list.',
    ],
    notes: [
      'Customers who replied STOP or switched off offers are left out by themselves.',
      'Contacts & Groups holds your own lists. Templates keeps wording you reuse.',
      'Alerts such as "order ready" are not here. Those are under Notifications.',
    ],
    words: 'sms text blast campaign marketing message',
  },
  {
    id: 'social-post',
    page: '/social',
    title: 'Post to Facebook, Instagram, Telegram or Viber',
    steps: [
      'Open Social Hub and tap + New post.',
      'Write the post, add a photo or pick a dish, and choose the channels.',
      'Tap Post now, or Schedule to send it later. Calendar shows what is planned.',
    ],
    notes: [
      'A page is connected once under Channels.',
      'Posts shows what was published, what is queued and anything that failed.',
    ],
    words: 'facebook instagram telegram viber post social share',
  },
  {
    id: 'social-animated-post',
    page: '/social',
    title: 'Make an animated post (a short video of your design)',
    steps: [
      'Open Social Hub, tap Make a post and set up the post as usual: the dish, a design and the parts.',
      'Under Make it move, tap a motion such as Rise, Pop or Drop and bounce. It plays on the picture straight away.',
      'Pick How long: 4, 6 or 8 seconds. Play again shows it once more.',
      'Tap the shape you want at the top (Feed post or Story are best for video), then tap Make the video.',
      'Keep the page open while it records. Save or share then opens with the video playing: tap Share or save the video.',
    ],
    notes: [
      'There are 100 motions in four groups (Calm and elegant, Lively, Bold and fast, Playful), and each one works with every design and colour.',
      'The video is an MP4 with no sound. Instagram and TikTok let you add music when you post it.',
      'On an iPhone, Save Video keeps it in Photos; Instagram, WhatsApp and TikTok are in the same list.',
      'Still picture turns the motion off. Change anything on the post and the video has to be made again.',
      'The motion is saved with the post, so a saved post opens ready to play.',
      'It needs Chrome or Safari. If the button is greyed out, the browser cannot record.',
    ],
    words: 'animate animation motion moving video mp4 reel story clip animated post',
  },
  {
    id: 'social-videos',
    page: '/social',
    title: 'Make a short video of a dish, watch it and download it',
    steps: [
      'Open Social Hub and tap the Videos tab. Videos you have made are listed first, newest at the top.',
      'To make one, pick a Category or search for the dish, then tap Generate beside the shape you want.',
      'The row says Waiting to render, then Rendering, then Ready. It updates by itself.',
      'Tap Play to watch it. Tap Download to save it.',
    ],
    notes: [
      'Vertical suits Reels, Stories and TikTok. Square suits the feed. Landscape suits Facebook and Telegram.',
      'The video is built from the dish\'s own photos, with a closing card showing its name and price. It has no sound.',
      'Open on a listed video shows that dish\'s three shapes. All videos goes back to the list.',
      'To post one, tap + New post, pick the dish and choose Video. For TikTok, download the Vertical one and post it from your phone.',
      'If a video says Failed, tap Generate again.',
    ],
    words: 'video clip reel tiktok story render play preview download watch',
  },
  {
    id: 'social-make-post',
    page: '/social',
    title: 'Make a picture for Instagram, Facebook, stories and WhatsApp status',
    steps: [
      'Open Social Hub and tap the Make a post tab.',
      'Under What is it for?, search the menu and pick the dish. Its name, price and photo fill in. Or type a Headline and a Price yourself.',
      'Under Pick a design, tap a group such as Offers and deals, Occasions or Times of day, then a ready-made post in it. It sets the design, the colour, the parts and the usual words in one tap.',
      'Or tap any design, then any colour. The words stay the same. Surprise me picks one for you.',
      'There are 100 designs, 100 colours, 100 ready-made posts and 100 motions. Each list opens on a group (for designs: Classic, Bold and loud, Photo first, Fun and party, Night and glow, Modern and clean, Patterns); tap another group, or All to see every one.',
      'Under Add or remove parts, switch on what you want: Price, Old price, Sticker, Order button, Second button, Phone number, Website, Logo, QR code.',
      'Tap Feed post, Square, Story or Wide to see each shape.',
      'Tap Save or share. All four sizes appear, each with its own button, and one button for all four.',
      'To keep it, type a Name under Save it for later and tap Save. It appears under Saved posts.',
    ],
    notes: [
      'Feed post suits Instagram and Facebook, Square suits Viber and Telegram, Story suits stories, WhatsApp status and TikTok, Wide suits a Facebook link.',
      'For two buttons, switch on Second button and type its words, such as Call us. Button style changes how the main button looks: Filled, Outline or Highlight.',
      'On a phone the picture stays at the top of the screen while you scroll, so you see each change as you make it. Hide the picture folds it away; Show the picture brings it back.',
      'Post it opens the composer with the picture and a caption ready, to send to your connected channels.',
      'On an iPhone, tap Share or save, then Save Image to keep it in Photos, or pick WhatsApp, Instagram or Viber in the same list. On a computer the button says Download.',
      'Open a saved post, change the price or the design, and tap Save changes. Save as a new post keeps the old one too.',
      'A dish with a cut-out photo looks best. Pick a photo opens the Media Library for any other picture.',
      'TikTok and WhatsApp status cannot be posted to from here: download the Story size and post it from your phone.',
    ],
    words: 'poster picture design instagram facebook story status whatsapp tiktok viber download template social',
  },
  {
    id: 'signage-playlist',
    page: '/signage',
    title: 'Change what the TV screens show',
    steps: [
      'Open TV Signage.',
      'Screens & Groups lists each TV. Playlists holds what plays on them, in order.',
      'Open a playlist to add, remove or reorder its slides, then save.',
      'Notices posts a short message on the board. Banner sets the strip along the screen.',
    ],
    notes: [
      'Emergency replaces everything on every screen at once: Closed, Prayer break, Maintenance and others. Set it back to None for the normal rotation.',
      'TV status shows which screens are online.',
    ],
    words: 'tv screen menu board playlist display emergency',
  },
  {
    id: 'poster-make',
    page: '/posters',
    title: 'Make a poster for the shop or a TV',
    steps: [
      'Open Posters. It opens on Make a poster.',
      'Pick a design. Switch between Print and TV screens at the top of the designs.',
      'Change the words and pick the dish or photo for each picture.',
      'Choose the size, then download the file. The checks tell you if a photo is too small to print well.',
    ],
    notes: [
      'My posters keeps what you made. Save as template keeps a design to start from again.',
      'Print shops holds the shops you send posters to, with their quotes.',
      'Stickers for packs and boxes are made under Labels.',
    ],
    words: 'poster print design template a4 a3 tv',
  },
  {
    id: 'content-website',
    page: '/content/website',
    title: 'Change the words and pictures on the website',
    steps: [
      'Open Website Content.',
      'Pick the page or section you want to change.',
      'Edit the words or swap the picture. Changes show as Unsaved until you publish.',
      'Tap Publish.',
    ],
    notes: [
      '"Section order & visibility" moves sections of the home page up and down or hides them.',
      'Opening hours, phone and address are not typed here. They come from the schedule and Settings → Business.',
      'The Dhivehi switch and the Dhivehi font are under Everywhere.',
    ],
    words: 'website text banner home page hero logo dhivehi',
  },
  {
    id: 'content-order-app',
    page: '/content/order-app',
    title: 'Change the words and pictures in the order app',
    steps: [
      'Open Order App Content.',
      'Pick the screen or section you want to change.',
      'Edit the words or swap the picture, then tap Publish.',
    ],
    notes: [
      'The Dhivehi switch is one switch for the website and the app. Changing it here changes both.',
    ],
    words: 'order app text banner home dhivehi',
  },
  {
    id: 'media-library',
    page: '/media',
    title: 'Find, replace or tidy an uploaded picture',
    steps: [
      'Open Media Library. Filter by Images, Video, Audio or Documents, or search.',
      'Tap a file to see its details and where it is used.',
      'Edit tools can crop, resize, rotate or convert it. "Save as new copy" keeps the original.',
      '"Replace everywhere" swaps the file in every place that uses it.',
    ],
    notes: [
      'Collections and Tags group files so they are easier to find.',
      'A file marked "Not referenced anywhere" is not used on any page.',
    ],
    words: 'image photo upload media library replace crop',
  },

  // ── Numbers ───────────────────────────────────────────────────────────────
  {
    id: 'analytics-read',
    page: '/analytics',
    title: 'See busy hours, top customers and which dishes earn most',
    steps: [
      'Open Analytics.',
      'Peak Hours shows when orders come in over the last 30 days.',
      'Item Profitability shows what each dish earned this month after its cost.',
      'Top Customers by Revenue and Customer Retention show who comes back.',
    ],
    notes: [
      'Analytics looks at recent demand. Forecasts looks ahead: expected revenue and what to restock.',
    ],
    words: 'analytics peak hours top customers profitability retention',
  },
  {
    id: 'forecast-restock',
    page: '/forecasts',
    title: 'See what to restock and what sales to expect',
    steps: [
      'Open Forecasts.',
      'Revenue Forecast shows the next 4 weeks from recent sales.',
      'Restock Plan lists what will run out and when, from how fast each item is used.',
      'Inventory Runway shows how many days of each item are left.',
    ],
    notes: [
      'The links at the side open Inventory and the purchase orders, where the buying is done.',
    ],
    words: 'forecast restock runway predict demand',
  },

  // ── System ────────────────────────────────────────────────────────────────
  {
    id: 'settings-where',
    page: '/settings',
    title: 'Find the right setting',
    steps: [
      'Open Settings. Each tab holds one kind of setting.',
      'Business: the name, phone, address and tax details on receipts and invoices.',
      'Ordering: online ordering, pickup, pre-orders, guest checkout and what the till and the order app offer.',
      'Delivery: areas, fees and timing. Charges & fees: the service charge and fees.',
      'Credit & wallet: credit limits, payment terms and wallet top-ups.',
      'Roles & permissions: what each role and each person may do.',
    ],
    notes: [
      'Alerts are not here. They are under Notifications.',
      'Discount caps and approval for cashiers are under Promotions → Controls.',
    ],
    words: 'settings configuration business details service charge delivery fee roles',
  },
  {
    id: 'settings-roles',
    page: '/settings',
    title: 'Change what a role, such as cashier or manager, may do',
    open: { to: '/settings/permissions', label: 'Open Roles & permissions' },
    steps: [
      'Open Settings → Roles & permissions.',
      'Pick the role.',
      'The sections follow the admin menu: Till and orders, Kitchen, Menu, stock and buying, Customers and marketing, Money and reports, Team and system.',
      'Switch each permission on or off. All on and All off set a whole group.',
    ],
    notes: [
      'For one person only, use Staff → More → Permissions.',
    ],
    words: 'roles permissions access cashier manager allow',
  },
  {
    id: 'telegram-link',
    page: '/telegram',
    title: 'Get alerts and the day report on Telegram',
    steps: [
      'Open Telegram. Bots lists the bots and which roles each serves.',
      'People shows who is Linked and who is Not linked.',
      'Each person links their own Telegram once with their link, then taps Start in the bot.',
      'Groups sets up a shop group that gets online orders or the buying list.',
    ],
    notes: [
      'Which alerts go to Telegram is set under Notifications → Messages, on each alert\'s Telegram switch.',
      'In the bot, Today shows the day\'s sales and the open tickets.',
    ],
    words: 'telegram bot alerts link group report',
  },
  {
    id: 'device-approve',
    page: '/devices',
    title: 'Add a new till or kitchen screen',
    steps: [
      'Open the till or kitchen screen app on the new device. It asks to be approved.',
      'Open Devices. The device waits under Pending Approval.',
      'Tap Approve and give it a name.',
    ],
    notes: [
      'Disable stops a lost or old device from signing in.',
      'Print queue shows receipt and kitchen print jobs, and lets you retry one that failed.',
    ],
    words: 'device pos till kitchen screen approve printer print queue',
  },
  {
    id: 'pause-ordering',
    page: '/system-health',
    title: 'Pause online ordering or delivery for a while',
    open: { to: '/system-health/controls', label: 'Open Availability controls' },
    steps: [
      'Open System Health → Availability controls.',
      'Use a quick preset such as "Pause all online ordering" or "Pause delivery only", or switch one service to Unavailable.',
      'Type the Public message customers will see.',
      'Switch it back to Available when you are ready.',
    ],
    notes: [
      'The till keeps working unless POS sales itself is paused.',
      'Status shows whether payments, texts, printing and the scheduler are healthy.',
    ],
    words: 'pause close maintenance stop online orders delivery availability',
  },
  {
    id: 'catalogue-feeds',
    page: '/integrations',
    title: 'Show the menu on Facebook, Instagram or Google',
    open: { to: '/integrations/feeds', label: 'Open Catalogue feeds' },
    steps: [
      'Open Integrations → Catalogue feeds.',
      'Copy the Google or Facebook link.',
      'Paste it where that service asks for a product feed. It reads the menu from the link by itself.',
    ],
    notes: [
      'The link is secret. If it was shared by mistake tap Make new links, then paste the new one.',
      'Webhooks and Xero are for connecting other systems and accounting.',
    ],
    words: 'facebook instagram google catalogue feed shop xero webhook',
  },
  {
    id: 'assistant',
    page: '/integrations',
    title: 'Let Claude write drafts for me, and switch it on or off',
    open: { to: '/integrations/assistant', label: 'Open Assistant' },
    steps: [
      'First add a key under Integrations → API keys, the tab beside this one. It is the one key for everything.',
      'Open Integrations → Assistant. Use the assistant is the main switch; under it is a switch for each feature.',
      'With a feature on, its button appears on its screen: Draft reply on Reviews, Complaints, Dish questions and Social Hub → Comments; Draft Dhivehi under every Dhivehi box (menu items and categories, modifiers, labels, printed cards, signage, social posts, the newsletter, message wordings); Suggest Dhivehi and Suggest values under Labels → Setup; Write a caption in Social Hub → Make a post; Draft the words in a newsletter.',
      'Press the button, read what it wrote, change it, then press the screen\'s own Save or Send.',
    ],
    notes: [
      'Nothing it writes is saved or sent by itself. You always check it first.',
      'A scanned customer PO is read by the assistant when Read scanned purchase orders is on.',
      'On the Telegram bot, owners and managers can press More → Ask a question, or type /ask how many momo sold last week.',
      'Have a Dhivehi speaker read any Dhivehi draft before customers see it.',
      'Each use is charged to your Claude account. Switch off what you do not use.',
    ],
    words: 'claude ai assistant draft reply dhivehi translate caption newsletter nutrition glossary ask question telegram scan po key switch',
  },
  {
    id: 'assistant-suggestions',
    page: '/integrations',
    title: 'Approve what the assistant suggests for the menu, inventory and labels',
    open: { to: '/integrations/suggestions', label: 'Open Suggestions' },
    steps: [
      'Open Integrations → Suggestions. Each card is one kind: Dhivehi for dishes, New sections, Dishes to move, Order within a section, Inventory items with no category, Inventory items that look alike, Dhivehi for label ingredients, Nutrition per 100 g.',
      'Read each row. For Dhivehi you can change the words in the box first.',
      'On New sections, press Look now. It goes through every dish (in a section or not, on the menu or switched off) and every section and sub-section, and lists the new sections and sub-sections the menu should have, each with its dishes.',
      'Change a name and untick any dish that does not belong, then tick the ones you want and Approve: each section is made and its ticked dishes move into it.',
      'Tick the rows you agree with and press Approve. Tick the ones you do not want and press Turn down.',
      'To get new ones without waiting for the night, press Look now on a card.',
    ],
    notes: [
      'Nothing on the menu, in the inventory or on a label changes until you press Approve.',
      'The assistant looks by itself every night at 3:35 AM, for the kinds switched on under Integrations → Assistant.',
      'Something you turn down is not suggested again for two months.',
      'If a dish or item was changed by hand after the suggestion was made, approving leaves it alone and says so.',
      'Pressing Look now on New sections again makes a fresh plan: the one still waiting is replaced. The nightly look leaves a waiting plan alone.',
      'A sub-section under a section that is also new: approving it makes both.',
      'A new section is made without a photo or a Dhivehi name. Add those under Manage → Menu Items → Categories.',
      'Items that look alike are only pointed out. Nothing is merged for you: open both, decide, then Dismiss.',
      'You see only the kinds you may change: the menu, the inventory or the labels. They also show under Needs attention.',
    ],
    words: 'assistant suggestions approve automatic dhivehi category subcategory sub-category new section add order arrange group menu inventory duplicate nutrition glossary claude ai',
  },
  {
    id: 'assistant-menu-plan',
    page: '/integrations',
    title: 'Give the assistant my own plan for the menu, and find dishes entered twice',
    about: 'Tell the assistant which sections and sub-sections you want before it suggests any, and have it point out dishes that look like the same dish twice.',
    open: { to: '/integrations/suggestions', label: 'Open Suggestions' },
    steps: [
      'Open Integrations → Suggestions and find the New sections card.',
      'Tap Your plan for the menu. Type or paste the sections you want, one a line, with sub-sections and dishes indented under them.',
      'Or tap Upload a file and pick an Excel sheet, a PDF, a photo, a scan or a text file of your plan. It is read into the box. Check it and correct it.',
      'In Excel, put sections in the first column, sub-sections in the next column and dishes in the one after. Each column further right is read as sitting under the row above.',
      'Tap Save plan, then Look now. The suggestions follow your plan.',
      'For doubles, go to the Dishes that look alike card and tap Look now. Each row shows the two dishes with their section and price.',
      'Open Menu Items, fix or remove the double yourself, then tick the row and tap Dismiss.',
    ],
    notes: [
      'A file only fills the box. Nothing is kept until you tap Save plan.',
      'The plan stays in use for every later look until you change it or tap Remove plan.',
      'The assistant adds a section of its own only for dishes that fit nowhere in your plan.',
      'Nothing is merged or removed for you. A dish that is switched off is looked at too, since an old copy left switched off is the usual double.',
      'A pair you dismiss is not pointed out again for two months.',
    ],
    words: 'upload recommended menu plan category subcategory sections file excel xlsx spreadsheet photo pdf duplicate double same dish twice look alike merge assistant claude ai',
  },
  {
    id: 'assistant-photos',
    page: '/integrations',
    title: 'Let the assistant check, crop and make dish photos',
    open: { to: '/integrations/suggestions', label: 'Open Suggestions' },
    steps: [
      'Open Integrations → Assistant and check Photo suggestions is on. For made photos, switch on Make photos for dishes with none; it needs a Google key under Integrations → API keys.',
      'Open Integrations → Suggestions. A better crop for a dish photo shows the picture Now and Proposed: tick and Approve to put the new one on the menu.',
      'Photos worth retaking and Photos that would cut out cleanly only point things out. Fix the photo on the dish, then Dismiss.',
      'Descriptions for library pictures: change the words under What it shows if you like, then Approve.',
      'Made photos for dishes with none: look at each picture, and Approve only if it looks like what you serve.',
    ],
    notes: [
      'Nothing changes on the menu until you press Approve.',
      'A made photo is not a photo of your own food. The system keeps a record that it was made. A real photo is always better: Dishes with no photo at the bottom lists which to photograph first.',
      'It makes three photos at a time, for the best sellers first. Press Look now for three more.',
      'Each photo is looked at once. A new photo on a dish is looked at the next night.',
      'On Customers → Reviews, a waiting review with a photo shows a line from the assistant on what the photo shows.',
      'If making a picture says the model is not known, type the current name under Integrations → Assistant → Making pictures.',
    ],
    words: 'photo picture image crop generate make ai blurry dark cut out cutout alt text tags library review photo google gemini',
  },

  // ── Team ──────────────────────────────────────────────────────────────────
  {
    id: 'time-clock-read',
    page: '/time-clock',
    title: 'See who clocked in and how many hours they worked',
    steps: [
      'Open Time Clock.',
      'History lists each clock in and clock out. "Still in" means the person has not clocked out.',
      'Summary adds up the hours per person for the period.',
    ],
    words: 'attendance hours punch clock in out timesheet',
  },
  {
    id: 'clock-machine',
    page: '/time-clock',
    title: 'Connect a staff member to the fingerprint clock',
    steps: [
      'Open Time Clock → Clock machine.',
      'On the clock, each person has a User ID.',
      '"Numbers nobody has" lists IDs the clock sent that no staff member has yet.',
      'Tap "Give to…" beside the number and pick the staff member.',
    ],
    notes: [
      'A new clock waits in the list until you allow it.',
      '"How to set up the clock" on that page shows the clock\'s own menu steps.',
    ],
    words: 'fingerprint zkteco clock machine user id attendance',
  },
  {
    id: 'activity-audit',
    page: '/activity',
    title: 'Check what a cashier did on the till',
    steps: [
      'Open POS Activity.',
      'Filter by staff member and by action.',
      'Each row shows the time, who did it and the details, such as a void, a discount or a cash movement.',
    ],
    words: 'audit log cashier activity void discount history',
  },
  {
    id: 'account-lock',
    page: '/account',
    title: 'Change when the till locks itself for you',
    steps: [
      'Open My Account.',
      'Under "POS auto-lock after inactivity" choose how long the till waits with no taps before it locks: from 2 minutes to 30, or never.',
    ],
    notes: [
      'Each staff member sets their own. A shared iPad uses the setting of whoever is signed in.',
    ],
    words: 'auto lock till pos idle sign in session my account',
  },
];

/** Menu pages with no guide yet. A page leaves this list when its first guide is written. */
export const PAGES_WITHOUT_GUIDE: string[] = [
  // Help is the guides themselves.
  '/help',
];

export function guidesForPage(page: string, guides: Guide[] = GUIDES): Guide[] {
  return guides.filter((g) => g.page === page);
}

/** Guides whose title, steps, notes or search words hold every word typed. */
export function searchGuides(query: string, guides: Guide[] = GUIDES): Guide[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return guides;
  return guides.filter((g) => {
    const text = [g.title, g.about ?? '', g.words ?? '', ...g.steps, ...(g.notes ?? [])].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
