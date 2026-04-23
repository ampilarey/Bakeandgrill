# Prioritised Growth Roadmap
## Bake & Grill — From UAT to Growth

> BML is in UAT/testing. Use this window to fix launch blockers and build growth features.
> Each item is tagged: Impact (H/M/L), Effort (H/M/L), Type (Code/Content/Config/Ops)

---

## PHASE A — Before Public Launch

> Goal: be commercially trustworthy and conversion-ready on day one.
> All Phase A items should be complete before going live.

| # | Item | Impact | Effort | Type | Why it matters |
|---|---|---|---|---|---|
| A1 | Remove "Staff Dashboard" from public footers | H | L | ✅ Done | Looks internal/unfinished to customers |
| A2 | Add "Skip for now" to profile setup | H | L | ✅ Done | Blocking first-time orderers from checkout |
| A3 | Fix homepage category links `/menu` → `/order/menu` | H | L | Content | Broken nav from homepage = immediate bounce |
| A4 | Add "100% Halal" to trust strip | H | L | Content | Table stakes for the Maldives market |
| A5 | Set real Google Maps embed on contact page | H | L | Config | Default embed shows wrong location |
| A6 | Set all hero slides in CMS (all 3) | M | L | Content | Fallback alt text "Promotional banner" is weak |
| A7 | Verify proof_stat claim or update to verifiable copy | M | L | Content | Unverified "500+" claim undermines trust |
| A8 | Fix payment failure banner copy | H | L | Code | Current message is cold + gives no WhatsApp fallback |
| A9 | Fix order cancelled copy | M | L | Code | Cold + no resolution path for confused customers |
| A10 | Test BML payment end-to-end in UAT | H | L | Ops | Core business flow — must work before launch |
| A11 | Verify SMS delivery (OTP + order confirmation) | H | L | Ops | Core trust flow — customers expect SMS |
| A12 | Fix "anytime" contact page subtitle | L | L | ✅ Done | Inaccurate — business has specific hours |
| A13 | Fix hours meta description "7 days" claim | M | L | ✅ Done | Could conflict with actual schedule |
| A14 | Fix "No fuss, no wait" CTA copy | M | L | ✅ Done | Overpromises on delivery speed |
| A15 | Ensure `maps_embed_url` is set in CMS | M | L | Config | Contact page map shows placeholder |

---

## PHASE B — 30-Day Growth Improvements

> Goal: increase order conversion rate, average order value, and repeat order rate.

### B1 — Acquisition (get more first orders)

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| B1a | Enable first-order promo in CMS | H | L | Config | Biggest single-day conversion uplift; backend ready |
| B1b | Add social proof reviews block on homepage | H | M | Code | Unverified stats < real customer quotes |
| B1c | Complete referral reward payout (backend) | H | M | Code | Current state: referrers get nothing → programme is dead |
| B1d | Add delivery fee info before checkout | M | L | Code | Surprise fees at checkout = abandonment |
| B1e | Add "WhatsApp Us" to checkout page | M | L | Code | Reduces uncertainty-based abandonment |

### B2 — Average order value

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| B2a | Wire free delivery threshold in backend | H | M | Code | One of the highest-ROI AOV features in food delivery |
| B2b | Add free delivery progress bar in cart | H | M | Code | "Add MVR 30 more" = customers add more items |
| B2c | Add drink/add-on upsell in cart drawer | H | M | Code | 25–40% of add-on prompts convert |
| B2d | Create combo items in admin (ops) | H | L | Ops | No code needed — create combos as menu items |
| B2e | Add loyalty earn preview in cart | M | L | Code | "Earn 340 pts" reinforces order value |

### B3 — Repeat orders and retention

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| B3a | Add loyalty tier progress bar to account | H | M | Code | Tier aspiration = more orders to reach next tier |
| B3b | Add "Your usual" reorder block on homepage | H | M | Code | Returning customers shouldn't have to browse the menu |
| B3c | Add "🎉 You earned X pts" on order completion | M | L | Code | Positive reinforcement, closes the loyalty loop |
| B3d | Add specials section to menu page | M | M | Code | Specials only on homepage misses the conversion moment |
| B3e | Add star ratings + review count to menu cards | H | M | Code | Social proof at the add-to-cart decision point |

---

## PHASE C — 60–90 Day Growth Features

> Goal: advanced retention mechanics, higher-value customer segments, data-driven growth.

### C1 — Loyalty improvements

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| C1a | Add DOB field to customer profile | M | L | Code | Enables birthday campaigns |
| C1b | Birthday offer automation (SMS) | H | M | Code | Highest-ROI retention SMS in hospitality |
| C1c | Loyalty milestone notifications (via SMS) | M | M | Code | Tier upgrade = celebration = brand affinity |
| C1d | Show "near tier upgrade" at checkout | M | L | Code | "You're 200 pts from Gold!" drives incremental spend |

### C2 — Office / catering ordering

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| C2a | "Office Breakfast" homepage section | H | L | Content | Visible B2B segment signal |
| C2b | Corporate pre-order inquiry flow | H | M | Code | WhatsApp CTA + min-order form; unlocks high-AOV segment |
| C2c | Catering menu section in admin | M | L | Ops | Create a Catering category with bulk items/pricing |

### C3 — Advanced upsells

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| C3a | "Frequently bought together" in item modal | M | H | Code | Requires item pairing configuration |
| C3b | Post-order "order again" re-engagement | M | M | Code | On completion, prompt next order with pre-filled cart |
| C3c | "Add to favourites" from cart | L | L | Code | Quick win for power users |

### C4 — Retention mechanics

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| C4a | WhatsApp abandoned cart message (30 min) | H | H | Code | Requires webhook + scheduled job; high conversion |
| C4b | Live wait time surfaced in checkout | M | H | Code | Uses existing `/api/ordering/wait-time` endpoint |
| C4c | Social share after completed order | L | M | Code | Pre-filled referral link in share; acquisition loop |
| C4d | Allergy / dietary filters on menu | M | H | Code | Item metadata needed from admin |

### C5 — Data and measurement

| # | Item | Impact | Effort | Type | Why |
|---|---|---|---|---|---|
| C5a | Connect Google Analytics / conversion tracking | H | L | Config | Without it, you don't know what's working |
| C5b | SMS campaign A/B testing | M | M | Code | Improve campaign effectiveness over time |
| C5c | Customer cohort report in admin | M | H | Code | Track new vs returning customer ratio over time |

---

## Quick reference priority matrix

```
PHASE A (before launch):
  ✅ Done in this audit: A1, A2, A12, A13, A14
  Content/Config (do now): A3, A4, A5, A6, A7, A15
  Code (do now): A8, A9
  Ops (do now): A10, A11

PHASE B (30 days, highest ROI):
  Config (immediate): B1a
  Code (week 1–2): B1c (referral payout), B2a+B2b (free delivery), B3a (tier bar)
  Code (week 2–4): B1b (reviews), B2c (cart upsell), B3b (homepage reorder), B3e (star ratings)
  Ops (week 1): B2d (combo items)

PHASE C (60–90 days):
  Quick wins: C1a (DOB), C2a (office section), C4c (share button)
  Medium effort: C1b (birthday offers), C2b (corporate flow), C3b (reorder CTA)
  High effort: C4a (abandoned cart), C4d (allergy filters)
```

---

## Effort / Impact summary

| Feature | Impact | Effort | ROI |
|---|---|---|---|
| Fix profile skip button | H | L | ★★★★★ |
| First-order promo banner | H | L | ★★★★★ |
| Free delivery progress bar | H | M | ★★★★★ |
| Cart upsell (add drink) | H | M | ★★★★★ |
| Referral payout | H | M | ★★★★★ |
| Loyalty tier bar | H | M | ★★★★ |
| Homepage reorder block | H | M | ★★★★ |
| Star ratings on menu | H | M | ★★★★ |
| Birthday offer SMS | H | M | ★★★★ |
| Combo items (ops) | H | L | ★★★★★ |
| Guest checkout | H | H | ★★★ |
| Abandoned cart WhatsApp | H | H | ★★★ |
