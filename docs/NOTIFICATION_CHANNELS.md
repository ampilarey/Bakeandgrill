# Who gets alerts, and how

Owner, 2026-10-07: "an acc may not have mobile number but email so he should
receive email" … "admin is the one who controls everything, for example admin
decides in which channel notifications goes to a specific role or person".

Admin → System → Notifications → People → **How each person gets alerts**.

## One page, one switch per alert (notifications audit, 2026-10-10)

Owner: "to make setting less complicated". Everything about texts, emails and
Telegram alerts is on **Admin → System → Notifications**:

| Tab | What is there | Was |
|---|---|---|
| Messages | Every message, one row each: its SMS, Email and Telegram switches, who gets it (groups, people, exceptions, typed numbers and emails: "Who gets it" under Edit), when it goes ("When it sends" numbers under Edit), who may send it by hand, its wording and "Send me a test". The three Telegram-only alerts (day report, order cancelled at the till, cash taken out) are rows under "Telegram only". | SMS → Control Center, SMS → Automations, Settings → Notifications, Telegram → Alerts |
| People | One card per person: their channels, what reaches them, the alerts that go to them (mute one, add one); By role: each role's channels and a link to the alerts that reach it; who gets order alerts; extra numbers that are not staff | SMS → Recipients, Control Center → Who gets alerts |
| Rules | Stop all SMS (owner), Telegram alerts on or off, the spending limit, quiet hours, limits, the hourly email cap, how long the log is kept | Control Center → Rules & limits, Telegram → Alerts |
| Log | Every message the system tried to send, and the staff order alerts with Resend | SMS → Audit Logs, the bottom of SMS → Automations |

SMS & Messaging is **SMS campaigns** now: campaigns, past blasts, contacts and
groups, scheduled messages, and the templates they use. The wording of an
automatic message is edited on its row in Messages, its other wordings too
(the delivery version of "order ready", the urgent complaint alert, each
credit reminder: `SmsTypeRegistry::EXTRA_TEMPLATES`, saved through
`PATCH /api/admin/sms/types/{key}` with `extra_templates`); Templates lists
them with a link (`used_by` on `GET /api/admin/sms/templates`).

**An alert's row is its only switch.** The second switches that sat on
Purchasing (reorder point, price rises), Settings → Notifications (stock
alert), Delivery (deliveries past ETA), the Complaint box (weekly summary,
unread nudge), the Social Hub (approval link, weekly digest) and TV Signage
(screen offline) are gone; those pages link to the row. A sender asks
`App\Domains\Notifications\Support\AlertSwitch::isOn($type)` (SMS, Email or
Telegram on) before working an alert out. Switches several messages shared
are split, one per message (each catering and reservation text, counter and
online payment confirmations, admin direct SMS, the two catering reminders).
A number that only says when an alert goes (shift left open, cash
difference, unstarted order, unread complaints, GST reminder days) refuses 0:
off is the row. Migration `2026_10_10_120000_notifications_one_switch_per_alert`
moved every old value across without changing what sends.

The wholesale numbers that were on Settings → Credit accounts ("Nudge a shop
to report sales after", "Text owners about unreconciled stock after", the
credit reminder cadence) and the GST reminder days sit under their rows' Edit
since the re-audit (below); Credit accounts and GST link to the rows.

Old links land on the new page: `/sms?tab=control-center` and `automations`
→ Messages, `recipients` → People, `logs` → Log (a campaign's `campaign_id`
kept), `/settings/notifications` and `/sms/control-center` → Messages. A
link can open one row: `/notifications/messages?open=owner_stock_reorder`;
`?q=complaint` narrows the list and `?group=staff` picks a group.

Routes and their permissions did not change; each tab shows to whoever held
the permission its old page used (Messages and Rules: Manage SMS settings or
View SMS logs, Telegram's parts with Telegram; People: Manage SMS settings,
Update staff or Manage SMS contacts, each section to its own; Log: View SMS
logs). A "When it sends" number is saved through its old endpoint, so it
needs the Settings (shift and order numbers) or complaints permission it
always did.

### Staff alerts that were not

- **Shift reminders** went out as scheduled marketing messages (unsubscribe
  line, one a day, held by quiet hours, no Telegram). `staff:shift-reminders`
  (every five minutes) sends them an hour before each shift as the staff alert
  `staff_shift_reminder`, never held by quiet hours. The migration cancels
  the old queued ones.
- **Order confirmed** has its own row (`staff_order_confirmed`) and template
  (`order_confirmed`); it hid under "Staff: other order alerts".
- **Staff without a phone** get order alerts, shift reminders and "shift
  assigned" by email or Telegram (`NotificationChannels::addressFor()`); one
  nothing can reach is left out. Sent that way counts as sent in the log.

## Who gets each alert (re-audit, 2026-10-10)

Owner: "each notification need to be controlled separately for sms, email,
telegram. And each user group settings must be able to control group wise and
each staff separately."

**Every row has its own switch per channel.** A row shows a switch for each
channel it can go by (`SmsTypeRegistry::channels($entry)`: SMS and Email for
every message, Telegram as well for staff and owner alerts and the discount
approval code, Telegram alone for the three Telegram-only rows). A message
the system also sends as an email of its own (order and payment confirmation,
gift card, the catering emails) has an Email switch for that email:
`SmsTypeRegistry::isEmailEnabled($type)` gates it, so off means no email. A
row whose SMS is always on (sign-in codes) shows "Always on" for SMS and
Email. The three "email copies" category switches (customers, staff,
promotions) are gone; Rules → Emails keeps only the hourly cap.

**Every staff and owner alert has an audience**
(`App\Domains\Notifications\Support\AlertAudience`), stored as JSON in
`sms_type_recipients.{type}`:

| Part | What it holds |
|---|---|
| `groups` | `role:{slug}` (every active person in the role), `perm:{slug}` (everyone with the permission, from the curated `PERMISSION_GROUPS`: manages catering, approves refunds, sees reports, manages stock, manages complaints, approves a till), `on_shift` (the staff on shift when it happens, by their own order-alert switch), `catering_team` (the person handling the request, everyone who manages catering until someone does), `business_phone` (the shop's number, an address not a person) |
| `users` | people who always get it, whatever the groups say |
| `except` | people who never get it, even when a group includes them |
| `phones` | typed numbers that are not staff (normalised to +960) |
| `emails` | typed addresses that are not staff (`email:{address}` tokens; the alert goes by email only) |

`AlertAudience::DEFAULT_GROUPS` says where each alert goes until the owner
changes it (order alerts → on shift; stock, complaints, shifts, refunds,
trade, GST → owners and managers; alerts about a till or a channel → the
business phone; a locked account or an ops failure → owners only; a new
catering request → whoever manages catering, then the handler; refund
requests → whoever can approve refunds; the Telegram-only rows → owners and
whoever can see reports). An alert not listed decides its recipient in code
(the customer, the rostered person) and has no audience.

`AlertAudience::addresses($type, $context)` is what a sender calls
(`OwnerPhones::for()` delegates to it): each person's phone, or `user:{id}`
when they have none, so the other channels reach them and a person nothing
reaches is a `failed` log row rather than silence; then the shop phone, the
typed numbers and `email:` tokens. `$context` carries `except` (the person who
asked, for refunds), `handler` (the catering request's handler), `at` (the
shift moment) and `skip` (groups the caller resolves itself: the order
alerts' `on_shift` is resolved by `StaffNotificationRoutingService`, which
adds the audience's roles, people, exceptions and numbers on top of the shift
and the fallback staff; a muted person is not even a fallback). The
`AudienceResolver` loads the active staff once (role, permissions, Telegram
link) and gives `reach($user)`: the channels that can reach them today.

**In Admin** (Messages → a row → Edit → Who gets it): chips for the groups
with how many people each has, "Add a person who always gets it", "Add a
person who never gets it", typed numbers and emails, "Goes to now" (the
resolved names, each with the channels that reach them, and the addresses
that are not people) and "Back to the usual people". People → a person's
card → "Alerts" lists every alert that reaches them with Mute / Unmute / Add
(the same audience, edited from the person's side); By role links to
`/notifications/messages?to=role:manager` (`?to=user:12` for one person),
which filters Messages to the alerts that reach that role or person. The
Control Center API carries `channels`, `audience`, `audience_default`,
`audience_custom`, `audience_people` and `audience_configurable` per row,
and `audience_groups` and `staff_options` at the top; `PATCH
/admin/sms/types/{key}` takes `audience` (null = back to the default; 422
for an empty audience, an unknown group or a row without one),
`email_enabled` (422 for a row with no email or an always-on row) and
`telegram_enabled` (422 for a row with no Telegram). Routes and permissions
did not change.

**Duplicates removed.** The catering "notify phone / email" on Settings →
Ordering (they became typed entries on the five catering staff rows, where
they went); the three email copies switches; the wholesale and GST timing
numbers on Credit accounts and GST (now "When it sends" on their rows, 0 no
longer means off: the row is). Migration
`2026_10_10_150000_notifications_audience_per_alert` moves every old choice
across (old recipient modes → groups and people; "Staff: new customer" →
the fallback staff who got it; an email switch that was off → Email off on
each row it covered; a 0 → the row off and the default number), widens the
log `to` column so a typed email fits, and leaves the old settings in place
unread.

Three things send to more people than before, by design: a simple catering
web inquiry goes to the catering request audience, not only the old fallback
phone; refund approvers and low-stock recipients without a phone get the
alert by email or Telegram; the day report, till cancellation and cash-out
alerts honour Rules → Telegram alerts like every other Telegram alert. One
thing sends less: a catering customer's lifecycle and reminder emails went
out twice (the message's own email and the copy); they go once now.

## One alert, one message per person (2026-10-10)

Owner, with a screenshot: "Opening float differs from the last close"
arrived twice on Telegram. An alert goes out as one `SmsService::send` per
address, and several addresses could lead to one person:

- the same number typed two ways on two accounts ("7820288" and
  "+9607820288": staff phones are stored as typed, and the unique index
  compares the text);
- the business phone, whose Telegram copy goes to linked owners, beside an
  owner's own phone in the same audience;
- a manager (or any account in the audience) whose phone is the shop's;
- a Telegram send that timed out after Telegram had shown it, followed by the
  copy that goes with the SMS safety net.

Now:

- **Numbers are compared by their seven digits.** `AlertAudience::addressKey()`
  ("mv:7820288" for every way of typing it; emails by lower case);
  `AlertAudience::unique()` keeps the first of each. `AlertAudience::addresses`,
  `OwnerPhones` and the order-alert router use it, so one phone gets one text.
- **Each person gets one Telegram message and one email per alert.**
  `App\Domains\Notifications\Support\AlertOnce` is a ledger for one request,
  queued job or command run (a scoped binding; the queue worker resets it
  between jobs). The alert is its type, reference and words; the Telegram
  copier claims the staff member (or the chat), the email copier the address,
  before sending. A Resend from Admin is a new request and goes again.
- **A timed-out Telegram send is not repeated.** `TelegramClient` marks a
  transfer that went out but got no answer in time (cURL 28 "Operation timed
  out", 52, 56; not a connection that never opened) as `mayHaveArrived`. The
  person whose channels leave SMS out then gets the SMS as the safety net, and
  no second Telegram. A clear refusal (an error from Telegram) still lets the
  copy beside the SMS try again. `telegram:check` shows `?` for a timed-out
  copy and "already sent for this alert" for a skipped one, and now lists the
  opening-float alert too.

The opening-float alert's own words changed with it: the owner's text says
"Ariya opened shift #25 on Front till with MVR 818.00. The last close on that
till left MVR 150.00, so the drawer is MVR 668.00 over." instead of the
cashier's "you opened with". The till's warning to the cashier is unchanged.
Tests: `backend/tests/Feature/Telegram/OneAlertOneMessageTest.php`.

## One event, one message (2026-10-10)

The owner asked "Is there any duplicate notification now?" and then "Fix".
An audit ran each flow and counted what reached each person; seven events
sent more than one message. `backend/tests/Feature/Notifications/OneMessagePerEventTest.php`
replays each one.

| Event | Before | Now |
|---|---|---|
| Online card payment (also zero-balance and Stripe) | The order confirmation email three times: the confirm step, "payment confirmed" and "order paid" each call `PaymentConfirmationNotifier`; the text had a once-per-order key, the email did not | The email is claimed on the receipt row (`receipts.confirmation_email_sent_at`), once per order; a failed send gives the claim back |
| Delivery marked delivered | "Has been delivered" and "Order complete, receipt" together | One text: the delivered wording carries the receipt link (`{{receipt_url}}`, added at the end when the owner's wording leaves it out). The completion receipt goes for pickup orders, for a delivery whose delivered message is off, or one completed without the Delivered step |
| A cashier starts a refund | "A refund has been requested" and the code text together | The code text alone (it already names the order). "Refund requested" is retired: no row, no template |
| The owner refunds in one step | "Requested, we will message you again" and "processed" together | "Processed" (or "on its way") alone |
| Catering quote paid online | A till receipt text and email beside "Event confirmed" | The event confirmation alone, when the money equals what the quote asked; a balance paid later gets its receipt |
| Takeaway rung up and paid | Staff on shift: "New order" then "Order confirmed" seconds apart | Someone already told an order is new is not told it is confirmed (`SendStaffNotificationJob`, logged as `skipped`, shown in Log → Staff order alerts). With "New order" off, "Order confirmed" is the one alert |
| A delivery runs late | "Past ETA" again every hour until it arrived | Once per order (`orders.delay_alerted_at`), naming it; later ones list only the newly late orders and the total |

Migration `2026_10_10_190000_one_message_per_event` adds the two columns,
switches the default delivered wording to the receipt link (only when it was
not changed) and removes the unused "refund requested" template.

## The rule

A staff or owner alert reaches a person by a channel (SMS, Email, Telegram)
when all three hold:

1. **The alert has that channel on**: the SMS / Email / Telegram switches on
   its row in Notifications → Messages.
2. **The person's channels include it**: their own choice if Admin set one,
   otherwise their role's (By role).
3. **The person can be reached that way**: a phone for SMS, a saved email for
   Email, a linked Telegram for Telegram.

Safety net: when none of a person's channels can reach them and they have a
phone, the SMS goes ("Email and Telegram did not reach them, so the SMS was
sent." in the SMS log). A person with no phone, no usable email and no
Telegram gets nothing; the panel shows them in red, and the SMS log row is
`failed` ("Could not reach …").

Defaults: every role has all three channels, which is what every alert did
before this setting existed. The old single "Telegram instead of SMS" switch
(Admin → Telegram) is gone; where it was on, the deploy migration set every
role to Email + Telegram.

## What it does not change

- **Customers.** Their texts and emails follow the per-type switches only.
- **Shared rules.** Who may send what, quiet hours (when alerts are held),
  promotion opt-outs and caps still apply to every channel.
- **SMS-only switches.** The SMS master switch, an alert's SMS switch and the
  SMS spend ceiling stop only the SMS; email and Telegram still go.
- **Email at all.** There is no master email switch any more (the three
  "email copies" switches went in the re-audit); a row's Email switch is the
  only one, and Rules → Emails keeps the hourly cap.
- **Telegram at all.** Rules → Telegram alerts (it was on the Telegram page);
  off, no alert goes to Telegram and Messages says the Telegram switches send
  nothing.
- **The business phone.** It is the shop's number, not a person: its alert
  texts go as chosen, and linked owners get them on Telegram by their own
  channels.

## People without a phone

An alert's audience (`AlertAudience::addresses`, which `OwnerPhones::for`
delegates to) includes active staff without a phone as `user:{id}`.
`SmsService` sends them no SMS but their email and Telegram, and logs one row
per person (`to` = `user:{id}`, status `suppressed` "Sent by email instead of
SMS." or "Sent on Telegram instead of SMS."; `failed` "Could not reach …"
when nothing can). A discount or refund approval that reached the approver
this way counts as sent (`SmsLog::reachedRecipient()`). A typed email address
in an audience is `email:{address}`: no text exists for it, the email goes
through `SmsEmailCopier::sendTo()`, and the row is `suppressed` "Sent by
email" (or `failed` when the row's Email switch is off).

## Where things live

| What | Where |
|---|---|
| Channels per role / person | `App\Domains\Notifications\Support\NotificationChannels`; setting `notify_channels_roles`; `users.notify_channels` (null = role) |
| Who gets an alert | `App\Domains\Notifications\Support\AlertAudience` (`DEFAULT_GROUPS`, `for`, `save`, `addresses`, `describe`, `groupOptions`), `AudienceResolver`; setting `sms_type_recipients.{type}` |
| A row's channels | `SmsTypeRegistry::channels($entry)`; the Telegram-only rows name theirs in `def()`; `TELEGRAM_SETTING_ALIASES` keeps their old setting keys |
| Per-type Email switch | `SmsTypeRegistry::isEmailEnabled()` (`sms_type_email.{type}`); gates the copy and the message's own email (`HAS_OWN_EMAIL`) |
| Per-type Telegram switch | `SmsTypeRegistry::isTelegramEnabled()` (`sms_type_telegram.{type}`) |
| Routing | `SmsService::staffFor()` / `sendByOtherChannels()`; `SmsEmailCopier::copy(staff:)`; `TelegramAlertCopier::sendNow()` / `copy()` |
| Admin API | `GET /api/admin/sms/channels`, `PUT /api/admin/sms/channels/roles`, `PUT /api/admin/sms/channels/people/{user}` (`sms.settings.manage`) |
| Admin page | `apps/admin-dashboard/src/pages/NotificationsHub.tsx`, tabs in `pages/Notifications/` (`MessagesTab`, `MessageRow` with its `AudienceEditor` and `TimingEditor`, `PeopleTab` with `PersonAlertsModal`, `RulesTab`, `LogTab`); the By role panel is `components/NotifyChannelsPanel.tsx`; phone layout through `useIsMobile()` (folding groups, a Group select, a "Where every alert goes" overview) |
| Whether an alert is on | `App\Domains\Notifications\Support\AlertSwitch` (`isOn`: any channel; `channels($type)`) |
| Shift reminders | `php artisan staff:shift-reminders` (`app/Console/Commands/SendShiftReminders.php`), scheduled every five minutes |
| Check | `php artisan telegram:check` lists channels per role and every own choice |
| Tests | `backend/tests/Feature/Telegram/NotificationChannelsTest.php`, `backend/tests/Feature/Notifications/AlertAudienceTest.php`, `OneSwitchPerAlertMigrationTest.php`, `backend/tests/Feature/Sms/SmsDeliveryRulesTest.php`, `SmsEmailCopyTest.php`, `backend/tests/Feature/SmsModule/ShiftReminderTest.php`; admin `src/__tests__/NotificationsMessages.test.tsx`, `NotificationsTabs.test.tsx`, `NotifyChannelsPanel.test.tsx` |
