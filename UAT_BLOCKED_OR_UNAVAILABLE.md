# UAT Blocked / Unavailable Tests — Bake & Grill
**Date:** 23 April 2026  

---

## Blocked Tests — Require Manual or Specific Setup

| ID | Area | Test | Reason Blocked | How to Unblock |
|----|------|------|----------------|----------------|
| B001–B014 | Customer Auth | OTP login, rate limiting | Customer already logged in; OTP requires real SMS delivery to verify | Fresh device/session + access to +9607972434 handset |
| D007 | Checkout | Valid promo code discount | No active test promo code in UAT database | Create a test promo in Admin → Promotions with a known code |
| D016 | Checkout | Loyalty points applied in total | Loyalty checkbox was in `readonly` state — full toggle not testable | Investigate readonly state; possibly pre-applied or requires min order amount |
| E004–E009 | BML | Declined / expired card tests | Only one test card available (approve-only) | Request declined-card test credentials from BML UAT portal |
| E011–E016 | BML | Back button, session timeout, network error | Requires browser network manipulation or timed testing | Manual test using browser DevTools network throttling |
| F002 | Order Status | SMS receipt delivery | Cannot verify SMS received without handset access | Tester must have access to +9607972434 handset to confirm SMS |
| G001–G008 | Pre-Order | Full pre-order flow | No pre-order events set up in UAT | Create a test event in Admin → Pre-Orders |
| I002–I008 | Menu Admin | Create/edit/delete category & item | Avoided to protect UAT data integrity | Safe to test on a staging branch or with cleanup script |
| L002–L005 | Staff Admin | Create/edit staff, PIN change | Avoided to prevent auth disruption | Safe to test with a throwaway staff account |

---

## Tests Requiring Real Phone / SMS

- **B002**: OTP request — sends real SMS to +9607972434
- **B003**: OTP verification — requires entering code from SMS
- **F002**: SMS receipt after payment — requires checking phone

---

## Tests Requiring Specific Environment State

| Test | Requirement |
|------|------------|
| D007 — Valid promo code | Admin must create a test promo code (e.g. "UAT10OFF") |
| D009 — Loyalty points applied | Order total must be high enough to apply points; checkbox state needs investigation |
| E004 — Declined card | BML must provide a "decline" test card number |
| T002 — P&L division by zero | Must have a date range with zero revenue (not easily reproducible in active UAT) |
| Bug #1 — ProfitLossPage crash | Must visit P&L during a zero-revenue period |

---

## Skipped Due to Time / Scope

| Area | Tests Skipped |
|------|--------------|
| A004–A010 | Public pages: contact, hours, menu blade, about |
| A012–A014 | SEO meta tags, social links, footer links |
| C015 | Category filter (only 1 category in UAT) |
| G001–G008 | Full pre-order flow |
| H005 | Review rejection in admin |
| Various CRUD operations | Menu items, inventory, purchase orders, expenses, suppliers |
| Delivery actual pickup | Driver assignment, delivery tracking |
| Table management | Tables, merge, split |
| Shift/cash drawer | Opening/closing shifts |
| Time clock | Clock-in/clock-out |
| SMS campaigns | Sending test SMS campaigns |
| Webhooks | Webhook creation, secret key masking |
