# Purchase Requests / Buying Tasks

Operational workflow for staff to request items without touching stock, expenses, or GST directly.

## Flow

1. **Staff** (POS/KDS/admin) creates a request → status `requested`
2. **Manager** approves, optionally edits qty, assigns a buyer → `approved` → `assigned`
3. **Assigned buyer** marks items bought / partial / not available (with qty, cost, shop, receipt photo) → `buying` / `partially_bought` / `bought_pending_verification`
4. **Manager** verifies received → stock-in when `inventory_item_id` is linked → `received` / `closed`
5. Optional: **convert to draft PO** or **pending expense** (manager only)

Mark-bought paths **never** create `stock_movements`, purchases, or expenses. Only `verify-received` / `verify-all` may update inventory.

## Permissions

| Slug | Role default |
|------|----------------|
| `purchase_requests.create` | staff, kitchen_staff |
| `purchase_requests.view_own` | staff, kitchen_staff |
| `purchase_requests.buy` | staff, kitchen_staff (assignment enforced in code) |
| `purchase_requests.view_all` | manager |
| `purchase_requests.approve` … `convert_to_expense` | manager |

Owner bypasses all checks.

## Deploy

Run migrations and permission sync on deploy:

```bash
php artisan migrate --force
```

Migration `2026_05_31_100100_sync_purchase_request_permissions.php` calls `PermissionCatalogSync::sync()`.

## UI entry points

- **Admin:** Menu & Inventory → Purchase Requests (`/purchase-requests`)
- **POS:** Side drawer → Request items / My requests / Buying list
- **KDS:** Header buttons for same flows

## Ops alerts

Owner dashboard inbox includes counts for pending approval, bought-pending-verification, and overdue (`needed_by`).
