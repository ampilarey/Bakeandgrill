# What the owner has to do

Things only you can do, in the order to do them. Everything else is built and on `main`.
Last updated 2026-10-18. Tick each one off as you go.

## 1. Deploy the latest code to the live site

TEST updates itself. The live site only changes when you run this on the server:

```bash
cd /home/bakeandgrill/public_html && ./scripts/full-deploy.sh production
```

This deploy adds three columns to `newsletter_subscribers` (for bounces). The script backs up
the database and runs the change itself; there is nothing else to do. Run it outside busy
hours.

Afterwards run `php artisan app:ready` in `/home/bakeandgrill/public_html/backend`. Every line
should say OK; anything that says Fix comes with a one-line fix.

## 2. Start the queue worker on TEST

TEST's health check says its queue is not running, so the newsletter and other background
jobs never send there. In cPanel → **Cron Jobs**, check that this line is there (the full
list of cron lines is in `docs/DEPLOY_COMMAND.md` § Scheduled tasks and the queue worker):

```
* * * * * /bin/flock -n /home/bakeandgrill/test.bakeandgrill.mv/backend/storage/queue-worker.lock -c 'cd /home/bakeandgrill/test.bakeandgrill.mv/backend && exec /opt/alt/php84/usr/bin/php artisan queue:work redis --sleep=3 --tries=3 --max-time=3600' >> /home/bakeandgrill/test.bakeandgrill.mv/backend/storage/logs/queue-worker.log 2>&1
```

Within two minutes, https://test.bakeandgrill.mv/api/health should say `"status":"ok"`.
If it still says `queue`, look at `storage/logs/queue-worker.log` on TEST.

## 3. Have a Dhivehi speaker read the Dhivehi, then turn it on

All the Dhivehi on the website, in the order app, in customer texts and in customer emails is
a draft written by me. Nobody sees it until the switch is on, and it should not go on until
someone who writes Dhivehi well has read it.

1. **Turn it on for TEST first.** On TEST's admin: Website → Everywhere → **Dhivehi on the
   website and in the order app** → on. (It is one switch for both the website and the order
   app.)
2. **Read it on TEST**, on a phone:
   - the website in Dhivehi: https://test.bakeandgrill.mv/dv (menu, hours, contact, a dish
     page, prayer times);
   - the order app in Dhivehi: open https://test.bakeandgrill.mv/order, tap ދވ, and go
     through the menu, cart, checkout, account, gift cards and order tracking;
   - customer texts: Admin → System → Notifications → Messages. Every customer message has a
     **Dhivehi wording** box under its English; the grey text is my draft;
   - customer emails: set a test customer's language to Dhivehi (order app → Account →
     Settings) and place an order, ask for a sign-in code by email, and so on.
3. **Fix what is wrong.**
   - A text message: type the right wording into its Dhivehi box and press Save Dhivehi.
   - Website, order app or email wording: send me the wrong line and the right one (a
     screenshot is fine) and I will change it.
4. **Turn it on for the live site** the same way, on the live admin.

Customers only get Dhivehi texts and emails if their account is set to Dhivehi, and only while
the switch is on.

## 4. Approve the Dhivehi legal pages (privacy, terms, refund)

These three pages have Dhivehi drafts too, but legal text should not go live without being
read properly. Until you approve them, the Dhivehi versions of those pages show the English
text with a note at the top saying the page is in English.

1. Ask a Dhivehi speaker (ideally someone who knows legal wording) to read the drafts. They
   are in `backend/resources/views/legal/dv/` (privacy, terms, refund); I can send them as a
   document if that is easier.
2. Send me any corrections.
3. When they are right: Admin → Website → Legal → **Dhivehi legal pages approved** → on.

If you would rather write your own Dhivehi text, the Legal section's body boxes take a
Dhivehi version, and that wins over both.

## 5. Pipe newsletter bounces into the site (cPanel, 5 minutes)

So that dead email addresses stop getting the newsletter. Full steps:
`docs/MAIL_SETUP.md` § Newsletter bounces. In short, cPanel → **Email → Forwarders → Add
Forwarder**: address `no-reply@bakeandgrill.mv`, destination **Pipe to a Program**:

```
/opt/alt/php84/usr/bin/php -q /home/bakeandgrill/public_html/backend/artisan newsletter:bounce
```

The mailbox keeps its own copy.

## 6. Set up the monthly restore drill (cPanel, 5 minutes)

This checks every month that the backups can actually be restored. Until it is set up, it
reports "skipped".

1. cPanel → **MySQL Databases**: create an empty database `bakeandgrill_drill` and give the
   site's own database user **All privileges** on it.
2. Add `BACKUP_DRILL_DATABASE=bakeandgrill_drill` to the live `backend/.env`, then run
   `php artisan config:cache`.
3. Run `php artisan backup:restore-drill` once to see it work.

Details: `docs/DEPLOY_COMMAND.md`. Never point it at the live database; it refuses to.

## 7. Sign in with Google, Facebook and Apple (when you want them)

Each button only shows once its keys are in `.env`. Google and Facebook are free; Apple needs
a paid Apple Developer account (99 USD a year). Steps for each, and the callback address to
register, are in `docs/SOCIAL_SIGN_IN.md`. The keys are `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET`, and `APPLE_CLIENT_ID`,
`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (or `APPLE_PRIVATE_KEY_PATH`). After adding
them run `php artisan config:cache`.

## 7b. BML webhook secret on TEST and live (5 minutes)

Payment notices from BML that are not signed are now refused. Without the secret, a payment
is still confirmed when the customer returns from the bank page, but not if they close it
first. In the BML merchant portal, copy the webhook secret, add
`BML_WEBHOOK_SECRET=...` to `backend/.env` on TEST and on the live site, then run
`php artisan config:cache`. `php artisan app:ready` says whether it is set.

## 8. Optional

- **Printed cards on the Matica 210** (or any card printer): Promotions → Printed cards. Install the
  printer's driver on the computer you print from, set its card size to CR80 (and edge to edge),
  and print the PDF at Actual size / 100%. Try one card first. Steps: `docs/PRINTED_CARDS.md`.

- **Google and Facebook shopping catalogue**: System → Integrations → Catalogue feeds shows two
  private links. Paste them into Google Merchant Center and Facebook Commerce Manager if you
  want your dishes listed there.
- **Check CI is green after each change**: https://github.com/ampilarey/Bakeandgrill/actions.
  If a run fails on something that passes when run again, choose "Re-run failed jobs".
