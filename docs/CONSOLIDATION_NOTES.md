# Consolidation notes — 2026-07-23

Started from `main` @ `ede01f1f` (`admin: improve Content Studio mobile layout`). Worked directly on `main` (no PRs).

## Merged

### 1. `claude/item-media-staff-vs-customer` → `27be5c4b`

Customer order surfaces use **gallery-only** media (`item_photos`); main `image_url`/`thumb_url` remains the staff/POS thumbnail; empty gallery falls back to main image. POS/KDS untouched.

- Merge: clean (`ort`), no conflicts.
- Touched sources: `itemMedia.ts`, `ProductCard.tsx`, `ItemSheet.tsx`, `itemMedia.test.ts`, order dist, plan doc.

### 2. `claude/procurement-phase-3-plan` → `d490f5db`

Preserved all three Phase 3 features:

1. Multi-quote / cheapest-pick on purchase-request lines (`purchase_request_item_quotes`)
2. Procurement analytics report (`GET /api/reports/procurement` + admin `ProcurementReportPage`)
3. Wastage-aware reorder via `RestockIntelligenceService` (off by default, clamped)

- **Source:** no conflicts; all Phase 3 PHP/TS/tests staged cleanly.
- **Built dist:** many rename/rename conflicts under `backend/public/admin/assets/*` + `index.html`. Per instructions, did **not** hand-merge minified assets — reset `backend/public/admin` to pre-merge `HEAD`, completed the merge, then rebuilt in Task 4.

## Flaky-test fix

`Wave8ReportsTest::test_shift_variances_report` — near UTC midnight, Maldives (`UTC+5`) could put the seeded shift and `from=now()&to=now()` on different calendar days → zero rows → null variance.

**Fix:** wrap body in `Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00'))` with `finally { Carbon::setTestNow(null); }`. Kept `-5` assertion. Passed 5 consecutive runs.

## Rebuild (Task 4)

```bash
./scripts/build-all.sh admin order
```

Committed regenerated `backend/public/{admin,order}` with Wave8 fix as `2a28e7ce`.

## Migrations

New migrations (apply on deploy):

- `2026_07_22_230000_create_purchase_request_item_quotes_table.php`
- `2026_07_22_231000_seed_procurement_phase3_restock_settings.php`

Local `php artisan migrate` could not reach Postgres (`127.0.0.1:5432` refused). Confirmed schema via PHPUnit `RefreshDatabase` under `tests/Feature/Procurement/*` (all 29 passed, including MultiQuote / Analytics / WasteAwareReorder).

## Final test counts

| Suite | Result |
|---|---|
| Backend `pint` + `php artisan test` | **1524 passed**, 3 skipped, 0 failed (5835 assertions) |
| Backend `tests/Feature/Procurement/*` | **29 passed** (P1+P2+P3) |
| `apps/online-order-web` vitest | **86 passed** / 25 files (includes itemMedia) |
| `apps/online-order-web` build | OK |
| `apps/admin-dashboard` vitest | **75 passed** / 28 files (clean re-run) |
| `apps/admin-dashboard` build | OK |

### Admin vitest note (non-blocking)

First admin run (parallel with full backend + order suites) had 4× 5s timeouts in ContentStudio / Layout / OrdersPage. Re-run alone: all 75 green. Treated as machine load flake, not merge regressions. Content Studio editor timeouts remain a known intermittent under contention.

## Tip after push

`main` @ `5733e414` (notes `e2645f32`, Wave8+dist `2a28e7ce`, merges `d490f5db` / `27be5c4b`). Follow-up `5733e414` is pint-only from the verify run.
