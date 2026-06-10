# Pre-Production Bugs Found — Live Test
**Date:** 22 April 2026  
**Environment:** https://test.bakeandgrill.mv

---

## BUG #1 — CRITICAL: GST/Tax mismatch — checkout shows more than is actually charged

**Severity:** Critical (revenue impact — customer is charged less than shown)  
**Affected:** All orders with items that have `tax_rate > 0` set in the admin menu  
**Status:** Server config fix required (not a code bug)

### What happens
- Customer places order for 1× BML Bajiya at MVR 1.00
- Checkout page shows: Subtotal MVR 1.00, GST 8% = MVR 0.08, **Total MVR 1.08**
- BML is charged: **MVR 1.00** (not MVR 1.08)
- Order stored in database: **MVR 1.00**
- Customer was shown MVR 1.08 but only charged MVR 1.00

### Root cause
Two separate tax configuration mechanisms:
1. **Frontend** (`useCheckout.ts`): Reads `item.tax_rate` from the menu item (stored in DB as `%`) and adds GST to the checkout display
2. **Backend** (`OrderTotalsCalculator`): Uses global `config('app.tax_rate_bp', 0)` from `.env` `TAX_RATE_BP` setting

The server's `.env` currently has `TAX_RATE_BP=0` (or unset), so the backend adds **no** tax to the order total. But the BML Bajiya item has `tax_rate = 8.00` in the DB, so the frontend shows 8% GST in the checkout.

### Fix required (server-side)
On the test server, set in `/home/bakeandgrill/test.bakeandgrill.mv/backend/.env`:
```
TAX_RATE_BP=800
```
Then run: `php artisan config:cache`

**For production (`bakeandgrill.mv`), this is equally critical** — if `TAX_RATE_BP` is not 800, all taxable items will be undercharged.

### Code change made
Updated `backend/.env.example` to default to `TAX_RATE_BP=800` with a clear warning comment. The existing server `.env` must be updated manually.

---

## BUG #2 — MEDIUM: Admin orders list "Customer" column always shows "—"

**Severity:** Medium (staff UX — can't see customer at a glance)  
**Affected:** All orders in admin Orders page list view  
**Status:** ✅ Fixed in this session

### What happened
The orders list displayed "—" for every order in the Customer column, even for online orders with registered customers.

### Root cause
`OrdersPage.tsx` line 470 used `o.customer_name` (flat field, always null from list API) instead of `o.customer?.name` (nested object returned by the backend).

The backend returns: `customer: { id, name, phone }` (eager-loaded with `:select`).

### Fix applied
```diff
- {o.customer_name ?? o.table_number ?? '—'}
+ {o.customer?.name ?? o.customer_name ?? o.table_number ?? '—'}
```
File: `apps/admin-dashboard/src/pages/OrdersPage.tsx`

---

## BUG #3 — LOW: Orphaned loyalty account row after hard-delete of customer

**Severity:** Low (admin data display pollution)  
**Affected:** Loyalty Accounts admin page  
**Status:** ✅ Fixed in this session

### What happened
After hard-deleting a customer from the database (bypassing soft-deletes), their `loyalty_accounts` row remained. The admin loyalty page showed a row with "—" for name and phone.

### Root cause
`LoyaltyController::adminAccountIndex()` fetched all loyalty accounts without filtering out orphaned ones (those whose associated customer no longer exists).

### Fix applied
Added `->whereHas('customer')` to the query in `backend/app/Http/Controllers/Api/LoyaltyController.php`:
```php
$query = LoyaltyAccount::with('customer:id,name,phone')
    ->whereHas('customer')   // ← added
    ->orderByDesc('lifetime_points');
```
This also handles soft-deleted customers — if a customer is soft-deleted, their loyalty row will be hidden from the admin loyalty list.

---

## INFORMATIONAL NOTES

### NOTE 1: KDS has ~67 stale test orders from March 2026
The Kitchen Display page shows 67+ "Pending" orders from March 2026 with 898h+ wait times (shown in red). These are stale test orders that were never completed or cancelled.

**Recommendation:** Run the following to cancel old `pending` orders:
```bash
cd /home/bakeandgrill/test.bakeandgrill.mv/backend
php artisan tinker --execute="
  App\Models\Order::where('status', 'pending')
    ->where('created_at', '<', now()->subDays(7))
    ->update(['status' => 'cancelled']);
  echo 'Done';
"
```
Only do this on the test environment — verify the count first:
```bash
php artisan tinker --execute="echo App\Models\Order::where('status','pending')->where('created_at','<',now()->subDays(7))->count();"
```

### NOTE 2: Loyalty points are credited on order completion (not placement)
The checkout shows "You'll earn 1 pts from this order" but after payment the balance remains 0. This is **correct expected behavior** — points are credited when the order reaches `completed` status. The checkout preview is just an estimate.

### NOTE 3: Cart persists in localStorage across accounts
If a different user logs in on the same browser, they may see items from a previous session in their cart (stored in `localStorage`). This is expected behavior for many e-commerce apps but could be surprising.
