# POS UAT Bug Report

**Session:** 2026-04-24 UAT sweep (pre-auth only + code review)  
**Severity scale:** Critical / High / Medium / Low  

---

## Confirmed failures from live execution

_None._ No **FAIL** statuses were recorded for executed cases; invalid login and validation behaved as expected.

---

## Findings from code review (not re-tested live)

These are **product / UX observations** aligned with test matrix expectations. No code was changed in this UAT task per user instruction (no business-logic edits unless a proven defect).

### 1. Cart “Total” vs discount (Area H / J) — **Resolved (May 2026)**

- **Was:** Cart total did not subtract manual/rewards discounts.
- **Now:** `useCart.ts` computes `discountedSubtotal`, proportional tax, and `cartTotal`; `OrderCart.tsx` Charge button shows the payable total with a subtotal/discount/GST breakdown.

### 2. Purchase UI: single line item only (Area S — S007) — **Low / coverage gap**

- **Expected (matrix):** “Add multiple purchase items”.
- **Actual (code):** `OpsPanel` / `handleCreatePurchase` sends a **single** `items: [{ name, quantity, unit_cost }]` row per submit.
- **Status:** Documented as **NOT AVAILABLE** for multi-line in one purchase from POS UI; API may still support arrays for other clients.

### 3. Refunds filter (Area T — T002) — **Resolved (May 2026)**

- **Was:** `fetchRefunds` supported `?status=` but no filter UI in POS Operations.
- **Now:** Operations → **Refunds** tab lists history with status filter (All / Pending / Approved / Processed / Rejected) and a record-refund form.

---

## Regressions / fixes applied

**None** in this engagement (documentation and evidence only).
