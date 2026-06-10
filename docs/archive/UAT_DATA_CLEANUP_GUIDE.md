# UAT Data Cleanup Guide — Bake & Grill
**Environment:** https://test.bakeandgrill.mv  
**Server path:** `/home/bakeandgrill/test.bakeandgrill.mv/backend`

---

## 1. What Stale Data Exists

| Data | Volume | Age | Impact |
|---|---|---|---|
| Stale `pending` orders (never completed/cancelled) | ~67+ | March 2026 | KDS clogged with red "898h+" wait time rows |
| Test customer accounts from automation | Unknown | Mar–Apr 2026 | Pollutes Customers list |
| Demo orders from payment testing | ~10+ | Apr 2026 | Orders page noise |
| BML payment_pending orders (redirect abandoned) | Unknown | Various | Stuck in payment_pending |

---

## 2. Why It Matters

- **KDS** shows 67+ stale "Pending" orders from March 2026 — KDS is unusable for real UAT kitchen flow testing
- Staff UAT testers see confusing data mixed with real test sessions
- Order count metrics in Dashboard are inflated by test data
- `payment_pending` orders that were never cancelled block stale-order cleanup logic

---

## 3. Cleanup Steps

### Step 3a — Admin UI (recommended for owners)

After deploying the latest `main` to test:

1. Log in to **Admin → Dashboard** as owner
2. Scroll to **POS maintenance**
3. Preview stale open tickets, then **Void stale ticket(s)** (skips paid orders automatically)
4. Go to **Shifts → Live** and **force-close** any shift open more than 24 hours

This uses `POST /api/admin/pos/cleanup-stale-tickets` under the hood and is safer than raw SQL because it skips orders with confirmed payments.

### Step 3b — Verify stale order count before touching anything (SSH)

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv/backend

# Count pending orders older than 7 days
php artisan tinker --execute="
echo 'Stale pending: ' . App\Models\Order::where('status', 'pending')
    ->where('created_at', '<', now()->subDays(7))->count();
echo 'Stale payment_pending: ' . App\Models\Order::where('status', 'payment_pending')
    ->where('created_at', '<', now()->subDays(7))->count();
echo 'Stale in_progress/preparing: ' . App\Models\Order::whereIn('status', ['in_progress', 'preparing'])
    ->where('created_at', '<', now()->subDays(7))->count();
"
```

### Step 3c — Cancel stale pending orders (safe for UAT)

Only do this after Step 3b confirms the counts make sense.

```bash
php artisan tinker --execute="
\$cutoff = now()->subDays(7);

// Cancel old pending orders
\$p = App\Models\Order::where('status', 'pending')
    ->where('created_at', '<', \$cutoff)
    ->update(['status' => 'cancelled']);
echo \"Cancelled pending: \$p\n\";

// Cancel old payment_pending orders (abandoned redirects)
\$pp = App\Models\Order::where('status', 'payment_pending')
    ->where('created_at', '<', \$cutoff)
    ->update(['status' => 'cancelled']);
echo \"Cancelled payment_pending: \$pp\n\";
"
```

### Step 3d — Cancel stale in-progress/preparing orders (optional, if any)

```bash
php artisan tinker --execute="
\$cutoff = now()->subDays(3);
\$ip = App\Models\Order::whereIn('status', ['in_progress', 'preparing'])
    ->where('created_at', '<', \$cutoff)
    ->update(['status' => 'cancelled']);
echo \"Cancelled in_progress/preparing: \$ip\n\";
"
```

### Step 3e — Clear stale test customer accounts (optional, use carefully)

> ⚠️ Only do this if you want a completely clean UAT customer slate.  
> This deletes customer records, loyalty accounts, and order associations via soft-delete.  
> **Never do this on production.**

```bash
# First check: how many test customers exist?
php artisan tinker --execute="
echo App\Models\Customer::count() . ' total customers';
"

# Soft-delete all customers and their associated loyalty accounts
# (orders remain in DB for financial audit trail, customer_id becomes null)
php artisan tinker --execute="
App\Models\Customer::chunk(100, function(\$customers) {
    foreach (\$customers as \$c) {
        \$c->delete();   // soft delete
    }
});
echo 'All customers soft-deleted';
"
```

### Step 3f — Verify KDS is clean after cleanup

After running the above, check the KDS page at https://test.bakeandgrill.mv/admin/kds  
The Pending column should show 0 or only recent (today's) test orders.

---

## 4. How to Prevent Future Clutter

### 4a — Mark test orders with a special note
When creating test orders during UAT sessions, add a recognizable special instruction:

```
Special instructions: [UAT TEST - DELETE AFTER]
```

Then cleanup is easy:
```bash
php artisan tinker --execute="
App\Models\Order::where('notes', 'LIKE', '%UAT TEST%')
    ->where('created_at', '<', now()->subDays(1))
    ->update(['status' => 'cancelled']);
"
```

### 4b — Use a dedicated test customer phone number
Create one test account for automation (e.g. `+9601234567`) and keep it separate from real test-user accounts. All automated test orders go to this account.

### 4c — Enable the stale-order cancellation scheduler
The `orders:cancel-stale` command is registered in `routes/console.php` and runs hourly.  
Verify it is running:

```bash
# Check scheduler ran recently
php artisan tinker --execute="
\$log = Illuminate\Support\Facades\Cache::get('scheduler_last_run');
echo \$log ?? 'No cache record found';
"

# Manually trigger stale order cancel
php artisan orders:cancel-stale
```

### 4d — BML webhook cleanup
After testing, some orders may be stuck in `payment_pending` because the BML UAT webhook was not delivered (network, wrong URL, etc.). Check:

```bash
php artisan tinker --execute="
\$stuck = App\Models\Order::where('status', 'payment_pending')
    ->where('created_at', '<', now()->subHours(1))
    ->count();
echo \"Orders stuck in payment_pending > 1hr: \$stuck\n\";
"
```

---

## 5. After Each UAT Session — Recommended Reset Checklist

Run these after each UAT test session to keep the environment clean for the next tester:

```bash
#!/bin/bash
# uat-cleanup.sh — run after each UAT session
cd /home/bakeandgrill/test.bakeandgrill.mv/backend

echo "=== UAT Post-Session Cleanup ==="

# Cancel orders older than 24h that are still pending/payment_pending
php artisan tinker --execute="
\$n = App\Models\Order::whereIn('status', ['pending', 'payment_pending', 'in_progress', 'preparing'])
    ->where('created_at', '<', now()->subDay())
    ->update(['status' => 'cancelled']);
echo \"Cleaned \$n stale orders\n\";
"

# Show remaining order count
php artisan tinker --execute="
echo 'Remaining active orders: ' . App\Models\Order::whereNotIn('status', ['cancelled', 'completed'])->count();
"

echo "=== Done ==="
```

Save this as `/home/bakeandgrill/test.bakeandgrill.mv/uat-cleanup.sh` and run with `bash uat-cleanup.sh`.

---

## 6. Naming Convention for Demo Records

To distinguish UAT test data from real system data in the future:

| Data Type | Convention |
|---|---|
| Test customer names | Prefix with `[TEST]` e.g. `[TEST] Asif Moosa` |
| Test promo codes | Use `UAT-` prefix e.g. `UAT-50PCT` |
| Test gift cards | Use `GIFTUAT-` prefix |
| Test menu items (BML test category) | Already prefixed with "BML" — keep this |
| Test orders (special instructions) | Add `[UAT]` in notes field |
