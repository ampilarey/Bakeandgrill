# Tax / Total Verification — Discovery

**Date:** 2026-04-22  
**Scope:** Bake & Grill — test.bakeandgrill.mv  
**Auditor:** automated code + live API inspection

---

## 1. Files Responsible for Tax / Total Calculation

| Layer | File | Role |
|---|---|---|
| Frontend display | `apps/online-order-web/src/hooks/useCheckout.ts` | Calculates `taxLaar`, `subtotalLaar`, `totalLaar` for display |
| Frontend display | `apps/online-order-web/src/pages/CheckoutPage.tsx` | Renders GST/total lines from `useCheckout` |
| Backend calculation | `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php` | Authoritative calculation for all stored totals |
| Backend value object | `backend/app/Domains/Shared/ValueObjects/Money.php` | Integer-laari arithmetic, rounding rules |
| Backend result DTO | `backend/app/Domains/Orders/DTOs/TotalsBreakdown.php` | Maps calculation result → order DB columns |
| Backend order creation | `backend/app/Services/OrderCreationService.php` | Calls `recalculateAndPersist()` after adding items and discounts |
| Backend payment init | `backend/app/Domains/Payments/Services/PaymentService.php` | Reads order total → creates BML payment amount |
| Config | `backend/config/app.php` line 129–130 | Reads `TAX_RATE_BP` and `TAX_INCLUSIVE` from `.env` |

---

## 2. Source of Truth for Tax

### There are TWO separate sources — they are NOT automatically linked.

| Source | Location | Format | Used by |
|---|---|---|---|
| **Item-level `tax_rate`** | `items.tax_rate` DB column, served in `/api/items` | Percentage float (e.g. `8.00`) | Frontend `taxLaar` display |
| **Global `TAX_RATE_BP`** | `.env` → `config('app.tax_rate_bp', 0)` | Basis points integer (e.g. `800`) | Backend `OrderTotalsCalculator` |

These are **independent**. If one changes without the other, frontend and backend will show/store different taxes.

---

## 3. How Each Layer Calculates Tax

### Frontend (`useCheckout.ts` lines 231–238)
```typescript
const taxLaar = cart.reduce((sum, item) => {
  const rate = item.taxRate ?? 0;          // comes from item.tax_rate in DB
  if (rate <= 0) return sum;
  const itemLaar = price * qty + modifiers;
  return sum + Math.round(itemLaar * rate / 100);
}, 0);
```
- Tax = per-item tax_rate applied to item line total
- NOT discounted — always on full subtotal

### Frontend total floor (`useCheckout.ts` lines 247–250)
```typescript
const totalLaar = Math.max(
  taxLaar + deliveryFeeLaar,               // floor: GST on full subtotal always owed
  subtotalLaar + taxLaar + deliveryFeeLaar - allDiscounts,
);
```

### Backend (`OrderTotalsCalculator.php` lines 35–69)
```php
$taxRateBp = config('app.tax_rate_bp', 0);   // DEFAULT IS 0 — silent if not set
$tax = $discountedSubtotal->addTax($taxRateBp)->subtract($discountedSubtotal);
$grandTotal = $discountedSubtotal->add($tax);

// Floor: GST on full subtotal always owed
if ($taxRateBp > 0) {
    $minPayable = $subtotal->addTax($taxRateBp)->subtract($subtotal);
    if ($grandTotal->isLessThan($minPayable)) {
        $tax = $minPayable;
        $grandTotal = $minPayable;
    }
}
```
- Tax = `TAX_RATE_BP` applied to discounted subtotal
- Floor: grandTotal can never go below GST on full subtotal

### `Money::addTax()` rounding
```php
$taxLaar = (int) round($amountLaar * $rateBp / 10000);
```
- `800 bp = 8%` → `round(1000 * 800 / 10000)` = `round(80)` = `80` laari ✓

### `Money::subtract()` clamp
```php
return new self(max(0, $result), $this->currency);
```
- **subtract never returns negative** — excess discounts clamp to 0

---

## 4. Config / Env Dependencies

| Variable | Default | Effect if missing/wrong |
|---|---|---|
| `TAX_RATE_BP` | **0** | Backend silently calculates 0% tax. Frontend still shows item-level tax. **Silent mismatch.** |
| `TAX_INCLUSIVE` | `false` | If accidentally `true`, tax-inclusive mode used — GST floor logic does NOT apply |
| `VITE_DELIVERY_FEE_MVR` | `20` (fallback) | Delivery fee on frontend; backend uses its own fee column |

---

## 5. Mismatch Risks

### Risk A — `TAX_RATE_BP` not set on server (HIGH)
- Default is `0`
- Frontend shows `MVR 0.80` GST (from item.tax_rate=8%)
- Backend stores `tax_laar=0`, `total_laar` excludes GST
- BML charged amount = order total with 0 GST
- Customer pays less than displayed — silent revenue loss

### Risk B — Item `tax_rate` and `TAX_RATE_BP` drift (MEDIUM)
- Both currently = 8%, but they are set independently
- No enforcement or validation that they match
- If items are changed to 0% in admin but `TAX_RATE_BP` stays 800: frontend shows no GST, backend charges GST — customer undercharged on display, correctly charged on backend

### Risk C — Referral discount invisible on checkout display (LOW)
- Referral `discountLaar=0` while `pending=true` (before order creation)
- Checkout button shows `totalLaar` without referral deducted
- After order creation + referral applied server-side, fresh order total is fetched correctly
- BML amount is correct, but checkout label shown to user before clicking is wrong
- Confirmed in live test: button showed "Pay MVR 5.30", BML charged MVR 0.80

### Risk D — `initiateBmlPayment` uses float `total` not integer `total_laar` (LOW)
- Line 43: `$amountLaar = $amountLaar ?? (int) round($order->total * 100);`
- Should be: `$order->total_laar`
- Float round-trip is safe for 2-decimal MVR amounts in practice, but introduces unnecessary precision risk

---

## 6. BML Payment Amount Chain

```
OrderTotalsCalculator::calculate()
  → TotalsBreakdown::grandTotal (laari)
  → recalculateAndPersist() sets:
      order.total_laar = grandTotal + deliveryFeeLaar
      order.total      = round(total_laar / 100, 2)  ← MVR float

PaymentService::initiateBmlPayment()
  → amountLaar = (int) round(order.total * 100)     ← converts float back to int
  → Payment.amount_laar = amountLaar
  → BmlConnectService::createPayment(amountLaar)     ← sent to BML
```

For MVR 0.80: `0.80 → round(0.80 × 100) = 80` ✓ — no precision error for this value.

---

## 7. Existing Test Coverage for Tax / Totals

| Test | Coverage |
|---|---|
| `tests/Unit/MoneyTest.php` | `subtract` clamp, `addTax`, `extractTax`, rounding rules |
| `tests/Feature/OrderFlowTest.php` | Order creation + payment flow — **no tax assertion** |
| `tests/Feature/Payment/BmlReturnUrlTest.php` | BML return URL routing — **no tax assertion** |
| No dedicated test | `OrderTotalsCalculator` with non-zero `TAX_RATE_BP` |
| No dedicated test | Tax floor logic (discounts > subtotal scenario) |
| No dedicated test | Frontend `taxLaar` vs backend `tax_laar` consistency |

**Gap:** No test verifies that `OrderTotalsCalculator` correctly applies `TAX_RATE_BP=800` and produces the right `tax_laar` / `total_laar` values.

---

## 8. Verified Server State (as of 2026-04-22)

| Check | Evidence | Result |
|---|---|---|
| `TAX_RATE_BP` on server | BML charged MVR 0.80 on MVR 10.00 order = 8% | **800 — CORRECT** |
| Item `tax_rate` | `/api/items` → `BML Bajiya: tax_rate: 8.00` | **8% — MATCHES** |
| `TAX_INCLUSIVE` | Backend used exclusive formula + floor | **false — CORRECT** |
| Frontend GST display | Checkout showed GST MVR 0.80 on MVR 10.00 | **CORRECT** |
| Backend total stored | Admin showed MVR 0.80 for order 0006 | **CORRECT** |
