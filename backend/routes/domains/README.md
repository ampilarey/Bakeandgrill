# Domain route fragments

`bootstrap/app.php` registers `routes/api.php` only. That file keeps public/health routes inline and `require`s fragments from this directory at positions that preserve route order (static paths before wildcards).

Multi-section domain files use `$GLOBALS['routes_sections']` (see `_helpers.php`) so the same file can be required more than once without duplicate registration.

## Loaded files

| File | Loaded from | Contents |
|------|-------------|----------|
| `auth.php` | Top-level `api.php` | Staff/customer/driver auth, customer portal |
| `staff.php` | Staff group + top-level | Session bootstrap, ops settings; admin staff/schedules/time clock/integrations |
| `devices.php` | Staff group + top-level | Device mgmt, print jobs; SSE streams |
| `orders.php` | Staff group + top-level | POS orders/refunds/tables/shifts; delivery + display |
| `kitchen.php` | Staff group + top-level | KDS, kitchen production/receiving; public wait time |
| `inventory.php` | Staff group + top-level | Stock, suppliers, purchases, purchase requests; waste logs |
| `finance.php` | Inside staff group | Invoices, expenses, finance reports, forecasting |
| `reporting.php` | Staff group + top-level | Operational reports; admin analytics |
| `marketing.php` | Staff group + top-level | SMS promotions/campaigns, promotions, referrals, gift cards |
| `catalog.php` | Staff group + top-level | Menu CRUD, variants, photos, specials, reviews; barcode labels |
| `loyalty.php` | Top-level | Customer + admin loyalty (POS twins live in `orders.php`) |
| `reservations.php` | Top-level | Public + staff reservation routes |
| `payments.php` | Top-level | BML/Stripe webhooks and online pay |
| `admin_customers.php` | Top-level | Admin CRM, credit, deposit routes |

When modularizing further:

1. Extract a section from a domain file or `api.php` into a new file here.
2. Add `require __DIR__ . '/domains/your-file.php';` in `api.php` at the correct position (set `$GLOBALS['routes_sections']` when the file has multiple sections).
3. Delete the old inline block.
4. Run `RouteSurfaceRegressionTest` and `StaffRouteMiddlewareTest`.
