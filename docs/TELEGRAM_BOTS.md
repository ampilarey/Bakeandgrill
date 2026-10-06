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
| 2 | Manager | Next |
| 3 | Staff (cashier), plus group feeds (online orders, buying list) | Later |
| 4 | Kitchen staff | Later |
| 5 | Driver | Later (linking works already) |

A manager linked today already gets alerts and whatever buttons their
permissions allow (for example Open orders, Sold out, Reject a refund).

## Owner buttons (step 1)

| Button / command | What it does |
|---|---|
| 📊 Today, `/today`, `/today 2026-10-05` | Sales, orders, average, discounts, refunds, by order type, by payment method, best sellers, open shifts. Same figures as Admin → Reports → Daily summary. A past day also shows the change on the same weekday a week before. |
| 💵 Shifts, `/shifts` | Each open shift: who, which till, since when, takings, float, cash sales, cash in/out, and the cash that should be in the drawer. When none is open, the last close and its difference. |
| 🧾 Open orders, `/orders` | Orders from the last 24 hours not finished yet, oldest first. |
| ✅ Approvals, `/approvals` | Refunds waiting, one card each. |
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

**Day report:** when the last open shift closes, linked owners get the day's
report: the Today figures, each shift closed today with its drawer
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

With "Telegram instead of SMS" on, a code that reached the approver on
Telegram counts as sent (`SmsLog::reachedRecipient()`), so the till does not
report "could not send".

## Alerts

`SmsService` calls `TelegramAlertCopier` for every text it handles, next to
the email copy. A text reaches Telegram when:

1. Admin → Telegram → "Staff and owner alerts on Telegram" is on (default on);
2. its type is in the `staff` category of `SmsTypeRegistry`, or is
   `discount_approval_otp`;
3. the number belongs to an active staff member with a usable link (an
   enabled bot that serves their role, not blocked).

Customer texts never go to Telegram, even to a staff member's number.

Two modes:

- **Alongside SMS** (default): the SMS goes as before; Telegram is a copy,
  sent after the response.
- **Instead of SMS**: a linked person gets Telegram only. The SMS log row is
  `suppressed`, "Sent on Telegram instead of SMS.", cost 0. If Telegram
  cannot be reached (5-second limit) the SMS is sent as before.

An alert whose SMS is switched off (type switch, kill switch, budget) still
goes to Telegram, the same rule as email.

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

## Security

- Webhook: `POST /api/telegram/webhook/{bot}`, outside the staff-token group,
  refused (403) without the bot's `X-Telegram-Bot-Api-Secret-Token`, or when
  the bot is off. Each update is acted on once (`update_id` cache), and a
  chat gets at most 20 replies in 10 seconds.
- Buttons: the callback must come from the linked person in their own
  private chat; every action re-checks permissions.
- Bot tokens are encrypted at rest and never returned by the API.
- Admin → Telegram needs `telegram.manage` (owner-only by default).
- Groups are ignored in step 1.

## Where things live

| What | Where |
|---|---|
| Tables | `telegram_bots`, `telegram_links`, `telegram_link_codes` (`2026_10_06_120000_create_telegram_bots`) |
| Bot API | `app/Domains/Telegram/Services/TelegramClient.php` |
| Linking | `TelegramLinker` |
| Messages and buttons | `TelegramUpdateHandler`, `TelegramCommands`, `TelegramOwnerExtras` (step 1b) |
| Day report | `Listeners/SendDayReportOnLastShiftClose` (on `ShiftClosed`), setting `telegram_day_report_enabled` |
| Discount by button | `DiscountApprovalService::decide()` / `status()`, migration `2026_10_07_100000_discount_approvals_decided_on_telegram`, POS `useOrderCreation` polling |
| Alerts | `TelegramAlertCopier` (called from `SmsService`) |
| Admin API | `TelegramAdminController`, `routes/domains/telegram.php` |
| Webhook | `TelegramWebhookController`, `routes/api.php` |
| Admin page | `apps/admin-dashboard/src/pages/TelegramPage.tsx` |
| Settings keys | `telegram_alerts_enabled`, `telegram_alerts_instead_of_sms` |
| Tests | `backend/tests/Feature/Telegram/*` |
