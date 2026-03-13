# CURSOR PROMPT: Deduplicate Main Website & Online Order App

## Context

We have two overlapping frontends:

1. **Main Website** — Laravel Blade templates served at `/`, `/menu`, `/contact`, `/hours`, `/checkout`, `/pre-order`
2. **Online Order App** — React SPA (Vite + TypeScript) at `/order/*` with routes: `/order/`, `/order/menu`, `/order/about`, `/order/contact`, `/order/hours`, `/order/checkout`, `/order/reservations`, `/order/orders/:orderId`

**Problem:** 5 pages are fully duplicated (Home, Menu, Contact, Hours, Checkout). The Blade checkout is non-functional (uses `alert()` + `confirm()`, no API call). The React app has the real ordering system with auth, cart, promo codes, loyalty points, BML payment, and order tracking.

**Goal:** Strip all ordering/cart/duplicate features from the Blade site. Keep Blade as a lightweight marketing/SEO landing site. Move pre-order and privacy page into the React app. All ordering flows go through the React app exclusively.

---

## Architecture Reference

```
/home/user/Bakeandgrill/
├── backend/                          # Laravel 12 API + Blade views
│   ├── routes/web.php                # Web routes (Blade pages)
│   ├── routes/api.php                # API routes (used by React app)
│   ├── resources/views/              # Blade templates
│   │   ├── layout.blade.php          # Main layout (header, footer, cart JS)
│   │   ├── home.blade.php            # Home page with Add to Cart buttons
│   │   ├── menu.blade.php            # Full menu with cart functionality
│   │   ├── checkout.blade.php        # NON-FUNCTIONAL checkout (DELETE)
│   │   ├── contact.blade.php         # Contact page (KEEP)
│   │   ├── hours.blade.php           # Opening hours (KEEP)
│   │   ├── privacy.blade.php         # Privacy policy (MIGRATE TO REACT)
│   │   ├── order-type-select.blade.php  # Order type selector (DELETE)
│   │   ├── order-gateway.blade.php   # Token bridge to React app
│   │   ├── pre-order/create.blade.php      # Pre-order form (MIGRATE TO REACT)
│   │   ├── pre-order/confirmation.blade.php # Pre-order result (MIGRATE TO REACT)
│   │   └── customer/login.blade.php  # Session login (KEEP for receipt viewing)
│   ├── app/Http/Controllers/
│   │   ├── HomeController.php        # Serves home, menu, contact, hours, checkout
│   │   └── PreOrderController.php    # Pre-order create/store/confirmation
│   └── database/migrations/
│       └── 2026_02_03_192000_create_pre_orders_table.php
│
├── apps/online-order-web/            # React SPA
│   ├── src/
│   │   ├── main.tsx                  # Router setup (basename="/order")
│   │   ├── api.ts                    # API client functions
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── MenuPage.tsx
│   │   │   ├── AboutPage.tsx
│   │   │   ├── ContactPage.tsx
│   │   │   ├── HoursPage.tsx
│   │   │   ├── ReservationPage.tsx
│   │   │   ├── CheckoutPage.tsx
│   │   │   └── OrderStatusPage.tsx
│   │   ├── components/
│   │   │   ├── Layout.tsx            # Shared nav/header
│   │   │   ├── MenuCard.tsx
│   │   │   ├── CartDrawer.tsx
│   │   │   ├── ItemModal.tsx
│   │   │   ├── AuthBlock.tsx
│   │   │   ├── CartSummary.tsx
│   │   │   └── ReviewForm.tsx
│   │   ├── context/
│   │   │   ├── CartContext.tsx
│   │   │   └── LanguageContext.tsx
│   │   └── hooks/
│   │       ├── useCheckout.ts
│   │       └── usePushNotifications.ts
│   └── vite.config.ts
│
└── packages/shared/src/              # Shared types & API client
    ├── types/                        # TypeScript type definitions
    └── api/
        ├── client.ts                 # Generic API request wrapper
        └── endpoints.ts              # All endpoint constants
```

---

## TASK 1: Strip Ordering from Blade Main Website

### 1A. Clean `layout.blade.php`

**File:** `backend/resources/views/layout.blade.php`

Remove all cart-related JavaScript from the `<script>` block in `<head>`:
- Remove the entire `cart` variable initialization (`let cart = []; try { cart = ... }`)
- Remove `updateCartDisplay()` function
- Remove `addToCart()` function
- Remove `goToCheckout()` function
- Remove `showToast()` function
- Keep only the scroll header logic and active nav highlighting

Remove cart UI from the **desktop header** (`.header-actions`):
- Remove the `<button class="hdr-cart">` entirely
- Keep the login/logout links
- Keep the "Order Now →" link (pointing to `/order/`)

Remove cart UI from the **mobile header** (`.mobile-header`):
- Remove the `<button class="mob-cart-btn">` entirely
- Keep login link
- Keep the "Order" button linking to `/order/`

Update the **mobile bottom nav** (`.mobile-bottom-nav`):
- Change the "Menu" item (`/menu`) to point to `/order/menu` instead
- Keep Home, Hours, Contact, Order as-is

Update **footer** links:
- Change `/menu` to `/order/menu`
- Keep `/privacy` link (it will still work via Blade for now, until React privacy page is ready; OR redirect to `/order/privacy`)
- Keep everything else

### 1B. Simplify `home.blade.php`

**File:** `backend/resources/views/home.blade.php`

The home page currently shows featured items with "Add to Cart" buttons. Change it to a pure marketing page:

- **Keep:** Banner carousel, hero section, trust strip, features strip — these are marketing/branding content
- **Change:** In the "Featured Items" section (`.products-grid`), replace the `<button class="add-btn" onclick="addToCart(...)">Add to Cart</button>` buttons with simple links:
  ```html
  <a href="/order/menu" class="add-btn">Order Now →</a>
  ```
- **Remove:** The "Pre-Order" button variant (just make them all "Order Now →" links)
- **Remove:** All `@php $stockService = ...` and stock status logic from the featured items section — it's unnecessary for a marketing display. Just show the items with name, image, price, and a link.
- **Keep:** The "Browse Full Menu →" link but update it to `/order/menu`

### 1C. Delete or Gut `menu.blade.php`

**File:** `backend/resources/views/menu.blade.php`

**Option A (Recommended): Redirect.** Replace the entire Blade menu page with a redirect to the React menu:

In `backend/routes/web.php`, change:
```php
Route::get('/menu', [HomeController::class, 'menu'])->name('menu');
```
to:
```php
Route::redirect('/menu', '/order/menu', 301);
```

**Option B:** If you want to keep a Blade menu for SEO (server-rendered), strip all "Add to Cart" buttons and JavaScript cart logic. Replace them with "Order This →" links to `/order/menu`.

### 1D. Delete Dead Pages

**Delete these Blade views entirely** (they are non-functional or replaced):
- `backend/resources/views/checkout.blade.php` — Non-functional placeholder
- `backend/resources/views/order-type-select.blade.php` — Replaced by React checkout

**Remove their routes from `backend/routes/web.php`:**
```php
// DELETE these lines:
Route::get('/order-type', function () { ... });
Route::get('/checkout', [HomeController::class, 'checkout'])->name('checkout');
```

**Remove the `checkout()` method** from `HomeController.php`.

### 1E. Remove `menu()` method from HomeController

If using redirect approach (Option A), remove the `menu()` method from `HomeController.php` and its associated query logic.

---

## TASK 2: Add Pre-Order Page to React App

### Overview

Currently pre-order lives as a Blade form at `/pre-order` that POSTs to `PreOrderController@store`. We need to:

1. Create a new API endpoint for pre-orders
2. Create a React page for the pre-order flow
3. Wire it into the React router

### 2A. Create API Endpoint for Pre-Orders

**File:** `backend/routes/api.php`

Add inside the customer-authenticated group:
```php
Route::post('/customer/pre-orders', [App\Http\Controllers\Api\PreOrderApiController::class, 'store']);
```

Also add a public endpoint to fetch menu items for the pre-order form (reuse existing items endpoint — it already exists at `/api/items`).

**Create:** `backend/app/Http/Controllers/Api/PreOrderApiController.php`

This controller should:
- Accept JSON payload: `{ items: [{item_id, quantity}], fulfillment_date, customer_notes? }`
- Use auth via Sanctum token (customer token from OTP login)
- Get customer name/phone from the authenticated customer record
- Create the `pre_orders` DB record (same logic as existing `PreOrderController@store`)
- Return JSON: `{ pre_order: { id, order_number, items, total, fulfillment_date, status } }`

**Pre-order Model:** There is no `PreOrder.php` model file yet (only the migration exists). Create it:

**Create:** `backend/app/Models/PreOrder.php`
```php
<?php
declare(strict_types=1);
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreOrder extends Model
{
    protected $fillable = [
        'order_number', 'customer_id', 'customer_name', 'customer_phone',
        'customer_email', 'fulfillment_date', 'preparation_start',
        'items', 'subtotal', 'total', 'status',
        'approved_by', 'approved_at',
        'customer_notes', 'staff_notes', 'cancellation_reason',
    ];

    protected $casts = [
        'items' => 'array',
        'subtotal' => 'decimal:2',
        'total' => 'decimal:2',
        'fulfillment_date' => 'datetime',
        'preparation_start' => 'datetime',
        'approved_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
```

### 2B. Add Pre-Order Endpoint to Shared Package

**File:** `packages/shared/src/api/endpoints.ts`

Add:
```typescript
// Pre-orders
CUSTOMER_PRE_ORDERS: '/customer/pre-orders',
```

### 2C. Add Pre-Order API Function

**File:** `apps/online-order-web/src/api.ts`

Add:
```typescript
export type PreOrderPayload = {
  items: Array<{ item_id: number; quantity: number }>;
  fulfillment_date: string; // ISO datetime
  customer_notes?: string;
};

export type PreOrderResult = {
  id: number;
  order_number: string;
  items: Array<{ item_id: number; name: string; quantity: number; price: number; total: number }>;
  total: number;
  fulfillment_date: string;
  status: string;
};

export async function createPreOrder(
  token: string,
  payload: PreOrderPayload,
): Promise<{ pre_order: PreOrderResult }> {
  return request<{ pre_order: PreOrderResult }>(ENDPOINTS.CUSTOMER_PRE_ORDERS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}
```

### 2D. Create React Pre-Order Page

**Create:** `apps/online-order-web/src/pages/PreOrderPage.tsx`

This page should have a multi-step flow matching the Blade version:

**Step 1 — Select Items:**
- Fetch items from `/api/items` (reuse `fetchItems()`)
- Show item grid (similar to MenuPage but simplified)
- Each item has +/- quantity controls
- Running total displayed
- Category filter and search

**Step 2 — Event Details:**
- Date/time picker (`fulfillment_date`) — minimum 24 hours ahead
- Notes textarea (`customer_notes`)

**Step 3 — Auth + Submit:**
- If not logged in, show `AuthBlock` component (OTP login)
- If logged in, show customer name/phone (from token)
- Submit button calls `createPreOrder()`

**Step 4 — Confirmation:**
- Show success with order number, items, total, fulfillment date
- "Back to Menu" button

**Design:** Follow the same design patterns as the existing React pages (teal `#1ba3b9` accent, amber `#D97706` for CTAs, white cards with `border-radius: 16px`, etc.).

### 2E. Add Pre-Order Route

**File:** `apps/online-order-web/src/main.tsx`

Add to the `<Route element={<Layout />}>` group:
```tsx
<Route path="pre-order" element={<PreOrderPage />} />
```

### 2F. Add Navigation Link

**File:** `apps/online-order-web/src/components/Layout.tsx`

Add a "Pre-Order" link in the navigation alongside Menu, About, Contact, Hours, Reservations.

### 2G. Redirect Blade Route

**File:** `backend/routes/web.php`

Change:
```php
Route::get('/pre-order', [PreOrderController::class, 'create'])->name('pre-order.create');
```
to:
```php
Route::redirect('/pre-order', '/order/pre-order', 301);
```

Keep the POST route active for now as a fallback, or remove it once the React version is confirmed working.

---

## TASK 3: Add Privacy Page to React App

### 3A. Create React Privacy Page

**Create:** `apps/online-order-web/src/pages/PrivacyPage.tsx`

Port the content from `backend/resources/views/privacy.blade.php` into a React component. The content is static text — no API calls needed.

**Sections to include:**
1. Introduction
2. Information We Collect (phone, name, email, order history, delivery address)
3. How We Use Your Information
4. SMS Communications (with opt-out instructions)
5. Data Security
6. Data Sharing (Dhiraagu, payment processors, legal)
7. Your Rights
8. Contact Us (privacy@bakeandgrill.mv, +960 9120011, Kalaafaanu hingun address)

**Design:** Match the existing page style — centered content (`maxWidth: 860px`), white background, sections with headings in teal/amber accent colors.

Set `document.title` to `'Privacy Policy — Bake & Grill'`.

### 3B. Add Privacy Route

**File:** `apps/online-order-web/src/main.tsx`

Add to the `<Route element={<Layout />}>` group:
```tsx
<Route path="privacy" element={<PrivacyPage />} />
```

### 3C. Add Footer Link in React Layout

**File:** `apps/online-order-web/src/components/Layout.tsx`

Add a "Privacy Policy" link in the footer area of the React layout.

### 3D. Redirect Blade Route

**File:** `backend/routes/web.php`

Change:
```php
Route::get('/privacy', [HomeController::class, 'privacy'])->name('privacy');
```
to:
```php
Route::redirect('/privacy', '/order/privacy', 301);
```

Update the footer link in `layout.blade.php` to point to `/order/privacy`.

---

## TASK 4: Fix React Hours Page (Currently Hardcoded)

### Problem

The React `HoursPage.tsx` has **hardcoded** hours:
```typescript
const WEEKLY_HOURS = [
  { day: 'Sunday', hours: '7:00 AM – 10:00 PM' },
  ...
];
```

But the backend has a proper `OpeningHoursService` that reads from config and the Blade hours page uses it dynamically.

### Fix

**File:** `apps/online-order-web/src/pages/HoursPage.tsx`

1. Create or use an API endpoint that returns the full weekly schedule. The existing `/api/opening-hours/status` only returns current open/closed status. Either:
   - **Option A:** Add a new endpoint `/api/opening-hours` that returns the full week schedule
   - **Option B:** Extend the existing `/api/opening-hours/status` response to include `schedule: [{ day, open, close, closed }]`

2. Fetch the schedule on mount and render dynamically instead of using the hardcoded `WEEKLY_HOURS` array.

**Backend change needed:**

**File:** `backend/routes/api.php`

Add a public endpoint:
```php
Route::get('/opening-hours', function () {
    $config = config('opening_hours.schedule', []);
    $service = app(App\Services\OpeningHoursService::class);
    return response()->json([
        'schedule' => $config,
        'open' => $service->isOpenNow(),
        'closure_reason' => $service->getClosureReason(),
    ]);
});
```

---

## TASK 5: Update Blade Layout Navigation

After all changes, the Blade `layout.blade.php` navigation should look like:

**Desktop header nav:**
```
Home (/) | Hours (/hours) | Contact (/contact) | [Order Now → /order/]
```

Remove "Menu" from the Blade nav since it now redirects to `/order/menu`.

**Mobile bottom nav:**
```
Home (/) | Hours (/hours) | Order (/order/) | Contact (/contact)
```

**Footer quick links:**
```
Home (/) | Menu (/order/menu) | Order Online (/order/) | Hours (/hours) | Contact (/contact) | Privacy (/order/privacy)
```

---

## TASK 6: Cleanup

After all tasks are complete:

1. **Remove unused Blade views:** `checkout.blade.php`, `order-type-select.blade.php`
2. **Remove unused controller methods:** `HomeController@checkout`, `HomeController@menu` (if using redirect)
3. **Verify no broken links:** Search all Blade views for `/menu` and `/checkout` references and update them
4. **Test the redirects:** `/menu` → `/order/menu`, `/pre-order` → `/order/pre-order`, `/privacy` → `/order/privacy`
5. **Verify the Blade site works:** Home, Hours, Contact should render correctly without cart JS
6. **Verify the React app works:** All pages load, pre-order flow works, privacy page renders

---

## Pre-Order Database Schema Reference

```sql
CREATE TABLE pre_orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_number VARCHAR(255) UNIQUE,
    customer_id BIGINT NULLABLE REFERENCES customers(id),
    customer_name VARCHAR(255),
    customer_phone VARCHAR(255),
    customer_email VARCHAR(255) NULLABLE,
    fulfillment_date DATETIME,
    preparation_start DATETIME NULLABLE,
    items JSON,  -- [{item_id, name, quantity, price, notes}]
    subtotal DECIMAL(10,2),
    total DECIMAL(10,2),
    status ENUM('pending','approved','confirmed','preparing','ready','completed','cancelled') DEFAULT 'pending',
    approved_by BIGINT NULLABLE REFERENCES users(id),
    approved_at TIMESTAMP NULLABLE,
    customer_notes TEXT NULLABLE,
    staff_notes TEXT NULLABLE,
    cancellation_reason TEXT NULLABLE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## Design Reference

**Color palette used in React app:**
- Primary teal: `#1ba3b9` (buttons, links, accents)
- Amber/CTA: `#D97706` (call-to-action buttons, highlights)
- Dark text: `#1c1e21`
- Muted text: `#636e72`
- Card background: `white` with `border: 1px solid #e9ecef`, `border-radius: 16px`
- Page background: `#f8f9fa`
- Success green: `#28a745`
- Error red: `#dc3545`

**Component patterns:**
- Cards: white bg, 1px border `#e9ecef`, `border-radius: 16px`, `padding: 20px 24px`
- Buttons: `border-radius: 12px` or `999px` (pill), `font-weight: 700`
- Page headers: centered, `clamp(1.75rem, 5vw, 2.5rem)` font size
- Hover effects: `translateY(-2px)` + shadow increase

---

## Summary of Changes

| What | Action | From | To |
|------|--------|------|----|
| Blade cart JS | DELETE | `layout.blade.php` | — |
| Blade cart buttons | DELETE | `layout.blade.php` header | — |
| Home "Add to Cart" | CHANGE | `addToCart()` onclick | `<a href="/order/menu">` |
| `/menu` route | REDIRECT 301 | Blade menu page | `/order/menu` |
| `/checkout` route | DELETE | Non-functional page | — |
| `/order-type` route | DELETE | Unused selector | — |
| `/pre-order` route | REDIRECT 301 | Blade form | `/order/pre-order` |
| `/privacy` route | REDIRECT 301 | Blade page | `/order/privacy` |
| Pre-Order page | CREATE | — | React `PreOrderPage.tsx` |
| Pre-Order API | CREATE | — | `POST /api/customer/pre-orders` |
| PreOrder model | CREATE | — | `backend/app/Models/PreOrder.php` |
| Privacy page | CREATE | — | React `PrivacyPage.tsx` |
| Hours page | FIX | Hardcoded hours | Fetch from API |
| Hours API | CREATE | — | `GET /api/opening-hours` |
| Blade nav links | UPDATE | `/menu` references | `/order/menu` |
