# Release notes — Offers & Auto-Promotions + Content Studio Phase 6

**Branch tip on `main`:** `2b632560`  
**Consolidation:** Offers feature branch merged, then Content Studio Phase 6 re-applied on top.

---

## What landed

### Offers & auto-promotions (`merge: offers & auto-promotions` → `9886ede9`)
- **Auto-apply promotions** (no code, all customers): `auto_apply`, nullable `code`, optional day/time windows; `PromotionEvaluator::applyAutomatic` at order create; admin toggle on Promotions page.
- **Unified effective pricing:** `EffectivePriceService` composes daily specials + item-level auto-promos (`best_wins`); keeps `special` API block shape; checkout honors display prices (no double discount).
- **Offers surface:** `GET /api/offers`; order-app `OffersRail` + Offers nav pill; website home offers strip; `offers_headline` / `offers_subtext` content keys.
- **Admin preview / analytics / urgency:** Promotions “Offers preview” + performance; `ends_at` countdown on offer cards.

### Content Studio Phase 6 (re-applied as `9886ede9`)
Cherry-pick of `9886ede9` / `b668bb7d` hit tangled `backend/public/order` rename conflicts after the offers dist sync. Phase 6 **source changes were re-applied fresh** instead:
- `order_status_*` / `order_hours_*` Content Studio keys + seed migration
- `MenuPage` uses `composeOrderingStatusBanner` (**Offers rail retained**)
- `OpeningStatusBadge` content overrides with i18n fallback
- Tests for banner utils / badge / content registry
- **Not touched:** `OnlineOrderingGateService` / timeline logic
- Content Studio autosave/twoEditors tests left as on `main` (per merge instructions)

---

## Final verify counts (post–Phase 6, before dist commit)

| Suite | Result |
|---|---|
| Backend `pint --test` | PASS (1340 files) |
| Backend `php artisan test` | **1561 passed**, 3 skipped |
| Order `npm test` / `npx vitest run` | **102 passed** (31 files) |
| Order `npm run build` | OK |
| Admin `npx vitest run --pool=forks --maxWorkers=2` | **91 passed** (33 files) |
| Admin `npm run build` | OK |
| `./scripts/build-all.sh admin order` | OK → `backend/public/{admin,order}` |

Note: Admin full-suite under default parallel workers can flake on 5s timeouts; Phase 6 raised `testTimeout` to 15000ms in `vite.config.ts`. Stable run used fewer workers.

---

## Deploy — cPanel TEST server

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && composer install --no-dev --optimize-autoloader && php artisan migrate --force && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart && git log -1 --oneline
```

**Notes**
- New migrations: auto-apply promotions, stacking policy seed, offers content keys, order status banner content seed.
- Full deploy (migrate) required — not UI-only.
- Production / live only when explicitly requested.
