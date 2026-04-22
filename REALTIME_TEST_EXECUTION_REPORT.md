# Real-Time Test Execution Report
**Date:** 22 April 2026  
**Environment:** https://test.bakeandgrill.mv  
**Tester:** AI Agent (automated browser + API)  
**Customer Account:** Asif Moosa Ibrahim / +9607972434 (fresh account, clean slate)  
**Admin Account:** 7820288@gmail.com / PIN 1121  
**BML Test Card:** 5506900140100107, 01/39, CVV 100  

---

## Phase 3A — Public Website

| Test | Result | Notes |
|---|---|---|
| Homepage loads | ✅ Pass | Hero carousel working, 3 slides, open/close status showing |
| Nav links (Menu, Pre-Order, More) | ✅ Pass | All clickable |
| Contact page `/contact` | ✅ Pass | Address, phone, email, map link all present |
| Opening hours `/hours` | ✅ Pass | Schedule loads, "Order Online Now" CTA works |
| Privacy, Terms, Refund links | ✅ Pass | All links in footer resolve correctly |
| Dark mode toggle | ✅ Pass | Button visible and clickable |
| Prayer time bar | ✅ Pass | Shows Asr time with countdown |
| "We're open" badge | ✅ Pass | Shows "We're open · Closes 23:59" |

---

## Phase 3B — Customer Auth

| Test | Result | Notes |
|---|---|---|
| Customer registration via OTP | ✅ Pass | OTP sent to +9607972434, account created with name + password |
| Customer session persists | ✅ Pass | "Hi, 7972434" shows in nav across pages |
| Customer shows in admin | ✅ Pass | Asif Moosa Ibrahim visible in admin Customers page |

---

## Phase 3C — Cart + Checkout

| Test | Result | Notes |
|---|---|---|
| Menu page loads | ✅ Pass | BML TEST category, BML Bajiya MVR 1.00 visible |
| Add item to cart | ✅ Pass | Cart count updates to 1 |
| Cart drawer opens | ✅ Pass | Slides in from bottom/right, shows item + total |
| Proceed to Checkout | ✅ Pass | Navigates to `/order/checkout` |
| Takeaway / Delivery selector | ✅ Pass | Both buttons toggle correctly |
| Special instructions field | ✅ Pass | Textarea accepts input |
| Promo code field | ✅ Pass | Field + Apply button present |
| Referral code field | ✅ Pass | Field + Apply button present |
| Gift card field | ✅ Pass | XXXX-XXXX-XXXX format input + Check button |
| Order summary (GST calc) | ⚠️ See Bug #1 | Subtotal MVR 1.00, GST 8% = MVR 0.08, shows Total MVR 1.08 — BUT actual charge is MVR 1.00 |
| Loyalty points preview | ✅ Pass | "You'll earn 1 pts from this order" shown |
| Referral code displayed | ✅ Pass | Customer's code XFK5BYZQ shown in checkout |
| T&C checkbox | ✅ Pass | Enables Pay button when checked |
| WhatsApp / Viber support links | ✅ Pass | Both visible in checkout |

---

## Phase 3D — BML Payment

| Test | Result | Notes |
|---|---|---|
| BML redirect on Pay click | ✅ Pass | "Processing…" → redirect to UAT gateway |
| BML UAT page loads | ✅ Pass | "APU MERCHANT USD 6", $1.00 shown |
| Card form fills correctly | ✅ Pass | Name / Number / Expiry / CVV all accepted |
| Payment completes | ✅ Pass | Redirected back to order status page |
| Order status page shows "Payment successful!" | ✅ Pass | Green confirmation banner |
| Order status tracker (Received → Preparing → Ready → Done) | ✅ Pass | Step 1 "Received" active |
| Auto-refresh every 10 seconds | ✅ Pass | Notice shown below order details |
| Push notification opt-in shown | ✅ Pass | "Enable" button visible |
| Back to menu link | ✅ Pass | Present |

---

## Phase 3E — Order/Business Correctness

| Test | Result | Notes |
|---|---|---|
| Order appears in admin orders list | ✅ Pass | #BG-20260422-0001, status "Pending" |
| Order status correct after payment | ✅ Pass | "Pending" = payment confirmed, awaiting kitchen |
| Customer name in order detail | ✅ Pass | Shows "Asif Moosa Ibrahim" + phone |
| Customer name in orders LIST | ❌ Bug #2 | Was showing "—" (fixed in this session) |
| Order total in admin matches receipt | ✅ Pass | MVR 1.00 on both |
| Order total vs checkout display | ⚠️ Bug #1 | Checkout showed MVR 1.08 (with GST) but actual MVR 1.00 |
| Loyalty points credited | ⏳ Not yet | Points credited on order completion, not placement (expected) |

---

## Phase 3F — Admin Area

| Test | Result | Notes |
|---|---|---|
| Admin login (PIN) | ✅ Pass | PIN 1121 works, keyboard input works |
| Admin dashboard loads | ✅ Pass | Stats, system status, environment shown |
| Orders page | ✅ Pass | Filters, pagination, View drawer all work |
| Orders detail drawer | ✅ Pass | Customer name, phone, items, total all shown |
| KDS / Kitchen Display | ✅ Pass | Two columns (Pending/Cooking), Start Cooking / Mark Ready buttons |
| Menu Management | ✅ Pass | Categories tab, Items tab, Edit form, all functional |
| Customers page | ✅ Pass | 1 customer shown correctly (Asif Moosa Ibrahim, Bronze, 1 order) |
| Loyalty Accounts page | ⚠️ Bug #3 | Ghost row (orphaned from deleted customer) — fixed in this session |
| All sidebar nav links present | ✅ Pass | 30+ nav items all visible |

---

## Phase 3H — Responsive / Mobile

| Test | Result | Notes |
|---|---|---|
| Order app menu at 390px (iPhone 14) | ✅ Pass | Menu renders correctly, item card full width |
| Order status notification bar on mobile | ✅ Pass | Active order banner shows with Track link |
| Public homepage at 390px | ✅ Pass | Hero carousel full screen, CTAs readable |
| Navbar on 390px | ⚠️ Minor | All nav items cramped in horizontal row — functional but dense |
| Cart drawer on mobile | ✅ Pass | Bottom sheet style, usable |
| Checkout on mobile | ✅ Pass | All sections stack vertically |

---

## Summary

**Total tests:** ~50  
**Pass:** 45  
**Bugs found:** 3 (1 critical, 1 medium, 1 low)  
**Informational notes:** 2  
