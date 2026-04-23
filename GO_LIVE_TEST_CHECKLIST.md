# Go-Live Test Checklist
**Environment:** https://test.bakeandgrill.mv → will be migrated to https://bakeandgrill.mv  
**Last tested:** 22 April 2026

---

## PRE-GO-LIVE: Server Configuration (MUST DO BEFORE GOING LIVE)

> 📌 Items for the **UAT test server** (test.bakeandgrill.mv):
- [x] Set `TAX_RATE_BP=800` in server `.env` — **CONFIRMED DONE** (verified Apr 22, 2026 via live payment test)
- [x] Run `php artisan config:cache` after changing `.env` — **DONE**

> 📋 Items for the **future production server** (bakeandgrill.mv) — see MAIN_PRODUCTION_LAUNCH_TODO.md:
- [ ] Set `APP_ENV=production` in server `.env`  
- [ ] Set `APP_URL=https://bakeandgrill.mv` in server `.env` (when switching domain)  
- [ ] Configure BML real production credentials (not UAT)  
- [ ] Set `BML_ENFORCE_SIGNATURE=true` in server `.env`  
- [ ] Configure real SMTP email (MAIL_MAILER, MAIL_HOST, etc.)  
- [ ] Verify `SANCTUM_STATEFUL_DOMAINS` includes production domain  
- [ ] Verify Redis password is set if Redis is accessible externally  

---

## PAYMENT & ORDER FLOW ✅ (Tested 22 Apr 2026)

- [x] Customer registration via OTP phone number  
- [x] Customer login via OTP  
- [x] Browse menu, add items to cart  
- [x] Cart drawer opens and shows correct items/total  
- [x] Checkout page shows order summary, GST, loyalty preview  
- [x] Takeaway order type selection  
- [x] T&C agreement checkbox enables Pay button  
- [x] BML UAT payment redirect works  
- [x] BML card entry form accepts test card  
- [x] Payment completes and redirects to order status page  
- [x] Order status page shows "Payment successful!" with tracker  
- [x] Order appears in admin orders list as "Pending"  
- [x] Order detail shows correct customer name, phone, items, total  
- [ ] **Delivery order type** — not tested (needs delivery address form)  
- [ ] **Promo code** — not tested (needs active promo in system)  
- [ ] **Loyalty redemption** — not tested (needs points balance)  
- [ ] **Gift card** — not tested (needs issued gift card)  

---

## PUBLIC WEBSITE ✅ (Tested 22 Apr 2026)

- [x] Homepage loads with hero carousel  
- [x] Opening hours shown correctly  
- [x] Contact page loads with correct details  
- [x] Privacy Policy page loads  
- [x] Terms & Conditions page loads  
- [x] Refund Policy page loads  
- [x] All nav links work  
- [x] Dark mode toggle works  
- [x] Prayer time bar shows  
- [x] Mobile responsive (390px)  

---

## CUSTOMER APP ✅ (Tested 22 Apr 2026)

- [x] Menu page loads with categories and items  
- [x] Item photos display  
- [x] Cart count updates correctly  
- [x] Order status tracking page with progress bar  
- [x] Active order notification bar shown in menu  
- [x] My Account link in nav  
- [x] Pre-orders tab loads (no crash)  
- [x] Favourites tab  
- [x] Order history tab  

---

## ADMIN PANEL ✅ (Tested 22 Apr 2026)

- [x] Admin PIN login with keyboard input  
- [x] Dashboard loads with stats  
- [x] Orders page with filters and View drawer  
- [x] Customer name shows correctly in order detail  
- [x] Customer name shows correctly in orders list ← fixed  
- [x] KDS page shows pending/cooking columns  
- [x] Menu Management — categories and items  
- [x] Customers page shows customer data  
- [x] Loyalty page (orphaned rows filtered out) ← fixed  
- [ ] Kitchen completes order → customer gets SMS  
- [ ] Order marked "Ready" → customer sees status update  
- [ ] Admin can process refund  
- [ ] Staff can create POS order  

---

## SMS NOTIFICATIONS (Partially tested)

- [x] Staff notification number configured (7820288)  
- [x] Staff receives SMS when paid online order becomes "Pending"  
- [x] SMS includes customer phone number  
- [x] Payment confirmation SMS sent to customer (code in place, not retested)  
- [ ] New customer registration SMS to staff  
- [ ] Low stock alert SMS  

---

## SCHEDULER & BACKGROUND JOBS

- [x] Queue worker running (started 21 Apr)  
- [x] Crontab with `schedule:run` and queue keepalive set  
- [x] Sentry error monitoring configured and tested  
- [ ] Verify `sms:dispatch-scheduled` runs at expected time  
- [ ] Verify `app:expire-loyalty-holds` runs every 15 min  
- [ ] Verify `orders:cancel-stale` runs hourly  

---

## BEFORE FINAL PRODUCTION SWITCH TO bakeandgrill.mv

- [ ] Resolve Bug #1 (TAX_RATE_BP=800) on production server  
- [ ] Switch BML from UAT to Production credentials  
- [ ] Update all env URLs to bakeandgrill.mv  
- [ ] Test full payment flow on production BML  
- [ ] DNS cutover and SSL cert verification  
- [ ] Test one real order end-to-end after go-live  
- [ ] Monitor Sentry for errors in first 24h  

---

## OVERALL STATUS

| Area | UAT Status | Production Status |
|---|---|---|
| Public website | ✅ Ready | ⏳ Needs domain cutover |
| Customer ordering app | ✅ Ready (delivery flow needs separate test) | ⏳ Needs domain cutover |
| BML UAT payment | ✅ Working | ⏳ Awaiting production credentials from BML |
| Admin panel | ✅ Ready | ⏳ Needs domain cutover |
| GST configuration | ✅ Confirmed (TAX_RATE_BP=800 verified Apr 22) | ⏳ Must set on production server |
| BML Production credentials | N/A — UAT only | ❌ Not configured yet (planned later) |
| Email notifications | ❌ Using log driver (non-blocking for UAT) | ❌ Must configure SMTP before go-live |
| Production domain | N/A — UAT server | ❌ Not provisioned yet |
