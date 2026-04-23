# UAT Bug Report — Bake & Grill
**Date:** 23 April 2026  
**Environment:** https://test.bakeandgrill.mv  

---

## CONFIRMED BUGS (Observed Live During UAT)

### BUG-001 — KDS Ready Column Always Empty
**Severity:** HIGH  
**Area:** N006 (Kitchen Display System)  
**File:** `apps/admin-dashboard/src/pages/KDSPage.tsx`  
**Description:** The "Ready" column in the Kitchen Display System always shows "Nothing here" regardless of how many orders have been marked Ready. Clicking "Mark Ready ✓" on a Cooking order correctly transitions the order status (confirmed via the Orders page — order shows "Ready" status with "✓ Done" action), but the KDS Ready column is never populated.  
**Root Cause (from prior audit):** The Ready column is hardcoded as an empty array `[]` and never wired to the API response.  
**Impact:** Kitchen staff cannot see Ready orders in the KDS. They must check the Orders page instead, breaking the intended kitchen workflow.  
**Steps to Reproduce:**
1. Place and pay for an order
2. In KDS, click "Start Cooking" → order moves to Cooking
3. Click "Mark Ready ✓" → order disappears from Cooking
4. Ready column still shows "Nothing here"
5. Check Orders page → order IS in Ready status  
**Expected:** Order card appears in Ready column  
**Fix:** Wire the Ready column to the KDS API response data  

---

### BUG-002 — Reports Date Presets Don't Auto-Reload
**Severity:** MEDIUM  
**Area:** R003 (Reports)  
**File:** `apps/admin-dashboard/src/pages/ReportsPage.tsx`  
**Description:** Clicking the preset buttons (Today, 7 days, 30 days, 90 days) updates the date input fields but does not trigger a data reload. The user must manually click "Apply" to fetch updated report data.  
**Root Cause (from prior audit):** The `useEffect` dependency array is missing the date filter state variables.  
**Impact:** UX friction — clicking "Today" appears to do nothing until Apply is also clicked. Confusing for operators.  
**Steps to Reproduce:**
1. Open Admin → Reports (default 7-day range loads correctly)
2. Click "Today" preset button
3. Date fields update to today's date
4. Report data does NOT change
5. Only after clicking "Apply" does data reload  
**Expected:** Clicking preset button immediately reloads data  
**Fix:** Add date state variables to `useEffect` dependency array  

---

### BUG-003 — KDS Polling Reconnection Visible to Users
**Severity:** LOW  
**Area:** N007 (KDS)  
**File:** `apps/admin-dashboard/src/pages/KDSPage.tsx`  
**Description:** The KDS page intermittently shows "Polling (reconnecting…)" indicator. During testing, the live indicator flipped between "● Live" and "○ Polling (reconnecting…)" multiple times within seconds, even with a stable connection.  
**Impact:** Low — kitchen staff may see the reconnecting message and be confused about data freshness.  
**Possible Cause:** Short polling timeout or aggressive reconnect logic.  

---

### BUG-004 — Dashboard Revenue Shows MVR 0.00 Despite Completed Orders
**Severity:** LOW-MEDIUM  
**Area:** Dashboard  
**File:** `apps/admin-dashboard/src/pages/DashboardPage.tsx`  
**Description:** The Dashboard "TODAY AT A GLANCE" showed Revenue: MVR 0.00, Orders: 0 immediately after order #BG-20260423-0016 was completed and marked Done. However, the "ACTIVE ORDERS" section correctly showed 3 orders, and the Reports page showed Revenue: MVR 1.08, Orders: 1.  
**Impact:** Dashboard revenue stat may be stale or uses a different query than Reports. Managers could be misled by MVR 0.00 when revenue has actually been received.  
**Possible Cause:** Dashboard uses a cached or differently-scoped query (e.g., counting only "completed" status, or using a daily summary that refreshes at midnight).  
**Note:** This may be by design (dashboard uses cached daily summary vs. Reports uses live query). Needs clarification from dev.  

---

### BUG-005 — Loyalty Points Not Credited After Completed Order (Possible Queue Delay)
**Severity:** LOW  
**Area:** Q002 (Loyalty)  
**Description:** After completing order #BG-20260423-0016 (MVR 1.08), the Loyalty Accounts page still showed 500 pts (not 501). The checkout page had shown "You'll earn 1 pts from this order."  
**Possible Cause:** Loyalty point crediting is a queued job. If the queue worker is not running or is backed up, points won't be credited immediately.  
**How to Check:** Verify queue worker is running on server: `ps aux | grep queue:work`. If not running, start it (see `deploy-commands.mdc`).  
**Impact:** Low — points will credit when worker processes the job. Not urgent unless worker is permanently down.  

---

## KNOWN BUGS (From Audit — Not Re-Tested)

These were identified in the codebase audit but were not triggered during live UAT:

| Bug | File | Status |
|-----|------|--------|
| Bug #1: ProfitLossPage division by zero | `ProfitLossPage.tsx` ~line 99 | Could not trigger (revenue > 0 in UAT) |
| Bug #2: SettingsPage non-null assertion crash | `SettingsPage.tsx` ~line 376 | Not tested |
| Bug #3: WebhooksPage shows secret in alert() | `WebhooksPage.tsx` ~line 194 | Not tested |
| Bug #5: SmsPage Unicode segment calculation | `SmsPage.tsx` ~line 183 | Not tested |
| Bug #7: InvoicesPage "All" filter broken | `InvoicesPage.tsx` ~line 22 | Could not reproduce with empty list |
| Bug #8: PromotionsPage no negative % check | `PromotionsPage.tsx` | Not tested |
| Bug #9: LoyaltyPage parseInt NaN | `LoyaltyPage.tsx` | Not tested |
| Bug #10: ExpensesPage parseInt NaN | `ExpensesPage.tsx` | Not tested |
| Bug #11: OrdersPage stale setInterval | `OrdersPage.tsx` | Not directly observable |
| Bug #15: ProfitLossPage uses today() not date range | `ProfitLossPage.tsx` ~line 99 | Partially — P&L loaded correctly for default range |
