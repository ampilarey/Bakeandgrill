# Tax / Total Bug Fix Report

---

## FINAL VERDICT

### Tax Calculation: ✅ FIXED

All GST calculations are correct. TAX_RATE_BP=800 is active on the test server. Frontend, backend, and BML all agree.

### Server Config: ✅ CORRECT

TAX_RATE_BP=800 confirmed by observable behaviour (MVR 8.64 total on 8-item order, MVR 0.80 floor on all-discounts order).

### BML Payment Amount: ✅ MATCHES ORDER TOTAL

BML charged amount equals the backend-stored order total in all tested scenarios.

### UX Issue (Not a Bug): ⚠️ REFERRAL BUTTON LABEL MISMATCH

The "Pay MVR X.XX" button label is calculated client-side and does not know the referral discount amount before order creation. After order creation and referral application, the fetched `freshOrder.total` is correct. BML is charged the correct amount. This is a UI display issue, not a calculation error.

---

## Root Cause of Previous Bug (Now Fixed)

### What was wrong:

1. **GST Floor Logic (FIXED — was the user-reported bug):**
   - Old behaviour: `grandTotal = Math.max(0, subtotal + tax - discounts)` → could be 0 even when GST owed
   - User reported: "total paid should be 0.8 in this case not zero"
   - Fix applied: `grandTotal = Math.max(taxOnFullSubtotal, discountedSubtotal + taxOnDiscountedSubtotal)`

2. **Frontend total floor (FIXED):**
   - Old: `Math.max(0, ...total...)`
   - New: `Math.max(taxLaar + deliveryFeeLaar, ...total...)` — mirrors server floor logic

3. **`DB::afterCommit` 500 errors (FIXED):**
   - Uncaught exceptions in afterCommit callbacks caused HTTP 500 even after DB committed
   - Fix: all `DB::afterCommit` callbacks wrapped in `try/catch`

---

## Files Changed

### Backend

| File | Change | Status |
|---|---|---|
| `backend/app/Domains/Orders/Services/OrderTotalsCalculator.php` | Added GST floor: `grandTotal = max(minPayable, calculatedTotal)` where `minPayable = tax on full subtotal` | DEPLOYED |
| `backend/app/Domains/Payments/Services/PaymentService.php` | Wrapped `DB::afterCommit` callbacks in `try/catch` to prevent 500 after successful DB commit | DEPLOYED |
| `backend/routes/api.php` | Increased throttle on `/promotions/validate` from `throttle:5,1` to `throttle:20,1` | DEPLOYED |

### Frontend

| File | Change | Status |
|---|---|---|
| `apps/online-order-web/src/hooks/useCheckout.ts` | Changed `Math.max(0, ...)` to `Math.max(taxLaar + deliveryFeeLaar, ...)` for totalLaar. Added client-side promo discount estimation on code entry. | DEPLOYED |
| `apps/online-order-web/src/pages/CheckoutPage.tsx` | Show promo discount badge/line as soon as `promoApplied.discountLaar > 0` | DEPLOYED |

---

## Env Changes Required

| Variable | Required Value | Current Server Value | Status |
|---|---|---|---|
| `TAX_RATE_BP` | `800` (for 8% GST) | `800` (confirmed) | ✅ Already correct |
| `TAX_INCLUSIVE` | `false` | `false` (confirmed) | ✅ Already correct |

**No env changes required.**

---

## Cache Rebuild Commands

The config was already cached after all code changes were deployed. No rebuild needed.

If a future env change is made:
```bash
cd /home/bakeandgrill/test.bakeandgrill.mv/backend
php artisan config:cache
php artisan route:cache
php artisan view:clear
```

---

## Remaining Risks (Not Current Bugs)

### Risk 1: Dual tax-rate sources can drift

**What it is:** Frontend reads `item.tax_rate` (DB per-item). Backend reads `TAX_RATE_BP` (global .env). If these drift apart, frontend shows different GST than backend charges.

**Current state:** Both = 8%. No drift right now.

**Recommendation for launch:**
```bash
# Add to deployment checklist:
# 1. Verify TAX_RATE_BP in .env equals item tax_rate in DB
# 2. After any TAX_RATE_BP change: php artisan config:cache
# 3. After any item tax_rate DB change: deploy frontend so UI refreshes
```

### Risk 2: `PaymentService::initiateBmlPayment` uses float

**Line:** `backend/app/Domains/Payments/Services/PaymentService.php:43`
```php
$amountLaar = $amountLaar ?? (int) round($order->total * 100);
```
**Should be:**
```php
$amountLaar = $amountLaar ?? $order->total_laar;
```
**Impact:** For standard 2-decimal MVR amounts, `round(float * 100)` = exact int. No current precision error. But safer to use the already-integer `total_laar` field.

**Severity:** LOW — not causing errors today, but a correctness improvement.

### Risk 3: Referral discount UX gap

**What it is:** The checkout button shows "Pay MVR X.XX" without the referral discount applied (because referral is applied server-side post-order-creation). User sees a higher number than they expect.

**Actual charge is correct.** This is a UX confusion issue, not a financial error.

**Recommendation:** Either:
a) Show referral discount in the button label if `friendReferralApplied` is set (estimate it client-side), or
b) Add a tooltip: "Referral discount applied after order creation"

---

## Regression Tests Recommended

### Add to `OrderTotalsCalculatorTest.php`:

```php
test('GST floor applies when discounts exceed subtotal', function () {
    // 10 items × 100 laari = 1000 laari subtotal
    // TAX_RATE_BP = 800
    // Discounts = 1100 laari (> subtotal)
    // Expected: grandTotal = 80 laari (8% of 1000), not 0
    $breakdown = $this->calculator->calculate([
        'subtotal_laar' => 1000,
        'promo_discount_laar' => 1100,
        'tax_rate_bp' => 800,
        'tax_inclusive' => false,
        'delivery_fee_laar' => 0,
    ]);
    expect($breakdown->grand_total_laar)->toBe(80);
    expect($breakdown->tax_laar)->toBe(80);
});

test('GST floor not applied when discounts do not exceed subtotal', function () {
    // subtotal 1000, discount 500, net = 500
    // GST on 500 = 40, total = 540
    // Floor = 80 (8% of 1000)
    // 540 > 80, so no floor
    $breakdown = $this->calculator->calculate([
        'subtotal_laar' => 1000,
        'promo_discount_laar' => 500,
        'tax_rate_bp' => 800,
        'tax_inclusive' => false,
        'delivery_fee_laar' => 0,
    ]);
    expect($breakdown->grand_total_laar)->toBe(540);
});
```

---

## Pre-Launch Checklist

- [x] TAX_RATE_BP=800 set on test server
- [x] TAX_INCLUSIVE=false set on test server
- [x] Backend GST floor logic deployed
- [x] Frontend total floor logic deployed
- [ ] Set TAX_RATE_BP=800 on PRODUCTION server (owner must do this before go-live)
- [ ] Run `php artisan config:cache` on PRODUCTION after setting env
- [ ] Fix `PaymentService.php:43` to use `$order->total_laar` (low priority, safe to defer)
- [ ] Add regression tests for GST floor behaviour
- [ ] Improve referral discount UX in checkout button label (low priority)

---

## Exact Next Steps Required From Owner

1. **Before production launch** — set these in the production server's `.env`:
   ```
   TAX_RATE_BP=800
   TAX_INCLUSIVE=false
   ```
   Then run:
   ```bash
   cd /home/bakeandgrill/bakeandgrill.mv/backend
   php artisan config:cache
   ```

2. **Confirm BML production credentials** are set in production `.env`:
   ```
   BML_API_KEY=...
   BML_APP_ID=...
   BML_ENFORCE_SIGNATURE=true
   BML_RETURN_URL=https://bakeandgrill.mv/payments/bml/return
   BML_WEBHOOK_URL=https://bakeandgrill.mv/payments/bml/webhook
   ```
   (Do not carry over UAT keys to production)

3. **No other manual steps required** — all calculation code is deployed and verified.
