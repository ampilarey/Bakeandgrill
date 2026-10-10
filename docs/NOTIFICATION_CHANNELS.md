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
| Messages | Every message, one row each: its SMS, Email and Telegram switches, who gets it, when it goes ("When it sends" numbers under Edit), who may send it by hand, its wording and "Send me a test". The three Telegram-only alerts (day report, order cancelled at the till, cash taken out) are rows under "Telegram only". | SMS → Control Center, SMS → Automations, Settings → Notifications, Telegram → Alerts |
| People | Who gets order alerts, how each person gets their alerts, extra numbers that are not staff | SMS → Recipients, Control Center → Who gets alerts |
| Rules | Stop all SMS (owner), Telegram alerts on or off, the spending limit, quiet hours, limits, email copies, how long the log is kept | Control Center → Rules & limits, Telegram → Alerts |
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

Not folded (yet): the wholesale numbers on Settings → Credit accounts
("Nudge a shop to report sales after", "Text owners about unreconciled stock
after") still take 0 for off.

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
- **Email to staff at all.** Rules → Email copies → Staff and owner alerts is
  still the master switch for staff email; the panel warns when it is off.
- **Telegram at all.** Rules → Telegram alerts (it was on the Telegram page);
  off, no alert goes to Telegram and Messages says the Telegram switches send
  nothing.
- **The business phone.** It is the shop's number, not a person: its alert
  texts go as chosen, and linked owners get them on Telegram by their own
  channels.

## People without a phone

Recipients for owner alerts (`OwnerPhones::for`) include active staff without
a phone as `user:{id}`. `SmsService` sends them no SMS but their email and
Telegram, and logs one row per person (`to` = `user:{id}`, status
`suppressed` "Sent by email instead of SMS." or "Sent on Telegram instead of
SMS."). A discount or refund approval that reached the approver this way
counts as sent (`SmsLog::reachedRecipient()`).

## Where things live

| What | Where |
|---|---|
| Channels per role / person | `App\Domains\Notifications\Support\NotificationChannels`; setting `notify_channels_roles`; `users.notify_channels` (null = role) |
| Per-type Telegram switch | `SmsTypeRegistry::isTelegramEnabled()` (`sms_type_telegram.{type}`) |
| Routing | `SmsService::staffFor()` / `sendByOtherChannels()`; `SmsEmailCopier::copy(staff:)`; `TelegramAlertCopier::sendNow()` / `copy()` |
| Admin API | `GET /api/admin/sms/channels`, `PUT /api/admin/sms/channels/roles`, `PUT /api/admin/sms/channels/people/{user}` (`sms.settings.manage`) |
| Admin page | `apps/admin-dashboard/src/pages/NotificationsHub.tsx`, tabs in `pages/Notifications/` (`MessagesTab`, `MessageRow`, `PeopleTab`, `RulesTab`, `LogTab`); the channels panel is `components/NotifyChannelsPanel.tsx` |
| Whether an alert is on | `App\Domains\Notifications\Support\AlertSwitch` |
| Shift reminders | `php artisan staff:shift-reminders` (`app/Console/Commands/SendShiftReminders.php`), scheduled every five minutes |
| Check | `php artisan telegram:check` lists channels per role and every own choice |
| Tests | `backend/tests/Feature/Telegram/NotificationChannelsTest.php`, `backend/tests/Feature/Notifications/OneSwitchPerAlertMigrationTest.php`, `backend/tests/Feature/SmsModule/ShiftReminderTest.php`; admin `src/__tests__/NotificationsMessages.test.tsx`, `NotificationsTabs.test.tsx` |
