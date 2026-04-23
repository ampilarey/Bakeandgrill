# UAT Fixes Summary — Bake & Grill
**Date:** 23 April 2026  

This file summarises fixes that should be prioritised based on UAT findings.

---

## IMMEDIATE FIX REQUIRED (Confirmed Live Bugs)

### Fix 1 — KDS Ready Column (Bug #4)
**Priority:** HIGH  
**File:** `apps/admin-dashboard/src/pages/KDSPage.tsx`  
**Issue:** Ready column hardcoded as `[]`. Orders marked Ready vanish from Cooking but don't appear anywhere in KDS.  
**Fix:** Wire the Ready column to the API response — filter orders by `status === 'ready'` from the KDS polling response.  
**Confirmed in:** UAT test N006  

### Fix 2 — Reports Date Presets (Bug #6)
**Priority:** MEDIUM  
**File:** `apps/admin-dashboard/src/pages/ReportsPage.tsx`  
**Issue:** `useEffect` dependency array missing `fromDate` and `toDate` state variables. Preset buttons (Today, 7 days, 30 days, 90 days) update date fields but don't trigger data reload.  
**Fix:** Add date state variables to the `useEffect` dependency array that calls the reports API.  
**Confirmed in:** UAT test R003  

---

## RECOMMENDED FIXES (Known Bugs from Audit — Not Yet Fixed)

### Fix 3 — ProfitLossPage Division by Zero (Bug #1)
**Priority:** HIGH (crash risk)  
**File:** `apps/admin-dashboard/src/pages/ProfitLossPage.tsx` ~line 99  
**Issue:** `Math.abs(row.value) / pnl.revenue.gross * 100` crashes when `gross = 0`  
**Fix:** `pnl.revenue.gross !== 0 ? (Math.abs(row.value) / pnl.revenue.gross * 100) : 0`  

### Fix 4 — SettingsPage Non-Null Assertion (Bug #2)
**Priority:** HIGH (crash risk)  
**File:** `apps/admin-dashboard/src/pages/SettingsPage.tsx` ~line 376  
**Fix:** `HUB_CARDS.find((c) => c.id === active) ?? HUB_CARDS[0]`  

### Fix 5 — WebhooksPage Secret Key Exposure (Bug #3)
**Priority:** HIGH (security)  
**File:** `apps/admin-dashboard/src/pages/WebhooksPage.tsx` ~line 194  
**Fix:** Replace `alert(secret)` with `navigator.clipboard.writeText(secret)` + toast  

### Fix 6 — SmsPage Unicode Segment Count (Bug #5)
**Priority:** MEDIUM  
**File:** `apps/admin-dashboard/src/pages/SmsPage.tsx` ~line 183  
**Fix:** Detect non-GSM7 chars; use 70 chars/segment for Unicode, 160 for ASCII  

---

## CONFIRMED WORKING — No Fix Needed

The following features from the audit were confirmed working correctly during live UAT:

| Feature | Evidence |
|---------|---------|
| KDS payment-first ordering | Order #BG-20260423-0016 only appeared in KDS AFTER BML payment confirmed |
| BML redirect and callback | Payment completed, correct redirect to `/order/orders/3?payment=CONFIRMED` |
| Order status auto-refresh | Customer status page updated correctly from Received → Ready → Delivered |
| Review post-completion | Review form appeared exactly when order reached Delivered status |
| Admin review moderation | Approve button worked, status badge updated, pending count decremented |
| Loyalty balance display | 500 pts, Bronze tier, tier progress bar on customer account |
| Homepage reorder block | "Welcome back!" block with last order + Reorder button |
| Cart free delivery progress | "Add MVR 199.00 for free delivery" progress bar |
| Cart upsell block | "Add to your order" section in cart drawer |
| GST calculation | MVR 1.00 item → MVR 0.08 GST → MVR 1.08 total |
| Delivery fee | MVR 20.00 added correctly on delivery selection |
| Reports revenue | MVR 1.08, 1 order shown correctly after order completion |
| P&L page | Gross Revenue MVR 1.08, Net Profit MVR 1.08 (100% margin) |
