# Kitchen Production & Receiving

Auditable handover layer between kitchen (KDS) and counter (POS). Kitchen staff record what was made; cashiers record what was received; managers review variance.

## Workflow

1. **Kitchen (KDS)** — Mark items cooked per line, or use **Kitchen done** to mark all lines produced. Prepared-stock batches can be submitted from the Production tab.
2. **POS** — Open **Kitchen receive** drawer; accept batches (full or partial). Order-bound batches update `kitchen_handover_status` and set `pos_received_at` when fully received.
3. **Cashier** — **Mark ready** is blocked while `kitchen_require_pos_receiving_before_ready` is enabled and the order is not received.
4. **Admin** — `/kitchen-production` — live handover, batches, variances, reports, settings.

## Safety boundaries (unchanged)

- Kitchen endpoints do **not** change order status, payment, GST, or send customer SMS.
- Receiving does **not** mutate order totals or tax fields.
- Customer **Mark ready** remains cashier-owned via `POST /orders/{id}/mark-ready`.

## Site settings

| Key | Default | Effect |
|-----|---------|--------|
| `kitchen_require_pos_receiving_before_ready` | true | 422 on mark-ready until POS receive |
| `kitchen_receive_updates_prepared_stock` | true | Increase menu prepared stock on receive |
| `kitchen_manager_verification_for_prepared_stock` | false | Hold stock until manager verifies |
| `kitchen_allow_staff_prepared_stock_batches` | true | KDS prepared-stock form |
| `kitchen_photo_required_for_reject_waste` | false | Require photo on reject/waste |
| `kitchen_production_consumes_recipe_stock` | false | Deduct raw inventory on prepared-stock submit |

## Permissions (group: Kitchen Production)

- `kitchen.production.*` — kitchen staff (create, submit, view own, waste, remake)
- `kitchen.receiving.*` — counter staff (view, receive, reject, request remake)
- `kitchen.production.view_all`, `kitchen.production.manage`, `kitchen.production.reports` — managers
- `kitchen.variance.review` — manager variance review

## Deploy

Requires **full migrate** (new tables, order columns, site_settings seed, permission sync):

```bash
cd backend && php artisan migrate --force
```

Rebuild frontends: `./scripts/build-all.sh admin pos kds`

## Key API routes

- `POST /kds/orders/{orderId}/items/{orderItemId}/cooked`
- `GET /kitchen-receiving/pending`
- `POST /kitchen-receiving/{batchId}/receive-all`
- `PUT /kitchen-handover/settings` (manager)
- `GET /kitchen-reports/*`
