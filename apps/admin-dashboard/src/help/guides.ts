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
      'A line under Opening such as "Short MVR 60.00 vs last close" means the drawer started with less than the last shift left.',
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
    id: 'make-label',
    page: '/labels',
    title: 'Print stickers for packs',
    open: { to: '/labels', label: 'Open Labels' },
    steps: [
      'Open Labels. It opens on Make a label.',
      'Step 1: say what the label is for. Pick a menu item, or something not on the menu.',
      'Step 2: pick the label from the picture cards.',
      'Step 3: check the preview. Tap any part of it to change that part.',
      'Step 4: type how many and print.',
    ],
    notes: [
      'Every print is saved, so it can be printed again from Print labels.',
      'On a phone the PDF is the one to print.',
    ],
    words: 'sticker label print pack expiry',
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
    ],
    words: 'sms email telegram alert notification switch off stop',
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
];

/** Menu pages with no guide yet. A page leaves this list when its first guide is written. */
export const PAGES_WITHOUT_GUIDE: string[] = [
  '/orders', '/kds', '/reservations', '/delivery', '/kitchen',
  '/modifiers', '/inventory', '/purchasing', '/wholesale',
  '/catering', '/loyalty', '/sms', '/social', '/signage', '/posters',
  '/content/website', '/content/order-app', '/media',
  '/analytics', '/forecasts',
  '/settings', '/telegram', '/devices', '/system-health', '/integrations',
  '/time-clock', '/activity', '/account', '/help',
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
