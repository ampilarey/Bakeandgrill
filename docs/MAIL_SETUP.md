# Mail setup

**Date:** 2026-10-06 · **Asked:** "mail setup"

## What uses e-mail

| What | Who gets it |
|---|---|
| Sign-in or password reset code: every texted code also goes, the same code, to the email saved on the account (order app and website login), and the screen says "Code sent to +960 … and a•••@g•••.com". **Email me the code instead** remains for when that copy could not be sent | Customer |
| Order and payment confirmation | Customer, when they gave an e-mail |
| Gift card delivery | Gift card recipient |
| Catering: request received, quote, confirmation, reminders | Customer |
| Catering: new request, quote sent, deposit paid | Staff address in catering settings |

SMS is separate and unaffected.

## Why it can fail silently

The framework's default mailer is `log`: every e-mail is written to a file on the
server and nothing is sent, with no error anywhere. A customer waiting for a sign-in
code by e-mail never gets it. Production must set `MAIL_MAILER=smtp`.

When the mail server refuses or times out, the sign-in screen says so ("We could not
send the email just now. Please use the code we texted you.") and the texted code keeps
working; the failure is logged as `OTP email could not be sent`.

## Setting it up on cPanel

1. In cPanel, go to **Email Accounts** and create a mailbox, for example
   `no-reply@bakeandgrill.mv`, with a strong password.
2. On the server, edit `/home/bakeandgrill/public_html/backend/.env` and set:

   ```
   MAIL_MAILER=smtp
   MAIL_HOST=sg-s2.serverpanel.com
   MAIL_PORT=465
   MAIL_SCHEME=smtps
   MAIL_USERNAME=no-reply@bakeandgrill.mv
   MAIL_PASSWORD=the-mailbox-password
   MAIL_FROM_ADDRESS=no-reply@bakeandgrill.mv
   MAIL_FROM_NAME="Bake & Grill"
   MAIL_TIMEOUT=10
   ```

   **Not `mail.bakeandgrill.mv`.** The domain's DNS is on Cloudflare and that name is
   proxied (orange cloud), and Cloudflare carries web traffic only, so the mail port
   times out (found 2026-10-06). The mail server is the one in the domain's MX record,
   `sg-s2.serverpanel.com` (103.159.65.2), the same machine the site runs on, and its
   certificate matches that name. For port 587 use `MAIL_SCHEME=smtp`.
3. Load the settings and send a test:

   ```bash
   cd /home/bakeandgrill/public_html/backend && php artisan config:cache && php artisan mail:test you@example.com
   ```

   It prints the mailer, server and From address (never the password), sends one
   e-mail, and on failure shows the mail server's own error, for example
   `535 Incorrect authentication data` for a wrong password.

4. If the test arrives in spam, add SPF and DKIM for the domain in cPanel under
   **Email Deliverability**; it offers a one-click repair for both.

TEST (`test.bakeandgrill.mv`) has its own `.env` and needs the same lines if TEST
should send e-mail; it can use the same mailbox.

## Every text also by email (2026-10-06)

Owner: "All. And not customers only. Admin and all staffs too receive email in all
the scenarios." Every SMS the system sends, to a customer, a staff member or an owner,
also goes by email to that person's saved address:

| Who | Address used |
|---|---|
| Customer texts (orders, payments, refunds, bookings, credit, complaints, events, wholesale shops) | The customer account's email |
| Staff and owner alerts | The staff account's email (matched by the phone number the alert went to) |
| Promotions (campaigns, birthday, abandoned cart, tier) | The customer account's email, with a **Stop promotional messages** link and a one-click unsubscribe header |

- The copy follows the SMS rules: a switched-off type, an opted-out customer, the
  marketing cap and quiet hours stop the email too, because the copy is made only once
  the text has passed them (`SmsService` → `SmsEmailCopier`).
- Texts that already have their own email are not copied: sign-in codes, order
  confirmed, online payment confirmed, gift card delivery, event request, quote and
  confirmation.
- Links in the text become buttons ("Pay now", "View invoice", "Track your order",
  "Open the POS"...). One email per text, however often the SMS is retried.
- Sent just after the page or job finishes, so a slow mail server never holds anything up.
- **Cost:** nothing per email; the hosting's mail server sends them. Shared hosting
  limits how many an hour, so there is a cap (default 300 an hour, all together);
  promotions may use at most half, so order and staff emails always have room.
- **Switches:** Admin → SMS → Control Center → Delivery rules → Email copies: customers,
  staff and owner alerts, promotions, and the hourly cap.
- Unsubscribing from the email link sets the same opt-out as the SMS page, so
  promotional texts and emails both stop; order, payment and sign-in messages continue.

| Piece | File |
|---|---|
| Copy rules, recipient lookup, cap | `app/Domains/Notifications/Services/SmsEmailCopier.php` |
| The email | `app/Mail/SmsCopyMail.php`, `emails/sms_copy(.blade|_text.blade).php` |
| Settings | `SmsDeliveryRules` (`sms_email_copy_*`), Control Center panel |
| Unsubscribe | `EmailUnsubscribeController`, `/email/unsubscribe/{customer}` (signed) |
| Tests | `tests/Feature/Sms/SmsEmailCopyTest.php` |

## How the emails look (2026-10-06)

Owner: "Enhance the email send with branding and other features". Every customer
email (sign-in code, order confirmation, receipt, gift card, event request, quote,
event confirmed) uses one layout, `resources/views/emails/layout.blade.php`:

- the rust band with the logo in a cream circle; the logo is **embedded** in the
  message (a 200px copy, a few KB, made once in `storage/app/email/`), so it shows
  even where the mail app blocks pictures;
- an inbox preview line written for each email;
- a contact strip (WhatsApp, call, order online) and footer (address, website) taken
  from Site settings (`business_whatsapp`, `business_phone`, `business_address`,
  `logo`, `primary_color`), so a change there reaches every email;
- colours kept as designed in dark mode, and a layout that works at phone width.

The sign-in code email also: puts the code first in the subject
("718894 is your Bake & Grill code"), so it can be read from the notification;
says whether it is for signing in or a password reset; names the account as
+960 782 ••88; shows when it was asked for and when it stops working (Malé time);
explains that staff never ask for the code and what to do if you did not ask; says
the same code went by SMS when it is the automatic copy; and has a plain-text part.

| Piece | File |
|---|---|
| Layout, button, rows | `resources/views/emails/layout.blade.php`, `emails/partials/` |
| Brand values, logo copy, masked phone | `app/Support/EmailBrand.php` |
| Code email | `app/Mail/CustomerOtpMail.php`, `emails/customer_otp(.blade|_text.blade).php` |
| Tests | `tests/Feature/Mail/BrandedEmailsTest.php` |

## Safeguards in the app

- `php artisan app:verify-production-config`, run by every deploy, now warns (does not
  block) when mail is not sending, or the host, password or From address is missing.
- The mail server connection times out after `MAIL_TIMEOUT` seconds (default 10).
  Order and payment confirmations are mailed during the request, so a mail server
  that never answers can no longer hold a checkout open.

| Piece | File |
|---|---|
| Settings check | `backend/app/Support/MailStatus.php` |
| Test command | `backend/app/Console/Commands/MailTest.php` |
| Deploy warning | `backend/app/Console/Commands/VerifyProductionConfig.php` |
| Timeout | `backend/config/mail.php` |
| Tests | `backend/tests/Feature/Console/MailSetupTest.php` |
