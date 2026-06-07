# Modular Monolith Implementation Report

**Date:** 2026-05-22  
**Scope:** Phases 1–10 of the modular monolith refactor plan (audit through deposits, payment orchestration, route modularization, domain service moves).

---

## Summary

The backend is now a **hybrid modular monolith**: domain-owned services live under `backend/app/Domains/*` with compatibility wrappers in legacy `app/Services/` where needed. API URLs and response contracts are unchanged. A full **prepaid Deposits** feature (`wallet` tender) ships alongside the extracted **Credit** domain.

---

## Documentation delivered

| File | Purpose |
|------|---------|
| `docs/MODULARIZATION_AUDIT.md` | Code-derived audit (controllers, models, duplication risks, frontend contracts) |
| `docs/MODULAR_ARCHITECTURE.md` | Target domain tree, dependency rules, migration waves |
| `docs/MODULARIZATION_IMPLEMENTATION_REPORT.md` | This report |

---

## Domain modules created or extended

### Credit (`Domains/Credit/`)

- `CreditEligibilityService` — limits, status, `canCharge` / `assertCanCharge`
- `CreditLedgerService` — approve, charge, repay, refund reversal
- `CustomerCreditService` — facade preserving the original public API
- `ReverseCreditOnRefundListener` — moved from `Domains/Customers/`
- `CreditServiceProvider` — DI bindings + deprecated alias

**Compatibility:** `App\Domains\Customers\Services\CustomerCreditService` extends the Credit facade.

### Deposits (`Domains/Deposits/`) — **new feature**

- Migrations: `customer_deposit_accounts`, `customer_deposit_ledger`
- Models: `CustomerDepositAccount`, `CustomerDepositLedger`
- `DepositEligibilityService`, `DepositLedgerService`, `CustomerDepositService`
- `CustomerDepositController` — admin top-up, adjust, status
- Customer API: `GET /api/customer/deposit`
- POS: `wallet` tender wired in `SettleOrderPaymentAction`
- Permissions: `customers.deposit.manage`, `customers.deposit.adjust`, `payments.wallet`
- Tests: `tests/Feature/Deposits/DepositsTest.php` (8 cases)

### Payments orchestration

- `PaymentAllocationService` — tender permissions, credit/deposit validation, tender caps
- `SettleOrderPaymentAction` — single entry for `OrderController::addPayments` transaction body
- BML webhook / `VerifyBmlSignature` **unchanged**

### Permissions & Shifts (Wave 1–2)

- `PermissionService` → `Domains/Permissions/Services/`
- `ShiftAccessService` → `Domains/Shifts/Services/`
- `ShiftCashMovementTest` added

### Service moves (Waves 8+)

| Service | New location | Legacy wrapper |
|---------|--------------|----------------|
| `OrderCreationService` | `Domains/Orders/Services/` | `app/Services/OrderCreationService.php` |
| `PrintJobService` | `Domains/Printing/Services/` | `app/Services/PrintJobService.php` |
| `InventoryDeductionService` | `Domains/Inventory/Services/` | `app/Services/InventoryDeductionService.php` |

---

## Routes

- `routes/domains/finance.php` — former `api_finance.php` content
- `routes/domains/*.php` — extracted sections (`public_and_auth`, `staff`, `customers`, `remainder`) used to build `api.php`
- `routes/api.php` — monolithic loader with shared `use` imports (required for PHP `use` scope); includes `require domains/finance.php` inside the staff group
- `routes/api_finance.php` — deprecated shim → `domains/finance.php`

**Note:** Route files split under `routes/domains/` must either use fully-qualified class names or duplicate `use` blocks when loaded via `require` from a thin `api.php`. The production `api.php` inlines the split files to preserve imports.

---

## Service providers registered

`bootstrap/providers.php` now includes:

- `PermissionsServiceProvider`
- `ShiftsServiceProvider`
- `CreditServiceProvider`
- `DepositsServiceProvider`
- `PrintingServiceProvider`

(Plus existing Orders, Payments, Loyalty, Inventory, Promotions, Reservations providers.)

---

## Tests run (passing)

```
CustomerCreditTest          19 passed
DepositsTest                 8 passed
ShiftCashMovementTest        3 passed
OrderStatusMachineTest      10 passed (1 skipped)
PartialPaymentTest           7 passed
```

Frontend: `./scripts/build-all.sh admin pos kds order delivery` — all five apps built and deployed to `backend/public/*`.

---

## Remaining risks / next waves

| Item | Risk | Recommendation |
|------|------|----------------|
| `OrderStatusMachine` (legacy) vs `Domains/Orders/StateMachine/OrderStateMachine` | Drift | Unify behind parity tests before switching production path |
| `OrderController` (~1600 lines) | High touch area | Continue extracting actions; keep `SettleOrderPaymentAction` pattern |
| Models in `app/Models/` | No domain ownership yet | Wave 4+ optional moves with `class_alias` stubs |
| Domain route files via `require` only | `use` imports don't inherit | Use FQCN in domain route files OR keep merged `api.php` |
| KDS / BML / print-proxy | Production critical | No changes this wave; add `KdsPrintTicketTest`, `BmlInitiateContractTest` before moves |
| Admin deposit UI | Backend-only | Add admin customer panel slice when ready (API routes exist) |

---

## Files not modified (per plan)

- `BmlConnectService`, `BmlWebhookController`, `VerifyBmlSignature`
- `print-proxy/` standalone service
- Domain event map structure in `DomainEventServiceProvider` (listener import updated for Credit only)
