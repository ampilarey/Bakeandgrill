# Current UAT Status — Bake & Grill
**Environment:** https://test.bakeandgrill.mv  
**Last updated:** May 2026  
**Verdict:** ✅ **CODE COMPLETE — READY FOR UAT SIGN-OFF**

All known code gaps from the audit/UAT backlog are fixed. Remaining work is **operational**: deploy test, clean stale DB, run one manual smoke session, then production go-live per `MAIN_PRODUCTION_LAUNCH_TODO.md`.

---

## UAT Verdict

The test server is ready for full end-to-end User Acceptance Testing.  
Core payment, ordering, admin, and KDS flows are verified and working.  
Minor caveats: some secondary flows (delivery, promo+gift card+loyalty in one checkout, order-completion SMS) have not yet been exercised in a live session.

---

## Recently Fixed (May 2026)

| Area | Fix |
|---|---|
| Admin reports | Payment breakdown uses completed orders only |
| Admin dashboard | Clearer KPI labels, stale shift warning, POS maintenance tools |
| Checkout | Referral discount shown on Pay button before order creation |
| E2E tests | Condition-based waits replace flaky fixed delays |
| Delivery checkout | Authenticated E2E verifies address form + delivery fee in summary |
| Promo + gift card checkout | E2E verifies discount preview in order summary (no payment) |
| Loyalty checkout | E2E verifies points discount preview |
| Mark-ready → SSE pipeline | PHPUnit verifies `OrderStatusChanged` dispatch |
| POS Ops refunds tab | Status filter + refund history in Operations → Refunds |
| POS multi-line purchase | Operations → Inventory → Receive stock supports multiple lines per receipt |
| Mobile nav | 4-item bottom bar + More sheet (public site + order app) |
| Payments | `PaymentService` always prefers `total_laar` over float `total` |

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
| Delivery order checkout (address form, delivery fee) | MEDIUM | E2E coverage added in `delivery-order.spec.ts`; live BML payment not tested |
| Promo code applied in real checkout | MEDIUM | E2E preview in `checkout-promo-gift.spec.ts`; live BML payment not tested |
| Gift card redemption in checkout | MEDIUM | E2E preview in `checkout-promo-gift.spec.ts`; live BML payment not tested |
| Loyalty point redemption in checkout | MEDIUM | E2E preview in `checkout-loyalty.spec.ts`; live BML payment not tested |
| Kitchen marks order Ready → customer SSE push | MEDIUM | Backend test verifies `OrderStatusChanged` on mark-ready; live SSE not traced |
| `sms:dispatch-scheduled` job execution trace | LOW | Worker running; not traced |
| `orders:cancel-stale` execution | LOW | Scheduler confirmed; not traced |
| POS web app order flow | LOW | App built; minimal UAT focus |
| Delivery driver app | LOW | App built; driver assignment UAT pending |

---

## Known Non-Blocking Issues

| Issue | Impact | Notes |
|---|---|---|
| Stale test orders / open shifts on test DB | Cosmetic — inflated KPIs, cluttered KDS | **Owner:** Admin → Dashboard → **POS maintenance** (bulk void unpaid stale tickets) + Shifts → force-close stale shifts. See `UAT_DATA_CLEANUP_GUIDE.md` for SSH/tinker fallback. |

---

## Historical Docs (Do Not Use as Current Reference)

| File | Status |
|---|---|
| `PROGRESS.md` | Archived — Jan 2026 scaffold log only |
| `docs/BUG_AUDIT_REPORT.md` | Archived — Feb 2026 audit, many items since fixed |

---

## Known Blocking Issues

**None.** No blocking issues prevent UAT from proceeding.

---

## UAT Test Credentials

Store test credentials in `e2e/.env.test` and your team's password manager — not in this file.
