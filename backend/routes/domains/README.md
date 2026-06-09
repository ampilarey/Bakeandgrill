# Domain route fragments

`bootstrap/app.php` registers `routes/api.php` only. That file `require`s fragments from this directory at positions that preserve route order (static paths before wildcards).

## Loaded files

| File | Loaded from | Contents |
|------|-------------|----------|
| `orders.php` | Inside `auth:sanctum` + `staff.token` group | POS order lifecycle, payments on ticket, receipts, refunds |
| `payments.php` | Top-level `api.php` | BML webhook + online pay, partial pay, Stripe |
| `admin_customers.php` | Top-level `api.php` | Admin CRM, credit, deposit routes |
| `finance.php` | Inside `auth:sanctum` + `staff.token` group | Invoices, expenses, finance reports, purchases, inventory |

When modularizing further:

1. Extract a section from `api.php` into a new file here.
2. Add `require __DIR__ . '/domains/your-file.php';` in `api.php` at the correct position.
3. Delete the old inline block from `api.php`.
4. Run `RouteSurfaceRegressionTest` and `StaffRouteMiddlewareTest`.
