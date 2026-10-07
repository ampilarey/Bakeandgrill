# Telegram staff bots

Owner, 2026-10-06: "Build owner bot now. Then manager. Then staff (cashier)."
Roles: owner, manager, staff (cashier), kitchen staff, driver.

## What it is

A Telegram bot the business owns. Staff and drivers link their own Telegram
once; after that:

- **Alerts** arrive in their Telegram chat: every "Staff" and "Owner" alert in
  the SMS Control Center (refund waiting, shift left open, cash difference,
  complaints, stock, backups, social channel, GST due…) and discount approval
  codes. Free.
- **Buttons** under the message box answer questions and do small jobs, each
  one checked against the person's own permissions at the moment it runs.

One bot can serve every role (the default), or each role can have its own
bot. A bot serves the roles ticked on it in Admin → Telegram.

## Levels

| Step | Level | Status |
|---|---|---|
| 1 | **Owner**: alerts; Today, Shifts, Open orders, Approvals, Sold out | Built |
| 1b | **Owner, more** (2026-10-07): Week/Month, Cashiers, day report, Shop switches, Refunds owed, Complaints, Customer, discount approval by button | Built |
| 2 | **Online orders group feed** (2026-10-07) | Built |
| 3 | **Driver**: a message per delivery, My deliveries, Picked up / On the way / Delivered (2026-10-07) | Built |
| 4 | **Manager** (2026-10-07): menu, help, day report and shop-phone alerts follow their permissions | Built |
| 5 | **Cashier** and **buying list** (2026-10-07): Online orders, Buying list, group feed for the buying list | Built |
| 6 | Kitchen staff | Next |

Owner, 2026-10-07, on the list of what the bot could do next: "Do it" (group
feed and Driver first, then Manager).

## Owner buttons (step 1)

| Button / command | What it does |
|---|---|
| 📊 Today, `/today`, `/today 2026-10-05` | Sales, orders, average, discounts, refunds, by order type, by payment method, best sellers, open shifts. Same figures as Admin → Reports → Daily summary. A past day also shows the change on the same weekday a week before. |
| 💵 Shifts, `/shifts` | Each open shift: who, which till, since when, takings, float, cash sales, cash in/out, and the cash that should be in the drawer. When none is open, the last close and its difference. |
| 🧾 Open orders, `/orders` | Orders from the last 24 hours not finished yet, oldest first. |
| ✅ Approvals, `/approvals` | Refunds and new tills waiting, one card each. |
| 🚫 Sold out, `sold out kottu`, `back on kottu` | Lists what is sold out with "is back" buttons; marks an item sold out or back. Changes the till, website, order app and TV screens; audited as `item.86` / `item.un86` with source `telegram`. |
| ❓ Help, `/help` | What each button does. |
| `/stop` | Unlinks the chat. |

### Refund decisions

- **Approve** shows only to the owner, and only for a refund that takes no
  cash from a drawer (card, online, credit, gift card). It asks "Approve
  without the customer's code?" first, then uses the same owner override
  Admin has (`otp_owner_override`).
- A refund that pays **cash from a drawer** is approved at the till: the
  approver's open shift is where the cash leaves, and Telegram has no drawer.
- A refund that needs the **customer's code** (anyone but the owner) is
  approved at the till too.
- **Reject** is for anyone with refund rights. The bot asks for the reason the
  customer is told, then rejects with it. Tapping any menu button cancels.

The "refund waiting for approval" alert arrives as the refund card itself,
with these buttons.

## Owner buttons, step 1b (2026-10-07)

Owner, on the list of what else the bot could do: "Up to u".

| Button / command | What it does |
|---|---|
| 📈 Week, `/week`, `/month` | Sales and orders so far this week (month), against the same days last week (month); per day, best and quietest day, best sellers. Buttons for last week and last month. |
| 👥 Cashiers, `/cashiers` | Each cashier's sales, orders, average, discounts given and refunds asked today; who is on shift. |
| 🏪 Shop, `/shop` | Online orders and delivery: taking orders, paused (by whom, when) or closed by the schedule; today's and tomorrow's hours. Buttons: pause / resume online orders (the same keys as Admin's "Pause all online ordering"), pause / resume delivery, closed today / open today, closed tomorrow / open tomorrow. A closed day is a whole-day closure in the same list Admin edits (website, order app and the hours auto-post read it); closed today also pauses online orders and open today resumes them. Needs `service_availability.manage_public` (pausing) or `settings.update` (closed days). Closing early is not offered: closures are whole days. |
| 💸 Refunds owed, `/owed` | Approved card / bank refunds not yet paid back, with Bank transfer, Card and Cash buttons. Bank and card ask for the reference (or `-`); then `markPaidOut` runs and the customer is told, as in Admin. |
| 💬 Complaints, `/complaints` | Open complaint-box entries, newest first: Reply (asks for the words, texts the customer through `messageCustomer`, and marks it taken up), Taking it up, Resolved. Owner-only (`complaints.manage`). The new-complaint alert arrives as this card. |
| 🔎 Customer, `/customer 7820288` | A phone number or a name: tier and points to spend, orders and spend, last visit, credit owed and limit, deposit, the last three orders. Several matches give a choice. |

**Day report:** when the last open shift closes, linked owners (and
managers with `reports.view`, since step 4) get the day's report: the Today figures, each shift closed today with its drawer
difference, and refunds still owed. Once a day; switch in Admin → Telegram
("Day report when the last shift closes", on by default).

### Discount approval by button

The discount approval code alert arrives as a card (amount, %, order, who
asked, reason, the code) with **Approve** and **Decline** for the approvers
the request went to. Approve marks the request `granted`
(`discount_approvals.decided_by` / `decided_at`). The till, while its code
screen is open, asks `GET /api/orders/{order}/discount/approval/{id}` every
2.5 seconds; on `granted` it confirms with no code and the charge carries on;
on `declined` it shows who declined. The code still works exactly as before,
and an older till that does not ask simply waits for the code. Confirm
without a code is refused unless the request is `granted`.

For an approver whose channels leave SMS out, a code that reached them on
Telegram (or by email) counts as sent (`SmsLog::reachedRecipient()`), so the
till does not report "could not send".

## Alerts

`SmsService` calls `TelegramAlertCopier` for every text it handles, next to
the email copy. A text reaches Telegram when:

1. Admin → Telegram → "Staff and owner alerts on Telegram" is on (default on);
2. its type is in the `staff` category of `SmsTypeRegistry`, or is
   `discount_approval_otp`, and its Telegram switch in the Control Center is on;
3. the person's channels include Telegram (Admin → SMS Control Center → Who
   gets alerts, and how; see `docs/NOTIFICATION_CHANNELS.md`);
4. they are an active staff member with a usable link (an enabled bot that
   serves their role, not blocked).

Customer texts never go to Telegram, even to a staff member's number.

A person whose channels include SMS gets Telegram as a copy, sent after the
response. A person whose channels leave SMS out gets Telegram at once; the
SMS log row is `suppressed`, "Sent on Telegram instead of SMS.", cost 0, and
if neither Telegram (5-second limit) nor email reached them the SMS is sent.
This replaced the single "Telegram instead of SMS" switch (2026-10-07).

An alert whose SMS is switched off (type switch, kill switch, budget) still
goes to Telegram, the same rule as email.

### Alerts sent to the business phone

Some owner alerts go to the shop's business phone by default (new till
waiting for approval, deliveries past ETA, unstarted paid orders, TV
screens, social posts). That number belongs to no staff account, so those
alerts also go to every linked **owner** on Telegram, and to linked
managers for the ones they can act on (see Managers); the SMS to the shop
phone is sent as before (2026-10-07).

### New till waiting for approval

Owner, 2026-10-07: "No button for approval?" The "POS device waiting for
approval" alert arrives as a card (till name, its ID, who signed in on it,
when) with **Approve** and **Reject**, for anyone with `devices.approve`
(owner-only by default). Pending tills are also listed under ✅ Approvals.

- **Approve** does what Admin → Settings → Devices does (status `approved`,
  switched on, audited as `device.approved` with source `telegram`). The
  till checks every 20 seconds while it waits, so it unlocks by itself.
- **Reject** asks first ("Yes, reject" / "Back"): a rejected till can never
  sign in again. Audited as `device.rejected`.
- A till another owner has already decided shows "Already approved" and
  changes nothing.

### Copies go even when the request was refused

The Telegram (and email) copy of an alert is sent after the response. Laravel
skips after-response work when the response is an error, and a new till's
first request is refused (403, waiting for approval), so the SMS went and the
Telegram copy was dropped (owner, 2026-10-07: "Notifications didn't come to
telegram"). `DeferAfterResponse::run(..., always: true)` marks both copies to
run on any response.

### Checking why something did not arrive

`php artisan telegram:check` (read-only) lists the bots, who is linked and
whether each link works, the alert switches, the business phone, who
discount requests go to and whether each is linked, and the last staff
alerts with their SMS status and, since 2026-10-07, where the Telegram copy
actually went (`→ Owner ✓`, or `✗` when Telegram refused it). An alert to
the business phone shows "goes to linked owners". A discount approver added in Discount
controls as a typed number gets the Approve buttons when that number is a
linked staff member's phone.

## Linking

Admin → Telegram → People → **Link** makes a one-time link
(`https://t.me/<bot>?start=<code>`) and a QR. The person opens it on their
own phone and presses Start. The code:

- works once, for 60 minutes, for that one person and that one bot;
- is stored only as a SHA-256 hash (`telegram_link_codes`);
- replaces any earlier unused code for the same person and bot.

A chat that is not linked is told only how to link. A person who is
deactivated, or whose role the bot no longer serves, is refused. Admin can
send a test and unlink; the person can send `/stop`.

## Setting up a bot

1. In Telegram, open **@BotFather**, send `/newbot`, pick a name and a
   username ending in "bot". Copy the token.
2. Admin → Telegram → Add a bot: paste the token, tick the roles.
3. The server checks the token (`getMe`), points the bot at
   `APP_URL/api/telegram/webhook/{id}` with a secret (`setWebhook`), and sets
   the "/" command list.

**TEST and production need separate bots.** Telegram sends a bot's messages
to one address only. Adding a bot that already points at another site stops
with a warning; "Move it here" takes it over (only when that site no longer
uses it). "Check" shows when a bot has been taken by another site;
"Reconnect" brings it back.

## Online orders in a shop group (step 2)

Each paid online order (pickup, delivery, dine-in ordered ahead; placed by a
customer, not rung up at the till) is posted to the shop's Telegram group
as a card: order number and type, total and how it was paid, when it was
placed and when it is wanted, every item with its options and notes, the
customer's name and phone, the address with the map pin (delivery), and the
customer's note.

| Button | Does | Same as |
|---|---|---|
| 👨‍🍳 Start | Cooking (`in_progress`, `fired_at`) | Till → Start cooking |
| ✅ Ready | Ready; an online pickup must be paid | Till → Mark ready |
| 📦 Collected | Done, pickup only; must be paid | Till → Picked up |

- **Who may press.** The person pressing must have linked their own Telegram
  (any of the shop's bots) and hold `pos.manage_order_status` (or
  `pos.active_orders`, which includes it). Anyone else gets "Link your own
  Telegram first" or "Your account cannot change orders" and nothing changes.
  The order's rules apply as on the till: a cancelled order cannot be marked
  ready.
- **Who did it.** The card says "Cooking by Ali", "Ready by Ali". Audited as
  `order.started` / `order.ready` / `order.completed` with source `telegram`
  under that person.
- **The card follows the order.** A move on the till, the kitchen screen or
  by the driver edits the card (`OrderStatusChanged`): Cooking, Ready (needs
  a driver / driver Ibrahim), With the driver, On the way, Delivered, Done,
  Cancelled. Buttons disappear once there is nothing left to press.

**Setting it up:** add the bot to the group, then the owner (anyone with
`telegram.manage`, from their own linked Telegram) sends
`/feed@<botusername>` in the group. `/stopfeed` stops it. The bot says how
when it is added, and otherwise stays quiet in the group. Admin → Telegram →
Groups lists each group with an on/off switch, "Send a test" and "Remove"
(the bot leaves the group). A group the bot was removed from is switched off
with the reason shown; a group that becomes a supergroup keeps its feed.

Telegram's privacy mode means the bot only sees commands addressed to it in
a group, which is all it needs. `/feed` and `/stopfeed` appear in the
group's "/" menu after the bot is next connected (Reconnect or Check).

## Drivers (step 3)

A driver linked in Admin → Telegram → People gets:

- **A message the moment a delivery is given to them**, from the delivery
  screen or anywhere else the driver is set (`OrderObserver`, on
  `delivery_driver_id`): customer name and phone, address, map pin, the
  customer's delivery note, items, and **Collect MVR …** or **Paid already:
  collect nothing**. A delivery taken off them says so.
- **🛵 My deliveries** (`/deliveries`): every open delivery that is theirs,
  with the cash to collect in all.
- **Buttons** on each card, one step at a time, the same moves as the driver
  app: 📦 Picked up (`picked_up_at`), 🛵 On the way, ✅ Delivered
  (`delivered_at`; "Hand MVR … to the shop" when there is cash). Audited as
  `delivery.picked_up` / `delivery.on_the_way` / `delivery.delivered` with
  source `telegram` and the driver's name.
- A delivery given to a driver while it was cooking stays "ready" when the
  kitchen finishes (only the delivery screen dispatches it). On Telegram,
  Picked up from the counter dispatches it first (`out_for_delivery`, which
  stamps the promised time), then marks it picked up.

A driver can only move their own deliveries, never skip a step, and sees no
staff buttons. A driver switched off in Admin gets nothing.

## Managers (step 4)

A manager linked to a bot that serves the Manager role gets the menu and
help their permissions allow, nothing more; the owner changes a manager's
permissions in Admin → Staff as before.

- **Day report** when the last shift closes: owners, and managers with
  `reports.view` (on by default for managers).
- **Shop-phone alerts** (those sent to the business phone): owners get all
  of them; a manager gets "new till waiting" when they hold
  `devices.approve`, and "deliveries past their time" / "paid online order
  not started" with `orders.view`.
- **Help** lists only their buttons; the discount line shows only to
  discount approvers (`promotions.discount_override`), the day report line
  only with `reports.view`.
- Refund **Approve** stays owner-only (it uses the owner override); managers
  approve refunds at the till.

## Cashiers (step 5)

Owner, 2026-10-07: "Next". A cashier's menu follows their permissions, like
everyone else's. Beyond alerts, Open orders and Sold out:

| Button / command | What it does | Needs |
|---|---|---|
| 📥 Online orders, `/online` | Today's paid online orders not with a driver or collected yet, oldest first, each as the group card with Start / Ready / Collected; the card then says who pressed | `pos.manage_order_status` |
| 🛒 Buying list, `/buying` | See below | any purchase request permission |

There is **no "my shift"** button: the cash count at close is blind, so the
bot never tells a cashier what the drawer should hold or what the shift
took (shift history is manager territory, 2026-09-01).

## Buying list (step 5)

The same purchase requests as Admin → Buying list, with the same rules
(`PurchaseRequestService`):

- **Adding.** Tap 🛒 Buying list and type what is needed, or start with
  `need`: `5 kg onions, 2 l milk, tissue`. Commas, semicolons or new lines
  separate items; quantity and unit are optional (1 piece); `urgent` marks
  it urgent. A name that matches a stock item exactly is linked to it.
  Source `telegram`. Needs `purchase_requests.create` (cashiers and kitchen
  staff have it).
- **Approving.** Everyone linked with `purchase_requests.approve` gets the
  new request (from Telegram, Admin or the till) with **Approve** and
  **Reject**; Reject asks the reason. The person who asked is told the
  decision. The person who asked never approves their own unless they are
  an owner or manager (the service's rule). An auto-approved request (under
  the Admin threshold) skips this.
- **Buying.** Whoever is sent to buy (Admin assigns) gets the list with
  **✅ … bought** and **✖ Not there** per item. Bought asks what was paid in
  total (`120`, `45.50`, or `-` for no bill) and records the unit price, so
  price history and the expense see it. Needs `purchase_requests.buy`.
- **Cards follow the request.** Every card sent (approvers', buyer's,
  requester's, group's) is kept in `telegram_messages` and redrawn on any
  change of status, buyer or item, from any screen.
- **In a group.** `/feed@<bot> buying` (owner) makes a group follow the
  buying list: each new request with Approve and Reject (Reject in a group
  records no reason), pressed by linked staff with the permission.
  `/stopfeed@<bot> buying` stops it. Admin → Telegram → Groups has a tick
  box per feed (Online orders, Buying list).

## Security

- Webhook: `POST /api/telegram/webhook/{bot}`, outside the staff-token group,
  refused (403) without the bot's `X-Telegram-Bot-Api-Secret-Token`, or when
  the bot is off. Each update is acted on once (`update_id` cache), and a
  chat gets at most 20 replies in 10 seconds.
- Buttons in a private chat: the callback must come from the linked person
  in their own chat; every action re-checks permissions.
- Buttons in a group: the presser is found by their own private link (their
  Telegram id is their private chat id) and checked like on the till.
  Turning a group on needs `telegram.manage`.
- Bot tokens are encrypted at rest and never returned by the API.
- Admin → Telegram needs `telegram.manage` (owner-only by default).

## Where things live

| What | Where |
|---|---|
| Tables | `telegram_bots`, `telegram_links`, `telegram_link_codes` (`2026_10_06_120000_create_telegram_bots`); `telegram_groups`, `telegram_group_posts` (`2026_10_09_100000_create_telegram_groups`) |
| Group feed | `TelegramGroupFeed`, `Listeners/FeedOnlineOrdersToTelegramGroups` (on `OrderPaid` and `OrderStatusChanged`) |
| Drivers | `TelegramDriverDesk`, called from `OrderObserver` when the driver changes |
| Card text | `Support/TelegramOrderText` (items, customer, address, cash to collect) |
| Cashier menu | `TelegramCashierDesk` (Online orders) |
| Buying list | `TelegramBuyingList`, `Observers/PurchaseRequestTelegramObserver`; table `telegram_messages` (`2026_10_09_120000_create_telegram_messages`) |
| Bot API | `app/Domains/Telegram/Services/TelegramClient.php` |
| Linking | `TelegramLinker` |
| Messages and buttons | `TelegramUpdateHandler`, `TelegramCommands`, `TelegramOwnerExtras` (step 1b; till approval `deviceCard()`) |
| Day report | `Listeners/SendDayReportOnLastShiftClose` (on `ShiftClosed`), setting `telegram_day_report_enabled` |
| Discount by button | `DiscountApprovalService::decide()` / `status()`, migration `2026_10_07_100000_discount_approvals_decided_on_telegram`, POS `useOrderCreation` polling |
| Alerts | `TelegramAlertCopier` (called from `SmsService`) |
| Admin API | `TelegramAdminController`, `routes/domains/telegram.php` |
| Webhook | `TelegramWebhookController`, `routes/api.php` |
| Admin page | `apps/admin-dashboard/src/pages/TelegramPage.tsx` (Bots, Groups, Alerts, People) |
| Settings keys | `telegram_alerts_enabled`; channels: `notify_channels_roles`, `sms_type_telegram.{type}`, `users.notify_channels` |
| Tests | `backend/tests/Feature/Telegram/*` |
