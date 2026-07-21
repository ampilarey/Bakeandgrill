# Service Availability & Maintenance — Ops Runbook

This runbook covers manual response for a Bake & Grill service outage. It is written for an owner/manager or on-call engineer who needs to disable, restore, or unlock parts of the platform quickly.

The design is described in `docs/SERVICE_AVAILABILITY_MAINTENANCE_PLAN.md`. This file is the "what do I actually type" companion.

## 0. First response — quick reference

| Symptom | Where to look first |
|---|---|
| Checkout errors on customer app | Admin → Settings → Service Availability → `online_checkout` |
| BML payment failing at initiation | `online_payment` (return URL + webhook are NEVER gated) |
| Kitchen queue frozen despite active tickets | `kds_operations` — likely lockdown, `assertAvailable` 503 |
| POS refusing NEW tickets, existing settle still works | `pos_sales` or `emergency_write_lock` (env) |
| Whole marketing website 503 with branded page | `marketing_site` — flip back to Available in admin |
| Admin panel itself refuses login | This is NEVER gated. Check Sentry / server logs. |

## 1. Environments

| Env | Path | Domain |
|---|---|---|
| TEST *(default for pulls)* | `/home/bakeandgrill/test.bakeandgrill.mv` | `test.bakeandgrill.mv` |
| PRODUCTION | `/home/bakeandgrill/public_html` | `bakeandgrill.mv` |

For every manual DB fix, verify environment before running SQL.

## 2. Toggle a service from the admin panel

1. Sign in as owner or a manager with `service_availability.manage_public`.
2. Admin → Settings → Service Availability.
3. Locate the row (`online_checkout`, `online_payment`, `marketing_site`, …).
4. Click **Pause** to disable or edit the row for a scheduled window.
5. High-impact keys (POS, KDS, delivery ops, emergency master switch) require typing `EMERGENCY LOCKDOWN` to confirm.

Cache is busted automatically on every write, so the public banner and admin snapshot update within a few seconds.

### Two-step restore (SMS)

After a customer-visible outage (checkout, delivery, catering), the admin shows a **Send N SMS** button under Restore when there are queued notify-me subscribers. This is deliberately a **two-step**: Restore never auto-fires SMS; the operator must click Send N SMS. Under the hood this dispatches `SendRestorationSmsJob` for the last closed incident.

## 3. Emergency lockdown

Two ways to trigger lockdown, in order of preference:

### 3a. Admin panel (preferred — audited)

Admin → Service Availability → **Emergency lockdown** preset button. Confirm the preview then Apply. Every row is written through `ServiceAvailabilityService::setState` so the audit log has a trace and the incident lifecycle is opened.

### 3b. Env fallback (when DB / admin are down)

If the admin panel or DB is unreachable, set the env flag directly:

```bash
# On the affected environment
cd /home/bakeandgrill/public_html/backend   # or test.bakeandgrill.mv/backend
grep -q '^EMERGENCY_WRITE_LOCK=' .env \
  && sed -i 's/^EMERGENCY_WRITE_LOCK=.*/EMERGENCY_WRITE_LOCK=true/' .env \
  || echo 'EMERGENCY_WRITE_LOCK=true' >> .env
php artisan config:cache
```

Env is read at HIGHEST precedence — even if the DB flips a row back to `available`, `EMERGENCY_WRITE_LOCK=true` still blocks. This is intentional: env is the master kill switch.

Similarly, `PUBLIC_TRANSACTIONS_DISABLED=true` blocks every public service except `marketing_site` regardless of DB state.

### What is blocked vs still working

Even during emergency lockdown, the following MUST keep working:

- Existing order settle/print/receive/pickup
- Payment webhooks (BML `bmlReturn` + webhook endpoint) — customer money must always land
- Admin panel + auth (staff login, OTP request/verify, order tracking)
- Reading the KDS queue (list only — mutations blocked)
- Read-only endpoints (`/api/service-status`, opening hours, menu)

## 4. Clearing lockdown / restoring service

### 4a. Env-set lockdown

```bash
cd /home/bakeandgrill/public_html/backend   # or test.bakeandgrill.mv/backend
sed -i 's/^EMERGENCY_WRITE_LOCK=.*/EMERGENCY_WRITE_LOCK=false/' .env
sed -i 's/^PUBLIC_TRANSACTIONS_DISABLED=.*/PUBLIC_TRANSACTIONS_DISABLED=false/' .env
php artisan config:cache
php artisan queue:restart   # so listeners pick up new config
```

### 4b. DB-set lockdown

Preferred path is admin panel — Restore each row (or apply the `pause_all_online_ordering` preset in reverse by using the individual row Pause/Restore actions).

If the admin panel is unreachable but DB is up:

```sql
-- Restore ALL rows. Run in the affected env's DB.
UPDATE service_states
   SET status = 'available',
       reason_type = NULL,
       public_message = NULL,
       starts_at = NULL,
       ends_at = NULL,
       current_incident_id = NULL
 WHERE status != 'available';

-- Close any still-open incidents.
UPDATE service_incidents
   SET status = 'restored',
       restored_at = NOW()
 WHERE status = 'open';
```

Then bust the cache:

```bash
cd /home/bakeandgrill/public_html/backend
php artisan cache:forget service_availability.snapshot
```

## 5. Verify

After every restore, verify:

1. `GET /api/service-status` returns `available: true` for the keys you flipped. `curl https://bakeandgrill.mv/api/service-status | jq '.services.online_checkout'`.
2. Try a checkout on the customer app.
3. Try a POS ticket on `/pos/`.
4. Confirm the admin panel loads and the Service Availability page shows all rows green.

## 6. Restoration SMS lifecycle

Restoration SMS is one-time, incident-scoped, queued via `SendRestorationSmsJob`. Never touches marketing tables.

| Phase | What runs |
|---|---|
| Customer subscribes | `POST /api/service-status/notify-me` writes a `restoration_subscriptions` row |
| Admin restores | `POST /admin/service-availability/{key}/restore` — SMS is NOT sent yet |
| Admin clicks Send N SMS | `POST /admin/service-availability/{key}/notify` — dispatches jobs |
| Job runs | Marks sub `notified`, increments `service_incidents.notified_count` |
| 30 days later | `service-availability:prune-restoration-subscriptions` anonymises the row |

Retention is configured in `config/service_availability.php` (`restoration_retention_days`).

## 7. Scheduled maintenance windows

Set `starts_at` and `ends_at` on a `service_states` row from the admin panel. Every minute the `service-availability:activate-scheduled` command runs (see `routes/console.php`) and:

- flips `available` → `unavailable` once `starts_at` elapses
- flips back to `available` once `ends_at` elapses (never sends SMS)

Missed cron ticks are safe — the command is idempotent, matching purely on wall-clock state.

## 8. Rollback the whole feature

Set `SERVICE_AVAILABILITY_ENFORCEMENT_ENABLED=false` in `.env` and `php artisan config:cache`. Every guard becomes a no-op; the legacy 422 gate services (`OnlineOrderingGateService`, `DeliveryGateService`, `CateringOrderingGateService`) continue to work unchanged.

Use this if a Stage 5+ change is causing customer pain — you get the old behaviour back without a code deploy.
