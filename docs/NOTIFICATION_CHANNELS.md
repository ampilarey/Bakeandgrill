# Who gets alerts, and how

Owner, 2026-10-07: "an acc may not have mobile number but email so he should
receive email" … "admin is the one who controls everything, for example admin
decides in which channel notifications goes to a specific role or person".

Admin → SMS → Control Center → **Who gets alerts, and how**.

## The rule

A staff or owner alert reaches a person by a channel (SMS, Email, Telegram)
when all three hold:

1. **The alert has that channel on**: the SMS / Email / Telegram switches on
   its row in the Control Center.
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
- **Email to staff at all.** Delivery rules → Email copies → Staff is still
  the master switch for staff email; the panel warns when it is off.
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
| Admin panel | `apps/admin-dashboard/src/components/NotifyChannelsPanel.tsx` |
| Check | `php artisan telegram:check` lists channels per role and every own choice |
| Tests | `backend/tests/Feature/Telegram/NotificationChannelsTest.php` |
