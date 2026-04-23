# POS UAT Bug Report

**Session:** 2026-04-24 UAT sweep (pre-auth only + code review)  
**Severity scale:** Critical / High / Medium / Low  

---

## Confirmed failures from live execution

_None._ No **FAIL** statuses were recorded for executed cases; invalid login and validation behaved as expected.

---

## Findings from code review (not re-tested live)

These are **product / UX observations** aligned with test matrix expectations. No code was changed in this UAT task per user instruction (no business-logic edits unless a proven defect).

### 1. Cart “Total” vs discount (Area H / J) — **Low**

- **Expected (test intent):** Discount changes the amount the customer pays; testers may expect the cart “Total” line to reflect discount.
- **Actual (code):** `OrderCart.tsx` displays `MVR {cartTotal.toFixed(2)}` where `cartTotal` in `useCart.ts` is the sum of line items **only**; `discountAmount` is submitted in `useOrderCreation.buildPayload()` but **not** subtracted in the displayed total.
- **Affected files:** `apps/pos-web/src/components/OrderCart.tsx`, `apps/pos-web/src/hooks/useCart.ts`, `apps/pos-web/src/hooks/useOrderCreation.ts`
- **Recommendation:** Confirm with product owner; if POS should show payable total, adjust display (minimal UI change) without altering server contract.

### 2. Purchase UI: single line item only (Area S — S007) — **Low / coverage gap**

- **Expected (matrix):** “Add multiple purchase items”.
- **Actual (code):** `OpsPanel` / `handleCreatePurchase` sends a **single** `items: [{ name, quantity, unit_cost }]` row per submit.
- **Status:** Documented as **NOT AVAILABLE** for multi-line in one purchase from POS UI; API may still support arrays for other clients.

### 3. Refunds filter (Area T — T002) — **Low / coverage gap**

- **Expected:** “Filter refunds if supported”.
- **Actual:** `fetchRefunds` supports `?status=` but **OpsPanel** always calls `fetchRefunds()` with no status; no filter UI.
- **Status:** **NOT AVAILABLE** in POS OPS UI.

---

## Regressions / fixes applied

**None** in this engagement (documentation and evidence only).
