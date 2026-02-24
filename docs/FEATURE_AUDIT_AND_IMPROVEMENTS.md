# Bake & Grill – Full Feature Audit & Improvement Recommendations

**Audit Date:** February 9, 2026  
**Scope:** Backend (Laravel), main website (Blade), POS/KDS/Online Order (React), print-proxy, docs.

---

## 1. What’s Implemented and Working Well

### Backend (Laravel)
- **Auth:** Staff PIN + Sanctum, customer OTP (API + web portal), device registration, ability-based access.
- **Orders:** Create (staff + customer), sync (offline batch), hold/resume, payments, server-side pricing only.
- **Menu:** Categories, items, modifiers, variants, barcode lookup, `available_only`, item toggle.
- **Inventory:** CRUD, adjustments, stock count, low-stock API, price history, cheapest supplier; recipe-based deduction on order/KDS start.
- **Purchasing:** Suppliers, purchases, receipt upload, CSV import.
- **Tables:** Open/close, add items, merge, split.
- **KDS:** Orders list, start/bump/recall; print jobs + retry.
- **Shifts & cash:** Open/close shift, cash movements.
- **Reports:** Sales summary/breakdown, X/Z, inventory valuation, CSV exports.
- **Refunds:** List, show, create (per order).
- **SMS:** OTP, promotions (preview/send, jobs), opt-out; low-stock alerts to managers.
- **Receipts:** Token-based view, resend, feedback, PDF; send from staff.
- **Pre-orders:** Event pre-order create/store/confirmation.
- **Opening hours:** Config, `OpeningHoursService`, closure reasons.
- **Security:** Discount policy gate, audit log, throttling on auth/OTP, CORS, no client-supplied prices.

### Main Website (Blade)
- Home (featured/best sellers, open/closed), menu (categories, filters, best-seller badges), contact, hours, privacy.
- Checkout page (cart from localStorage, login prompt, place order).
- Customer portal: web OTP request/verify, rate limiting, dev OTP hint.
- Order-type gateway, receipt pages (view, PDF, feedback, resend).
- Image thumbnails: `/thumb/images/cafe/...` with path restriction and caching.

### Online Order App (React)
- OTP login, categories, items grid, modifiers, cart, pickup notes, order history.
- Cart total from server-derived prices (item + modifiers).
- Place order → `type: online_pickup`, server-side pricing.
- Cart import from main site localStorage (with one bug – see below).

### POS App (React)
- PIN login, device id, order types (Dine-in, Takeaway, Online Pickup), tables.
- Categories/items, modifiers, barcode lookup, hold/resume, payments (cash/card/digital_wallet), sync.
- Operations: inventory, suppliers, purchases, shifts, reports, SMS promotions, refunds.
- Offline queue and fallback data.

### KDS App (React)
- KDS orders, start/bump/recall.

### Print Proxy
- ESC/POS, printer config (JSON), API key, job handling.

### Tests
- Feature: CustomerOrderSecurity, CustomerOtp, OrderFlow, PublicApiSecurity, Receipt, StaffAuth.

---

## 2. Bugs and Quick Fixes

### 2.1 Online Order – Cart import variable shadowing (bug)
**File:** `apps/online-order-web/src/App.tsx` (initial cart state from `bakegrill_cart`).

Inside the `useState` initializer, the parsed main-website cart is used in a `.map()`. The variable name `items` is reused: the array being mapped is the cart (array of `{ id, name?, price?, quantity? }`), but `items.find(...)` is intended to resolve the full `Item` from the API. At initial load the API hasn’t run yet, so the “found” value is actually another cart entry, not a full `Item`. The second import in `useEffect` (after `fetchItems`) correctly uses `itemsResponse.data` and is fine.

**Recommendation:** In the initial state callback, name the parsed array `cartItems` (e.g. `const cartItems = JSON.parse(mainWebsiteCart)`), and only use it to build the initial cart. Avoid using `items` for the parsed cart so the logic is clear and you don’t rely on fallback object shape.

### 2.2 Hardcoded `localhost:8000` in production
**Files:** `apps/online-order-web/src/App.tsx` (footer links: Menu, Hours, Contact, Privacy).

Footer links use `http://localhost:8000/menu`, etc. In production these should point at the main site (same origin or configured base URL).

**Recommendation:** Use relative URLs (e.g. `/menu`, `/hours`, `/contact`, `/privacy`) so they work on any domain, or a `VITE_MAIN_SITE_URL` (or similar) env var for the main website base.

### 2.3 Dashboard route missing
**File:** `backend/resources/views/welcome.blade.php` links to `url('/dashboard')`, but `routes/web.php` has no `/dashboard` route. If Laravel’s default route points at `welcome`, that link 404s.

**Recommendation:** Either add a dashboard route (e.g. redirect to home or a simple “Dashboard” Blade/React page) or remove/change the link in `welcome.blade.php` so it’s not shown to customers (e.g. link to `/` or remove the welcome page from production).

---

## 3. Feature Gaps and Improvements

### 3.1 Order placement – stock validation
**Current:** `OrderCreationService` checks `is_active` and `is_available` and creates the order. Inventory deduction runs for **recipe-based** inventory (`InventoryDeductionService`). `Item.stock_quantity` (and `StockManagementService::checkStock`) are not validated before creating an order.

**Risk:** For items with `track_stock` and `availability_type === 'stock_based'`, customers (or POS) can place orders when `stock_quantity` is 0 or below requested quantity.

**Recommendation:** Before creating order lines for such items, call `StockManagementService::checkStock($item, $quantity)` and reject the order (or return a clear error) if insufficient. Optionally reserve stock briefly for online orders to reduce oversell.

### 3.2 Promotions and discounts
**Current:** Orders have `discount_amount` and `tax_amount`; reports and receipts use them. There is no promotion engine: no percentage/fixed discounts, promos, or promo codes applied at order create.

**Recommendation:** Add a small promotion layer: e.g. `Promotion` model (type, value, min order, valid from/to, optional code), apply in `OrderCreationService` (or a dedicated service) to compute `discount_amount` and optionally `tax_amount`, and expose “apply promo code” in POS and online order if desired.

### 3.3 Tax calculation
**Current:** Items have `tax_rate`; orders have `tax_amount` but it’s set to 0 in `OrderCreationService`. No automatic tax from item rates.

**Recommendation:** When finalizing order totals, compute tax from item-level `tax_rate` (and quantity/price) and set `order.tax_amount` and ensure `order.total` includes tax (or document that totals are tax-inclusive). Align with local rules (e.g. GST/VAT in Maldives).

### 3.4 Multi-language (Dhivehi / English)
**Current:** DB has `name_dv` on categories/items and `preferred_language` on customers. API returns `name_dv`; Blade/React UIs are English-only. No language switcher or locale-based rendering.

**Recommendation:** Use Laravel localization for Blade (e.g. `__('menu.title')`) and a small i18n layer in React (e.g. JSON per locale, customer preference or browser/lang). Render `name_dv` when locale is `dv`, else `name`. Add a language toggle on main site and online order app.

### 3.5 Dashboard / KPIs
**Current:** No dedicated dashboard. Reports exist (sales, X/Z, inventory, etc.) but are used from POS “ops” view, not a single dashboard.

**Recommendation:** Add a simple dashboard (Blade or React): today’s sales, open tables, pending/active KDS orders, low-stock count, maybe a simple chart. Can be a new route like `/dashboard` (staff-only) that uses existing report APIs or new lightweight endpoints.

### 3.6 Main site checkout → order flow
**Current:** Checkout page shows cart and “Place order”; flow depends on JS and possibly posting to an endpoint. Need to confirm: does “Place order” on main site create an order via API and require customer login, or only redirect to online order app?

**Recommendation:** Document the flow. If main checkout should create orders, ensure it uses the same customer auth (OTP) and `POST /api/customer/orders` (or equivalent) and that stock/availability checks are consistent with the online order app.

### 3.7 Online order – opening hours
**Current:** Main site uses `OpeningHoursService` to show “Open/Closed” and messaging. Online order app does not check opening hours before allowing “Place order”.

**Recommendation:** Expose an API such as `GET /api/opening-hours/status` (e.g. `{ "open": true, "message": null }`) and have the online order app disable or warn before placing order when closed. Optionally show “We’re closed” banner and disable checkout when closed.

### 3.8 404 and error pages
**Current:** No custom 404 or 5xx Blade views; Laravel defaults are used.

**Recommendation:** Add `resources/views/errors/404.blade.php` (and optionally 503) extending your layout, with link back to home and consistent branding.

### 3.9 Admin / menu management UI
**Current:** Menu and items are managed via API (create/update/delete categories and items). There is no built-in admin UI for staff to manage menu, opening hours, or site content.

**Recommendation:** Either add a simple internal Blade or React “admin” area (e.g. `/admin` with auth and CRUD for categories/items/hours) or document that management is done via API/Postman and who is allowed. Protects against “we don’t know how to add an item” in production.

### 3.10 POS – discount application
**Current:** `DiscountPolicy` and gate `discount.apply` exist; order has `discount_amount`. No visible flow in POS to apply a discount to an order (no UI or request payload for discount).

**Recommendation:** In POS, add “Apply discount” (e.g. percentage or fixed amount) before or at payment, subject to `discount.apply`, and send discount in the payload so `OrderCreationService` or payment endpoint can set `discount_amount` and recalc total.

### 3.11 Receipt compliance
**Current:** Receipts show tax and discount. No explicit “receipt number” or “tax ID” or “business registration” fields documented in views.

**Recommendation:** Confirm local requirements (e.g. sequential receipt number, tax ID, business registration). Add those fields to receipt templates and to config (e.g. `config/receipt.php` or `.env`) so they’re consistent and compliant.

### 3.12 PWA and offline (online order app)
**Current:** `vite-plugin-pwa` is in package.json; offline behavior of the online order app (service worker, caching, “You’re offline” message) was not audited in detail.

**Recommendation:** Verify service worker and cache strategy; ensure “Place order” shows a clear “You’re offline – try again later” (and doesn’t submit) when offline. Optional: queue orders for retry when back online (like POS) if product requirements allow.

---

## 4. Security and Robustness

- **Rate limiting:** Auth and OTP endpoints are throttled; keep an eye on report CSV and other heavy endpoints (already throttled where seen).
- **CORS:** Uses `FRONTEND_URL` and dev localhost origins; ensure production only allows real front-end origins.
- **Sanctum:** Staff vs customer abilities are enforced in controllers; keep any new endpoints behind the correct middleware and ability checks.
- **Input:** Order and customer order requests validate `item_id`/`modifier_id` and use DB for prices; keep that pattern for any new payloads.

---

## 5. Priority Summary

| Priority | Item | Effort |
|----------|------|--------|
| High     | Fix footer links (relative or env) so production doesn’t use localhost | Small |
| High     | Validate stock for `track_stock` + `stock_based` items before accepting order | Small–medium |
| High     | Fix or remove dashboard link (add route or change welcome view) | Small |
| Medium   | Cart import variable naming in online order app | Small |
| Medium   | Tax calculation from item `tax_rate` and set `order.tax_amount` | Medium |
| Medium   | Opening hours check in online order app (API + disable/warn when closed) | Small–medium |
| Medium   | Apply discount in POS (UI + payload + backend) | Medium |
| Medium   | Custom 404 (and optional 503) Blade views | Small |
| Lower    | Promotions/promo codes (model + apply in order creation) | Medium–large |
| Lower    | Multi-language (i18n + `name_dv` + switcher) | Medium |
| Lower    | Simple dashboard (today sales, low stock, open tables) | Medium |
| Lower    | Admin UI for menu/items (or documented API-only process) | Medium–large |

---

## 6. Documentation and Consistency

- **README / SETUP:** Match documented URLs and ports (e.g. main site 8000, order 3003) with actual config and any `VITE_*` variables.
- **FINAL_IMPLEMENTATION_STATUS.md:** Update “Live URLs” and “Work in progress” to reflect current state and remove or fix the dashboard reference.
- **ENHANCEMENTS_AND_MISSING_FEATURES.md:** Still a good roadmap; the items above align with it and can be checked off as you implement (e.g. stock validation, tax, discounts, dashboard).

---

**End of audit.** Addressing the high-priority and medium-priority items will improve correctness, production readiness, and day-to-day operations without a full rewrite.
