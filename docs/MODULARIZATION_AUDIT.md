# Bake & Grill — Modularization Audit

**Generated from live codebase inspection.** Do not treat older docs in `docs/` as source of truth.

**Date:** 2026-05-22  
**Backend:** Laravel 12, PHP 8.2, `backend/`

---

## 1. Executive summary

| Layer | Location | Count | Modularized? |
|-------|----------|-------|--------------|
| Domain modules | `app/Domains/*` | 30 folders, **184** PHP files | Partial |
| Eloquent models | `app/Models/` | **108** | No (0 in domains) |
| HTTP controllers | `app/Http/Controllers/` | **121** (120 concrete) | No |
| Legacy services | `app/Services/` | **33** | Partial overlap |
| Gate policies | `app/Policies/` | **8** ability classes | No |
| API routes | `routes/api.php` + `api_finance.php` | **~160** HTTP endpoints | Monolithic files |
| Domain service providers | `bootstrap/providers.php` | **6** registered | Partial |
| PHPUnit tests | `backend/tests/` | **~810** methods | Good breadth, gaps below |

The project is a **hybrid modular monolith**: newer flows use `Domains/*` (events, listeners, repositories, gateways), but **all HTTP entry points and all Eloquent models remain in classic Laravel layout**.

---

## 2. Current domain modules (`app/Domains/`)

| Domain | Files | Maturity | Notes |
|--------|-------|----------|-------|
| **Accounting** | 2 | Low | Xero OAuth/sync |
| **Auth** | 0 | Scaffold | Empty `Actions/`, `Services/` |
| **Catalog** | 0 | Scaffold | Empty; merge target → Menu |
| **Customers** | 10 | Medium | Analytics, segmentation, **credit** (should move → Credit) |
| **Delivery** | 3 | Low | Fee calculator, settings DTO |
| **Gst** | 19 | **High** | Calculator, ledger, reports, listeners |
| **Inventory** | 10 | **High** | Events, deduct/restore listeners, ItemRepository |
| **Kitchen** | 2 | Low | Menu resolver, handover settings |
| **KitchenDisplay** | 1 | Medium | `KitchenTicketStateMachine` |
| **Loyalty** | 15 | **High** | Points, tiers, holds, 4 repo bindings |
| **Marketing** | 5 | Medium | Specials sold-count, referrals, automation |
| **Menu** | 1 | Low | `ComboCompositionService` only |
| **Notifications** | 17 | **High** | SMS, push, payment/order SMS listeners |
| **Operations** | 1 | Low | Ops alerts |
| **Ordering** | 1 | Low | Pickup slots |
| **Orders** | 24 | **High** | Events, DTOs, calculators, `OrderRepository` |
| **Payments** | 13 | **High** | BML/Stripe gateways, state machine, repo |
| **Permissions** | 2 | Medium | `PermissionCatalog`, sync helper |
| **PrayerTimes** | 8 | Medium | Only domain with **Actions** (3) |
| **Printing** | 3 | Medium | Kitchen/receipt print listeners, print state machine |
| **Promotions** | 8 | **High** | Evaluator, redemption repos |
| **Realtime** | 6 | Medium | Redis SSE, KDS/order stream providers |
| **Receipts** | 0 | Scaffold | Empty |
| **Reporting** | 2 | Medium | `ReportsService`, SQL helpers |
| **Reservations** | 8 | Medium | CRUD service, repo, events |
| **Shared** | 3 | Medium | `Money`, `StateMachine` base, exceptions |
| **Shifts** | 5 | Medium | Open/close events, `ShiftStateMachine` |
| **Sms** | 10 | Medium | Staff routing, templates, scheduled jobs |
| **System** | 2 | Low | Health, scheduler tracker |
| **Webhooks** | 3 | Medium | Dispatch service, job, listener |

**Missing vs target architecture:** `Credit/`, `Deposits/`, `Staff/`, `PublicWebsite/`, domain `Controllers/` (0 files).

---

## 3. Duplicated / divergent logic

| Concern | Production path | Domain / alternate | Risk |
|---------|-----------------|-------------------|------|
| Order status transitions | `app/Services/OrderStatusMachine.php` | `Domains/Orders/StateMachine/OrderStateMachine.php` | Domain SM **unused** in prod; tests only |
| Order creation | `app/Services/OrderCreationService.php` | `Domains/Orders/*` calculators/DTOs | Split brain |
| Order settlement / payments | `OrderController::addPayments` | `Domains/Payments/Services/PaymentService.php` | Large controller block |
| Inventory deduction | `app/Services/InventoryDeductionService.php` | `Domains/Inventory/Listeners/DeductInventoryListener.php` | Both active via events + direct calls |
| Permission resolution | `app/Services/PermissionService.php` | `Domains/Permissions/PermissionCatalog.php` | Catalog in domain; service in app/ |
| SMS sending | `Domains/Notifications/Services/SmsService.php` | `Domains/Sms/*` | Overlapping staff vs customer SMS |
| Printing | `PrintJobService`, `PrintProxyService` | `Domains/Printing/Listeners/*` | Jobs created in app layer |
| Special pricing | `app/Services/SpecialPricingService.php` | `Domains/Promotions/*` | Menu pricing split |

---

## 4. Controller → domain map

All **120** concrete controllers live under `app/Http/Controllers/`. None in `Domains/*/Controllers/`.

### Orders & POS (18)
`OrderController`, `TableController`, `ReceiptController`, `RefundController`, `PosBootstrapController`, `PosMenuController`, `PosAdminController`, `PosOfflineSyncController`, `OfflineSyncController`, `CustomerDisplayController`, `WaitTimeController`, `OrderingEligibilityController`, `CheckoutFeesPreviewController`, `PickupSlotController`, `PreOrderApiController`, `ReceiptPageController`, `PosPayPageController`, `OrderTrackPageController`

### KDS & Kitchen (9)
`KdsController`, `KitchenProductionController`, `KitchenProductionReportController`, `KitchenReceivingController`, `KitchenVarianceController`, `KitchenMenuAdminController`, `PreparedStockController`, `WasteLogController`, `PrintJobController`

### Payments (6)
`PaymentController`, `BmlWebhookController`, `StripeController`, `PaymentCommissionSettingsController`, `ServiceChargeSettingsController`, `PackagingFeeSettingsController`

### Shifts & time (3)
`ShiftController`, `CashMovementController`, `TimeClockController`

### Menu / catalog (8)
`CategoryController`, `ItemController`, `VariantController`, `ItemPhotoController`, `DailySpecialController`, `ItemRecommendationsController`, `ImageUploadController`, `MenuAdminController`

### Inventory & purchasing (7)
`InventoryController`, `InventoryConfigController`, `SupplierController`, `SupplierIntelligenceController`, `PurchaseController`, `PurchaseWorkflowController`, `PurchaseRequestController`

### Customers & CRM (11)
`CustomerController`, `AdminCustomerController`, `AdminCustomerGrowthController`, `CustomerAddressController`, `CustomerCartController`, `CustomerProfileController`, `CustomerCreditController`, `FavoritesController`, `ReviewController`, `CorporateInquiryController`, `CustomerPortalController`

### Loyalty & marketing (6)
`LoyaltyController`, `PromotionController`, `GiftCardController`, `ReferralController`, `AdminMarketingAutomationController`, `ItemPairAdminController`

### SMS & notifications (9)
`SmsCampaignController`, `SmsPromotionController`, `SmsContactController`, `SmsContactGroupController`, `SmsTemplateController`, `SmsScheduledMessageController`, `StaffNotificationLogController`, `StaffNotificationPrefController`, `PushSubscriptionController`

### Delivery & drivers (9)
`DeliveryOrderController`, `DeliveryDriverController`, `DeliverySettingsController`, `DeliveryFeePreviewController`, `DeliveryStatusController`, `DriverAuthController`, `DriverDeliveryController`, `DriverLocationController`, `DriverProofController`

### Finance, GST, accounting (9)
`InvoiceController`, `ExpenseController`, `FinanceReportController`, `ForecastController`, `GstBootstrapController`, `GstSettingsController`, `GstReportController`, `XeroController`, `InvoicePageController`

### Reports & system (6)
`ReportsController`, `AnalyticsController`, `AuditLogController`, `SiteSettingsController`, `OnlineOrderingController`, `OpeningHoursController`, `OpsAlertsController`, `SystemHealthController`, `WebhookSubscriptionController`, `StreamController`

### Staff, auth, permissions (8)
`StaffController`, `ScheduleController`, `PermissionController`, `RolePermissionController`, `Auth/StaffAuthController`, `Auth/CustomerAuthController`, `Auth/DeviceController`, `Prayer/*` (3)

### Web / CMS (4)
`HomeController`, `PreOrderController`, `ImageThumbController`, `PrayerTimesWebController`

---

## 5. Model → domain map (108 models in `app/Models/`)

Models stay in `app/Models/` during waves 1–3. Logical ownership:

| Domain | Models |
|--------|--------|
| **Auth / Staff** | `User`, `Role`, `Permission`, `Device`, `StaffSchedule`, `TimePunch`, `OtpVerification` |
| **Customers** | `Customer`, `CustomerAddress`, `CustomerTag`, `CustomerTagAssignment`, `CustomerFollowUpNote`, `AbandonedCart` |
| **Credit** | `CustomerCreditLedger` (+ credit columns on `Customer`) |
| **Deposits** | *(none yet — greenfield)* |
| **Orders** | `Order`, `OrderItem`, `OrderItemModifier`, `OrderPromotion`, `PreOrder`, `OfflineSyncRecord`, `RestaurantTable`, `Receipt`, `ReceiptFeedback` |
| **Payments** | `Payment`, `Refund`, `GiftCard`, `GiftCardTransaction` |
| **Shifts** | `Shift`, `CashMovement` |
| **Menu** | `Category`, `Item`, `Variant`, `Modifier`, `ItemPhoto`, `ComboItem`, `MenuGroup`, `DailySpecial`, `DailySpecialVariant`, `ItemChannelAvailability`, `ItemPairStat` |
| **Inventory** | `InventoryItem`, `InventoryCategory`, `StockMovement`, `UnitConversion`, `Recipe`, `RecipeItem`, `WasteLog`, `LowStockAlert`, `KitchenProduction*`, `KitchenReceiving*`, `KitchenMenuState`, `PreparedStock` (if separate) |
| **Purchasing** | `Purchase`, `PurchaseItem`, `PurchaseReceipt`, `PurchaseRequest`, `PurchaseRequestItem`, `PurchaseRequestAttachment`, `Supplier`, `SupplierRating`, `SupplierPerformanceCache`, `SupplierPriceHistory` |
| **Loyalty** | `LoyaltyAccount`, `LoyaltyLedger`, `LoyaltyHold`, `LoyaltyTier` |
| **Promotions** | `Promotion`, `PromotionTarget`, `PromotionRedemption` |
| **Delivery** | `DeliveryDriver`, `DriverLocation` |
| **Reservations** | `Reservation`, `ReservationSetting` |
| **Sms / Notifications** | `SmsLog`, `SmsCampaign`, `SmsCampaignRecipient`, `SmsContact`, `SmsContactGroup`, `SmsPromotion`, `SmsPromotionRecipient`, `SmsScheduledMessage`, `SmsTemplate`, `StaffNotificationLog`, `StaffNotificationPref`, `PushSubscription` |
| **Printing** | `PrintJob`, `Printer` |
| **Finance** | `Invoice`, `InvoiceItem`, `Expense`, `ExpenseCategory` |
| **Gst** | `GstSetting`, `GstPeriodLock`, `TaxLedgerEntry` |
| **Accounting** | `XeroConnection`, `XeroSyncLog` |
| **Marketing** | `Referral`, `ReferralCode`, `CorporateInquiry`, `Review` |
| **PublicWebsite** | `SiteSetting` |
| **System** | `AuditLog`, `WebhookSubscription`, `WebhookLog`, `Store` |

---

## 6. Service → domain map

### `app/Services/` (33) — migration targets

| Service | Target domain |
|---------|---------------|
| `PermissionService` | **Permissions** |
| `OrderCreationService`, `OrderStatusMachine`, `OrderOfflineSettlementService` | **Orders** |
| `CustomerAccountService`, `CustomerAddressService` | **Customers** |
| `InventoryDeductionService`, `StockManagementService`, `StockReservationService`, `ItemAvailabilityService` | **Inventory** |
| `KitchenProductionService`, `KitchenReceivingService`, `KitchenVarianceService`, `KitchenProductionBatchNumberGenerator` | **Kitchen** |
| `PrintJobService`, `PrintProxyService` | **Printing** |
| `PosMenuBuilder`, `SpecialPricingService`, `SpecialPriceResult`, `VariantSyncService` | **Menu** |
| `ShiftAccessService` | **Shifts** |
| `OpeningHoursService`, `OnlineOrderingGateService`, `DeliveryGateService` | **PublicWebsite** / **Delivery** |
| `OfflineOrderSyncService`, `OfflineOrderRewardsService` | **Orders** |
| `LoyaltySettingsService` | **Loyalty** |
| `PurchaseRequestService`, `PurchaseRequestVerificationService`, `PurchaseRequestNumberGenerator` | **Inventory** |
| `RecipeCostCalculator` | **Inventory** / **Menu** |
| `AdminMaintenanceService`, `AuditLogService` | **System** |

### `Domains/*/Services/` (already modular)
Payments, Orders (calculators), Gst, Loyalty, Notifications, Customers (incl. credit), Reporting, Delivery, Promotions, Reservations, Sms, System, Operations, Marketing, Menu (combo), Kitchen, Ordering, Accounting, Webhooks, Realtime.

---

## 7. Cross-domain dependencies (high-risk)

```
OrderController
  → OrderCreationService, OrderStatusMachine
  → CustomerCreditService (Customers)
  → PaymentService, BmlConnectService (Payments)
  → ShiftAccessService, PermissionService
  → InventoryDeductionService

CustomerCreditService (Customers)
  → InvoiceController (HTTP coupling — anti-pattern)
  → ShiftAccessService, AuditLogService
  → CashMovement, Payment, Order models

DomainEventServiceProvider
  → 20+ listeners across Inventory, Loyalty, Gst, Notifications, Printing, Webhooks, Realtime

PaymentConfirmedListener
  → GST, SMS, loyalty side effects
```

**Rule for refactor:** replace controller→controller calls with domain services or events.

---

## 8. Risky files — do not move without tests + compat layer

| File | Why |
|------|-----|
| `Http/Controllers/Api/OrderController.php` | ~1600+ lines; payments, credit, void, KDS fire |
| `Http/Controllers/Api/BmlWebhookController.php` | Production payment webhook |
| `Http/Controllers/Api/PaymentController.php` | BML initiate, partial pay |
| `Http/Requests/StoreOrderPaymentsRequest.php` | Tender validation contract |
| `Providers/Domains/DomainEventServiceProvider.php` | Central listener map |
| `Http/Middleware/VerifyBmlSignature.php` | BML security |
| `Domains/Payments/Gateway/BmlConnectService.php` | Gateway integration |
| `Services/OrderStatusMachine.php` | Live order transitions (KDS, POS) |
| `Services/OfflineOrderSyncService.php` | Blocked payment methods list |

---

## 9. API routes per frontend app

### Shared contract
`packages/shared/src/api/endpoints.{public,customer,staff}.ts` — partial adoption (KDS, online-order); POS and admin duplicate strings locally.

### `admin-dashboard` (`apps/admin-dashboard/src/api/`)
- Auth: `/auth/staff/*`, `/auth/me`
- Operations: `/orders`, `/kds/orders/*`, `/delivery/*`, `/shifts/*`, `/time-clock/*`, `/devices/*`, `/tables/*`, `/print-jobs/*`
- Kitchen: `/kitchen-*`, `/purchase-requests/*`
- Admin: `/admin/*` (customers, credit, loyalty, SMS, GST, staff, reservations, promotions)
- Finance: `/invoices/*`, `/expenses/*`, `/reports/*`, `/forecasts/*`, `/xero/*`
- CMS: `/site-settings`, `/ordering/*`

### `pos-web` (`apps/pos-web/src/api.ts`)
- `/auth/staff/pin-login`, `/pos/bootstrap`, `/pos/menu`, `/pos/offline-sync`
- `/orders`, `/orders/{id}/*` (hold, resume, payments, merge, kitchen-fire)
- `/shifts/*`, `/time-clock/*`, `/customers/*`
- `/kitchen-handover/*`, `/kitchen-receiving/*`, `/purchase-requests/*`
- `/payments` via `POST /orders/{id}/payments` (cash, card, house_account, wallet stub)

### `kds-web` (`apps/kds-web/src/api.ts`)
- `/kds/orders`, bump/recall/kitchen-done/print-ticket
- `/kitchen-production/*`, `/purchase-requests/*`

### `online-order-web` (`apps/online-order-web/src/api/`)
- `/auth/customer/*`, `/customer/orders`, `/orders/delivery`
- `/orders/{id}/pay/bml`, `/payments/online/initiate-partial`
- `/customer/credit`, `/loyalty/*`, `/promotions/validate`

### `delivery-web` (`apps/delivery-web/src/api.ts`)
- `/auth/driver/pin-login`, `/driver/deliveries/*`, `/driver/location`

### `print-proxy` (server-side only)
- Laravel → `POST /print` on Node proxy; not called by frontends directly.

**API URL freeze:** all paths above must remain stable through modularization.

---

## 10. Test coverage gaps

| Area | Existing | Gap |
|------|----------|-----|
| POS login | `StaffAuthTest`, `PosPermissionResolutionTest` | Device self-register approval |
| Shifts | Used as test setup only | **`POST /shifts/{id}/cash-movements` untested** |
| Orders | Strong (`OrderFlowTest`, `OrderStatusMachineTest`, contracts) | Merge/split edge cases |
| KDS | `KdsBumpEventsTest` | print-ticket, menu-groups, SSE stream |
| BML | Return URL, webhook, signature unit test | Initiate response contract test |
| Credit | `CustomerCreditTest` (19) | POS + BML + credit mix |
| **Deposits / wallet** | None | **Greenfield** |
| Printing | `PrintPayloadContractTest` | `/print-jobs` API, proxy integration |
| SMS | Broad module tests | POS promotion send E2E |

**PHPUnit scale:** ~135 files, ~810 test methods. **E2E:** `e2e/` Playwright (POS, KDS, checkout, admin, delivery).

---

## 11. Credit vs deposits (current state)

| | Credit | Deposits |
|---|--------|----------|
| **Exists?** | Yes | **No** |
| **Location** | `Domains/Customers/Services/CustomerCreditService.php` | — |
| **Payment method** | `house_account` | `wallet` validated but blocked in offline sync |
| **Ledger** | `customer_credit_ledger` | — |
| **Tests** | 19 feature tests | — |
| **Business rule** | Customer owes B&G; approval required | Customer prepaid balance (planned) |

---

## 12. Proposed final structure & migration waves

See [`MODULAR_ARCHITECTURE.md`](MODULAR_ARCHITECTURE.md) for target tree and dependency rules.

**Wave order (safe):**
1. Shared + Permissions  
2. Auth + Staff  
3. Customers  
4. **Credit** (extract from Customers)  
5. **Deposits** (new feature + domain)  
6. Payments orchestration (no BML changes)  
7. Orders (defer OrderStateMachine swap)  
8. Shifts, Menu, Inventory, Kitchen/KDS, Delivery, Printing, SMS, Reporting, PublicWebsite  
9. Domain route file split  
10. Optional model moves with aliases  

**Registered domain providers today:** Orders, Payments, Loyalty, Inventory, Promotions, Reservations (+ `DomainEventServiceProvider`).

---

## 13. References (live code paths)

- Routes: `backend/routes/api.php`, `backend/routes/api_finance.php`, `backend/routes/web.php`
- Event map: `backend/app/Providers/Domains/DomainEventServiceProvider.php`
- Provider registration: `backend/bootstrap/providers.php`
- Permissions: `backend/app/Services/PermissionService.php`, `backend/app/Domains/Permissions/PermissionCatalog.php`
- Credit: `backend/app/Domains/Customers/Services/CustomerCreditService.php`
- Payments: `backend/app/Domains/Payments/`
