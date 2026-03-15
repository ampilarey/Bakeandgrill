# Bake & Grill — Implementation Progress

## Status Legend
- ✅ Complete and deployed
- 🔄 In progress / partially done
- ⏳ Planned / not started

---

## Phase 1 — Core POS Backend ✅

| Feature | Status | Notes |
|---|---|---|
| Orders (dine-in, takeaway, online_pickup) | ✅ | Full CRUD + status machine |
| Payments (cash / card / mixed) | ✅ | `StoreOrderPaymentsRequest` |
| KDS (Kitchen Display) | ✅ | start / bump / recall endpoints |
| Printing (kitchen + receipt) | ✅ | Async via `PrintProxyService` |
| Inventory management | ✅ | Stock tracking + low-stock alerts |
| Shifts (open/close cash register) | ✅ | `ShiftController` |
| Customer auth (OTP via SMS) | ✅ | Sanctum customer tokens |
| Staff auth (PIN + roles) | ✅ | Role-based access |

---

## Phase 2 — Modular Monolith Refactor ✅

| Feature | Status | Notes |
|---|---|---|
| `app/Domains/` structure | ✅ | Orders, Payments, Printing, Inventory, Promotions, Loyalty, Realtime, Delivery, Shared |
| State machines | ✅ | Order, Payment, PrintJob, Shift, KitchenTicket |
| After-commit events | ✅ | `DB::afterCommit()` + `ShouldQueue` listeners |
| Idempotency keys | ✅ | `print_jobs`, `stock_movements`, `webhook_logs`, `loyalty_ledger`, `loyalty_holds`, `promotion_redemptions`, `order_promotions` |
| `Money` value object | ✅ | Integer laari, `floor()` rounding |

---

## Phase 3 — BML Payment Gateway ✅

| Feature | Status | Notes |
|---|---|---|
| `BmlConnectService` | ✅ | Amount in laari, `normalizeLocalId`, HMAC-SHA256 webhook verification |
| `PaymentService` | ✅ | Initiate full + partial BML payments |
| `BmlWebhookController` | ✅ | Idempotent webhook log + processing |
| `VerifyBmlSignature` middleware | ✅ | `hash_equals` timing-safe comparison |
| Partial / split payments | ✅ | `POST /api/payments/online/initiate-partial` |
| Multi-partial → order paid logic | ✅ | `paidTotal >= order.total` in webhook handler |

---

## Phase 4 — Promotions Engine ✅

| Feature | Status | Notes |
|---|---|---|
| `Promotion` model + normalization | ✅ | Uppercase + trim on create/update |
| `PromotionEvaluator` | ✅ | Stacking, usage limits, exclusions |
| Promo redemption on `PAID` | ✅ | `ConsumePromoRedemptionsListener` |
| Admin CRUD + reports | ✅ | `admin/promotions` endpoints |
| `OrderTotalsCalculator` | ✅ | Deterministic discount stacking + tax |

---

## Phase 5 — Loyalty Program ✅

| Feature | Status | Notes |
|---|---|---|
| `LoyaltyAccount` / `LoyaltyLedger` | ✅ | Immutable ledger |
| `LoyaltyHold` (reservation) | ✅ | HOLD → CONSUME / RELEASE / EXPIRE |
| `PointsCalculator` | ✅ | `floor()` rounding |
| Hold expiry command | ✅ | `app:expire-loyalty-holds` (scheduled every 15 min) |
| Reconcile command | ✅ | `app:reconcile-loyalty-balances` (daily 03:00) |

---

## Phase 6 — Delivery Flow ✅  *(NEW)*

| Feature | Status | Notes |
|---|---|---|
| `OrderType::Delivery` enum value | ✅ | `delivery` added alongside `dine_in`, `takeaway`, `online_pickup` |
| Delivery columns migration | ✅ | `2026_02_09_200000_add_delivery_columns_to_orders` |
| `DeliveryFeeCalculator` | ✅ | Zone-based flat fees, configurable via `config/delivery.php` |
| `DeliveryOrderController` | ✅ | `POST /api/orders/delivery`, `PATCH /api/orders/{order}/delivery` |
| KDS shows delivery summary | ✅ | `KdsStreamProvider` includes `delivery_summary` field |
| Receipt/print includes delivery block | ✅ | See receipt view + `DispatchReceiptPrintListener` |
| Feature tests | ✅ | `DeliveryOrderTest.php` |

---

## Phase 7 — SSE Real-Time Streaming ✅  *(NEW)*

| Feature | Status | Notes |
|---|---|---|
| `SseStreamService` | ✅ | DB-polling SSE wrapper, heartbeat every 15s |
| `OrderStreamProvider` | ✅ | Cursor-based resume, monotonic cursor |
| `KdsStreamProvider` | ✅ | Only `pending/in_progress/paid` tickets |
| `StreamController` | ✅ | `/api/stream/orders`, `/api/stream/kds`, `/api/stream/orders/{order}/status` |
| `X-Accel-Buffering: no` | ✅ | nginx proxy buffering disabled |
| `Last-Event-ID` resume | ✅ | Passed to cursor parser |
| Customer auth (own order only) | ✅ | `tokenCan('customer')` guard on `/status` |
| Feature + unit tests | ✅ | `SseStreamTest.php` |

---

## Release Notes — New Endpoints

### Delivery Orders
```
POST   /api/orders/delivery              Create a delivery order (auth:sanctum)
PATCH  /api/orders/{order}/delivery      Update delivery fields while pending (auth:sanctum)
```

### Partial BML Payment
```
POST   /api/payments/online/initiate-partial    Initiate a partial BML payment (auth:sanctum, customer)
```
Body: `{ order_id, amount (laari), idempotency_key }`

### SSE Streams
```
GET    /api/stream/orders                Stream all order changes (auth:sanctum, staff)
GET    /api/stream/kds                   Stream KDS tickets (auth:sanctum, staff)
GET    /api/stream/orders/{order}/status Stream single order status (auth:sanctum, customer/staff)
```
Client usage:
```js
const es = new EventSource('/api/stream/orders', { withCredentials: true });
es.addEventListener('order.updated', e => console.log(JSON.parse(e.data)));
es.addEventListener('order.paid',    e => console.log(JSON.parse(e.data)));
```

---

---

## Phase 8 — Push Notifications, Delivery Drivers, Redis SSE ✅  *(NEW)*

| Feature | Status | Notes |
|---|---|---|
| Web Push Notifications (VAPID) | ✅ | `PushNotificationService`, `OrderObserver`, `GenerateVapidKeys` artisan command |
| Push opt-in UI in online-order-web | ✅ | `usePushNotifications` hook, opt-in banner on `OrderStatusPage` |
| Delivery Driver Assignment | ✅ | `delivery_drivers` table, `DeliveryDriverController`, assign UI in admin `DeliveryPage` |
| Redis Pub/Sub for SSE | ✅ | `RedisEventPublisher`, `SseStreamService.streamOrderViaRedis()`, `REALTIME_USE_REDIS` env flag |
| Frontend: promo + loyalty checkout | ✅ | Implemented in `CheckoutPage` — `useCheckout` hook handles promo/loyalty totals |
| Frontend: BML payment button | ✅ | `placeOrder` → `initiatePayment` → BML redirect in `CheckoutPage` |
| Frontend: delivery address form | ✅ | Full delivery form in `CheckoutPage` with address/island/contact fields |

---

## Phase 9 — Security Tests & Code Quality ✅  *(NEW)*

| Feature | Status | Notes |
|---|---|---|
| `PhoneNormalizationTest` | ✅ | Tests `MaldivesPhone` rule — valid/invalid formats + OTP integration |
| `HealthEndpointTest` | ✅ | Tests health endpoints don't leak environment/version info |
| `BmlReturnUrlTest` | ✅ | Tests BML return URL is centralized via `config/frontend.php` |
| `OrderStreamAuthTest` | ✅ | Tests SSE stream ticket issuance, one-time use, ownership, expiry |
| `OrderIdorTest` | ✅ | Tests IDOR protection — customers can only view own orders |
| `RoleAuthorizationTest` | ✅ | Tests customer token isolation + permission enforcement on admin routes |
| `WebhookIdempotencyTest` | ✅ | Tests BML webhook deduplication via idempotency keys |
| KdsStreamProvider DI fix | ✅ | Replaced `(new OrderStreamProvider)` manual instantiation with constructor injection |

---

## All Items Complete

All planned features, security hardening, and production-readiness items are implemented. See `SECURITY_AUDIT_AND_IMPLEMENTATION_GUIDE.md` and `PRODUCTION_IMPLEMENTATION_GUIDE.md` for full details.
