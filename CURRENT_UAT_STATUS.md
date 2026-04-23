# Current UAT Status — Bake & Grill
**Environment:** https://test.bakeandgrill.mv  
**Last updated:** April 2026  
**Verdict:** ✅ **UAT READY WITH MINOR CAVEATS**

---

## UAT Verdict

The test server is ready for full end-to-end User Acceptance Testing.  
Core payment, ordering, admin, and KDS flows are verified and working.  
Minor caveats: some secondary flows (delivery, promo+gift card+loyalty in one checkout, order-completion SMS) have not yet been exercised in a live session.

---

## What Has Been Verified (Live Tests — 22 April 2026)

### Public Website
| Flow | Status |
|---|---|
| Homepage loads (hero carousel, open/closed badge, prayer times) | ✅ Verified |
| Contact, Hours, Privacy, Terms, Refund pages | ✅ Verified |
| Dark mode toggle | ✅ Verified |
| Mobile responsive at 390px | ✅ Verified |

### Customer Ordering App
| Flow | Status |
|---|---|
| Customer registration via OTP | ✅ Verified |
| Customer login via OTP | ✅ Verified |
| Browse menu, add to cart, cart drawer | ✅ Verified |
| Checkout — takeaway order with BML UAT card | ✅ Verified |
| GST 8% calculation accurate (frontend and backend match) | ✅ Verified |
| BML payment redirect, card entry, confirmation | ✅ Verified |
| Order status page with progress tracker | ✅ Verified |
| Order history and Account page | ✅ Verified |
| Promo code, gift card, loyalty fields present in checkout | ✅ Verified (UI only) |

### Admin Panel
| Flow | Status |
|---|---|
| Admin PIN login | ✅ Verified |
| Dashboard — stats, system status | ✅ Verified |
| Orders page — list, filters, detail drawer | ✅ Verified |
| Customer name in order list and detail | ✅ Verified (bug fixed) |
| KDS — pending/cooking columns, Start/Ready buttons | ✅ Verified |
| Menu management — categories, items, edit | ✅ Verified |
| Customers page — correct data, no orphaned rows | ✅ Verified (bug fixed) |
| Sidebar navigation — all 30+ links present | ✅ Verified |

### Payment Correctness
| Check | Status |
|---|---|
| `TAX_RATE_BP=800` active on test server | ✅ Confirmed |
| `TAX_INCLUSIVE=false` | ✅ Confirmed |
| GST floor logic (prevents 0-charge when discounts exceed subtotal) | ✅ Fixed & deployed |
| BML charged amount = backend order total | ✅ Verified (multiple orders) |
| Frontend GST display = backend GST stored | ✅ Verified |

### SMS Notifications
| Check | Status |
|---|---|
| Staff SMS on new paid order | ✅ Verified |
| Customer payment confirmation SMS | ✅ Code in place |
| OTP SMS delivery | ✅ Verified (Dhiraagu live) |

### Scheduler & Queue
| Check | Status |
|---|---|
| Queue worker running | ✅ Confirmed (started 21 Apr) |
| Crontab with `schedule:run` | ✅ Confirmed |
| Sentry error monitoring | ✅ Configured on test server |

---

## Under Observation (Not Yet Live-Tested)

These flows are implemented and code is verified, but have not yet been exercised in a UAT live session:

| Flow | Priority | Notes |
|---|---|---|
| Delivery order checkout (address form, delivery fee) | MEDIUM | UI confirmed, end-to-end not tested |
| Promo code applied in real checkout | MEDIUM | API tested; live checkout not done |
| Gift card redemption in checkout | MEDIUM | API tested; live checkout not done |
| Loyalty point redemption in checkout | MEDIUM | Needs points balance to test |
| Kitchen marks order Ready → customer SSE push | MEDIUM | SSE implemented; not confirmed live |
| `sms:dispatch-scheduled` job execution trace | LOW | Worker running; not traced |
| `orders:cancel-stale` execution | LOW | Scheduler confirmed; not traced |
| POS web app order flow | LOW | App built; minimal UAT focus |
| Delivery driver app | LOW | App built; driver assignment UAT pending |

---

## Known Non-Blocking Issues

| Issue | Impact | Notes |
|---|---|---|
| ~67 stale test orders in KDS (from March 2026) | Cosmetic — KDS looks cluttered | See UAT_DATA_CLEANUP_GUIDE.md for cleanup steps |
| Referral discount not visible in checkout button label | UX confusion only | Actual charge is correct; label uses pre-server-side value |
| `PROGRESS.md` (root) shows "14% complete" | Stale doc confusion | Historical scaffold log, not current state |
| `docs/BUG_AUDIT_REPORT.md` shows unchecked items | Stale doc confusion | Feb 2026 — superseded by later audits |
| Mobile nav cramped at 390px (public site) | Minor UX | Functional but dense |
| 3 flaky Playwright tests (pass on retry) | Minor CI noise | Timing issues, not real failures |
| `PaymentService.php:43` uses float multiply instead of `total_laar` | Precision risk (theoretical) | Safe for 2-decimal MVR; deferred fix |

---

## Known Blocking Issues

**None.** No blocking issues prevent UAT from proceeding.

---

## UAT Test Credentials (as of last session)

| Role | Credential |
|---|---|
| Admin PIN | 1121 |
| BML UAT test card | 5506900140100107, Expiry 01/39, CVV 100 |
| BML UAT gateway | https://api.uat.merchants.bankofmaldives.com.mv |
| SMS (Dhiraagu) | Live — use real phone numbers |

> ⚠️ Never share actual credentials in documentation committed to the repo. The above reflects what was used in the April 22, 2026 session. Rotate if exposed.
