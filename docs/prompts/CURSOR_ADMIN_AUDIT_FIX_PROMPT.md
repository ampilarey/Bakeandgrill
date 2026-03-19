# Bake & Grill — Admin Panel, Website Layout & Order App Audit Fix Prompt

You are fixing issues identified in a full-platform audit of the **Bake & Grill** restaurant management system — a monorepo with a Laravel 12 backend and multiple React 19 + TypeScript + Vite frontend apps.

## Project Architecture

```
Bakeandgrill/
├── apps/
│   ├── admin-dashboard/     # Admin panel (React 19 + Vite + Tailwind 4)
│   ├── online-order-web/    # Customer ordering website
│   ├── pos-web/             # Point of Sale app
│   ├── kds-web/             # Kitchen Display System
│   └── delivery-web/        # Delivery driver app
├── backend/                 # Laravel 12 API (PHP 8.2+, PostgreSQL, Redis)
│   ├── app/
│   │   ├── Http/Controllers/Api/   # 62 API controllers
│   │   ├── Http/Middleware/         # 8 middleware classes
│   │   ├── Http/Requests/           # 34+ form request validators
│   │   ├── Models/                  # 94 Eloquent models
│   │   ├── Policies/                # 8 authorization policies
│   │   └── Domains/                 # 17 domain modules (DDD)
│   └── routes/
│       ├── api.php                  # Main API routes (1,100+ lines)
│       └── api_finance.php          # Finance routes
├── packages/shared/         # Shared utilities
└── print-proxy/             # ESC/POS print server (Node.js)
```

### Key Tech Details
- **Auth:** Laravel Sanctum (token-based) — staff PIN login, customer OTP, driver auth
- **Styling:** Tailwind CSS 4 + inline style objects
- **State:** React useState/useEffect (no Redux/Zustand)
- **Real-time:** SSE via Redis pub/sub
- **Currency:** MVR (Maldivian Rufiyaa)
- **Font:** Poppins
- **Icons:** Lucide React

---

## PHASE 1: SECURITY FIXES (Do These First)

### Task 1.1 — Add DOMPurify Sanitization to All React Apps

**Problem:** User-supplied strings (names, descriptions, comments) are rendered without sanitization across all apps.

**Install:**
```bash
cd apps/admin-dashboard && npm install dompurify @types/dompurify
cd ../online-order-web && npm install dompurify @types/dompurify
cd ../pos-web && npm install dompurify @types/dompurify
```

**Create shared sanitizer** in each app's `src/utils/sanitize.ts`:
```typescript
import DOMPurify from 'dompurify';

export function sanitize(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
```

**Apply to these files:**

**Admin Dashboard:**
- `pages/MenuPage.tsx` — item name (line ~573), category name, description
- `pages/StaffPage.tsx` — staff name (line ~441), email display
- `pages/OrdersPage.tsx` — customer name, order notes
- `pages/DeliveryPage.tsx` — driver name (line ~495)
- `pages/LoyaltyPage.tsx` — customer name display
- `pages/PromotionsPage.tsx` — promotion name/code display
- `pages/SettingsPage.tsx` — JSON textarea values (line ~560-571)

**Online Order Web:**
- `components/ItemModal.tsx` — item description (line ~81-84)
- `components/Layout.tsx` — customer name (line ~169)
- `components/ReviewForm.tsx` — validate comment before submit (line ~24)
- `pages/OrderStatusPage.tsx` — order item names, modifier names
- `pages/OrderHistoryPage.tsx` — order data display

**POS Web:**
- `components/OrderCart.tsx` — item names, special instructions
- `components/MenuGrid.tsx` — category/item names

### Task 1.2 — Fix Webhook URL HTTPS Validation

**File:** `apps/admin-dashboard/src/pages/WebhooksPage.tsx` (lines 38-45)

**Current (broken):**
```typescript
try { new URL(url.trim()); }
catch { setError('Please enter a valid URL (must start with https://).'); }
```

**Fix to:**
```typescript
try {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== 'https:') {
    setError('Webhook URL must use HTTPS.');
    return;
  }
} catch {
  setError('Please enter a valid URL (must start with https://).');
  return;
}
```

### Task 1.3 — Fix Backend Mass Assignment Protection

**Search all controllers for `$request->all()` usage:**
```bash
grep -rn '$request->all()' backend/app/Http/Controllers/
```

**Replace every instance** with explicit field lists using `$request->only([...])` or use Form Request classes.

### Task 1.4 — Add Missing Permission Middleware to Backend Routes

**File:** `backend/routes/api.php`

**Audit every route** inside the `staff` middleware group. Ensure sensitive admin routes have `RequirePermission` middleware:
```php
// Example fix:
Route::post('/admin/sms/campaigns', [SmsCampaignController::class, 'store'])
    ->middleware('permission:integrations.sms'); // ADD THIS
```

**Routes that likely need permission middleware:**
- Analytics endpoints → `permission:financial.reports`
- Staff management → `permission:staff.manage`
- Expense/invoice endpoints → `permission:financial.reports`
- Promotion endpoints → `permission:promotions.manage`
- Loyalty adjustments → `permission:loyalty.manage`

---

## PHASE 2: ERROR HANDLING & VALIDATION FIXES

### Task 2.1 — Fix Silent Error Catches in Admin Dashboard

**Pattern to apply everywhere:**

Replace:
```typescript
.catch(() => {})
// or
.catch(() => toast.error('Failed'))
// or
catch { /* ignore */ }
```

With:
```typescript
.catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  toast.error(message);
  console.error('[ComponentName]', err);
})
```

**Files to fix:**
1. `admin-dashboard/src/pages/DashboardPage.tsx` (line ~34)
2. `admin-dashboard/src/pages/SettingsPage.tsx` (line ~350)
3. `admin-dashboard/src/pages/DeliveryPage.tsx` (line ~57)
4. `admin-dashboard/src/pages/LoyaltyPage.tsx` (line ~237)
5. `admin-dashboard/src/pages/MenuPage.tsx` (line ~363)
6. `online-order-web/src/pages/HomePage.tsx` (lines ~35-44) — featured items silently fails
7. `online-order-web/src/pages/OrderStatusPage.tsx` (line ~40) — defaults to "open" on error

### Task 2.2 — Fix Input Validation

**`admin-dashboard/src/pages/MenuPage.tsx` (line ~233):**
```typescript
// Replace:
if (!form.base_price || parseFloat(form.base_price) < 0)

// With:
const price = parseFloat(form.base_price);
if (!form.base_price || isNaN(price) || price < 0)
```

**`admin-dashboard/src/pages/StaffPage.tsx` (line ~77):**
```typescript
// Add email format validation:
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email.trim())) {
  setError('Please enter a valid email address.');
  return;
}
```

**`admin-dashboard/src/pages/PromotionsPage.tsx` (line ~54):**
```typescript
// Fix: reject 0% and negative values
if (form.discount_value <= 0) {
  setError('Discount value must be greater than zero.');
  return;
}
```

**`online-order-web/src/components/AuthBlock.tsx` (line ~21):**
```typescript
// Add phone validation before OTP request:
const phoneRegex = /^[37]\d{6}$/; // Maldivian phone format
if (!phoneRegex.test(phone.trim())) {
  setError('Please enter a valid Maldivian phone number (7 digits).');
  return;
}
```

### Task 2.3 — Add Quantity Limits

**`online-order-web/src/components/MenuCard.tsx` (line ~195-199):**
```typescript
// Add max quantity check:
const MAX_QTY = 99;
<button
  type="button"
  disabled={quantity >= MAX_QTY}
  onClick={(e) => { e.stopPropagation(); setQuantity((q) => Math.min(q + 1, MAX_QTY)); }}
>
```

---

## PHASE 3: MISSING CRUD OPERATIONS

### Task 3.1 — Add Expense Edit Functionality

**File:** `apps/admin-dashboard/src/pages/ExpensesPage.tsx`

**Currently:** Can only ADD and DELETE expenses. No EDIT button.

**Add:**
1. An "Edit" button in each expense row (pencil icon)
2. Clicking "Edit" opens the same form modal pre-filled with existing data
3. Submit calls `PUT /api/admin/expenses/{id}` instead of `POST /api/admin/expenses`
4. Add `editingId` state to track which expense is being edited

**Backend:** Check that `ExpenseController` has an `update()` method. If not, add one:
```php
public function update(Request $request, Expense $expense)
{
    $validated = $request->validate([
        'description' => 'required|string|max:255',
        'amount' => 'required|numeric|min:0.01',
        'category' => 'required|string',
        'date' => 'required|date',
    ]);
    $expense->update($validated);
    return response()->json($expense);
}
```

### Task 3.2 — Add Category Name Editing

**File:** `apps/admin-dashboard/src/pages/MenuPage.tsx`

**Currently:** Categories can be created but name can't be edited after creation. `is_active` toggle exists in API but not in UI.

**Add:**
1. Edit button on each category card
2. Inline editing or modal for category name + `is_active` toggle
3. Call `PUT /api/categories/{id}` with `{ name, is_active }`

### Task 3.3 — Add Invoice Creation

**File:** `apps/admin-dashboard/src/pages/InvoicesPage.tsx`

**Currently:** Can only mark invoices as "Sent" or "Paid". No creation or editing.

**Add:**
1. "Create Invoice" button that opens a form modal
2. Fields: supplier (dropdown), items (line items with description, quantity, unit price), due date, notes
3. Invoice total auto-calculated from line items
4. Submit calls `POST /api/admin/invoices`
5. Add edit capability for draft invoices

### Task 3.4 — Add Purchase Order Line Item Editing

**File:** `apps/admin-dashboard/src/pages/PurchaseOrdersPage.tsx`

**Currently:** Can approve drafts but can't edit line items or cancel orders.

**Add:**
1. Edit button on draft POs that opens line item editor
2. Ability to add/remove/modify line items
3. Cancel button for draft POs
4. Partial receive functionality

---

## PHASE 4: ADMIN EDITING TOOLS

### Task 4.1 — Build Website Theme Editor

**Create:** `apps/admin-dashboard/src/pages/WebsiteEditorPage.tsx`

**Features:**
1. **Color Picker** — Edit CSS variables: `--color-primary`, `--color-accent`, `--color-bg`, etc.
2. **Font Selector** — Choose from Poppins, Inter, Roboto, etc.
3. **Logo Upload** — Upload restaurant logo (uses existing ImageUpload API)
4. **Hero Image** — Upload/change homepage hero banner
5. **Store these in** `site_settings` table via `PUT /api/admin/settings`
6. **Preview panel** — Show live preview of changes before saving

**Backend:** Ensure `SiteSettingsController` can handle these keys:
```php
'theme_primary_color', 'theme_accent_color', 'theme_bg_color',
'theme_font_family', 'logo_url', 'hero_image_url'
```

**Add route in admin sidebar** (`Layout.tsx`):
```typescript
{ icon: Palette, label: 'Website Editor', path: '/website-editor' }
```

### Task 4.2 — Build Content Management (CMS) Pages

**Create:** `apps/admin-dashboard/src/pages/ContentEditorPage.tsx`

**Features:**
1. **Page selector** — dropdown: About, Contact, Hours, Privacy
2. **Rich text editor** — Use a lightweight editor (e.g., `@tiptap/react`) for page content
3. **Save** calls `PUT /api/admin/settings` with key like `page_content_about`
4. **Online-order-web** reads this content from site settings instead of hardcoded text

### Task 4.3 — Build Banner/Announcement Manager

**Create:** `apps/admin-dashboard/src/pages/BannersPage.tsx`

**Features:**
1. CRUD for homepage banners/announcements
2. Fields: title, message, background color, text color, link, active/inactive, display order
3. Date range (show from/until)
4. Preview before publishing
5. Store in new `banners` table or as JSON in site_settings

### Task 4.4 — Add Drag-and-Drop Menu Ordering

**File:** `apps/admin-dashboard/src/pages/MenuPage.tsx`

**Add:**
1. Install `@dnd-kit/core` and `@dnd-kit/sortable`
2. Make category cards draggable to reorder
3. Make item rows draggable within categories
4. Save order via `PUT /api/categories/reorder` and `PUT /api/items/reorder`
5. Add `sort_order` column if not already on categories and items tables

### Task 4.5 — Add Bulk Operations to All Admin Tables

**Apply to:** `MenuPage`, `StaffPage`, `ExpensesPage`, `OrdersPage`, `PromotionsPage`, `InvoicesPage`

**Add:**
1. Checkbox column as first column in every table
2. "Select All" checkbox in header
3. Bulk action bar that appears when items selected:
   - Delete selected
   - Export selected as CSV
   - Change status (where applicable)
4. Import CSV button in page header

**CSV Export utility** — create `apps/admin-dashboard/src/utils/csvExport.ts`:
```typescript
export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## PHASE 5: ACCESSIBILITY FIXES

### Task 5.1 — Add ARIA Labels to All Interactive Elements

**Admin Dashboard `LoginPage.tsx`:**
```typescript
// Add to numpad buttons:
<button aria-label={`Enter digit ${n}`} ...>{n}</button>
<button aria-label="Delete last digit" ...>⌫</button>
```

**All Modal Components:**
```typescript
// Add to modal wrapper div:
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">{title}</h2>
  ...
</div>
```

### Task 5.2 — Add Focus Traps to All Modals

**Create** `apps/admin-dashboard/src/hooks/useFocusTrap.ts`:
```typescript
import { useEffect, useRef } from 'react';

export function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    first?.focus();
    el.addEventListener('keydown', trap);
    return () => el.removeEventListener('keydown', trap);
  }, [active]);

  return ref;
}
```

Apply to all modals in both admin-dashboard and online-order-web.

### Task 5.3 — Fix Color-Only Status Indicators

**`online-order-web/src/pages/HoursPage.tsx` (line ~74):**
```typescript
// Replace color-only dot with icon + text:
<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <span style={{
    width: 12, height: 12, borderRadius: '50%',
    background: isOpen ? 'var(--color-success)' : 'var(--color-error)',
  }} />
  <span>{isOpen ? 'Open' : 'Closed'}</span>
</span>
```

### Task 5.4 — Use Semantic Labels

**`admin-dashboard/src/pages/ExpensesPage.tsx`:**
Replace all styled `<div>` labels with proper `<label htmlFor="...">` elements.

---

## PHASE 6: PERFORMANCE OPTIMIZATIONS

### Task 6.1 — Add Route-Level Code Splitting

**File:** `apps/admin-dashboard/src/App.tsx`

**Replace:**
```typescript
import DashboardPage from './pages/DashboardPage';
import MenuPage from './pages/MenuPage';
// ... 20 more imports
```

**With:**
```typescript
import { lazy, Suspense } from 'react';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MenuPage = lazy(() => import('./pages/MenuPage'));
// ... all page imports

// Wrap routes:
<Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}>
  <Routes>
    <Route path="/" element={<DashboardPage />} />
    ...
  </Routes>
</Suspense>
```

**Do the same for:** `apps/online-order-web/src/App.tsx`

### Task 6.2 — Add useMemo to Filtered/Sorted Lists

**All admin table pages** — wrap filtered data in `useMemo`:
```typescript
const filteredItems = useMemo(() =>
  items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
       .sort((a, b) => a.sort_order - b.sort_order),
  [items, search]
);
```

### Task 6.3 — Debounce Scroll Listeners

**`online-order-web/src/pages/MenuPage.tsx` (line ~42):**
```typescript
useEffect(() => {
  let ticking = false;
  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > 300);
        ticking = false;
      });
      ticking = true;
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
```

### Task 6.4 — Parallelize Prayer Bar API Calls

**`online-order-web/src/components/PrayerBar.tsx` (line ~175):**
```typescript
// Replace sequential calls with:
const [todayRes, tomorrowRes] = await Promise.all([
  fetch(`/api/prayer-times?island_id=${islandId}&date=${today}`),
  fetch(`/api/prayer-times?island_id=${islandId}&date=${tomorrow}`)
]);
```

---

## PHASE 7: LAYOUT & RESPONSIVENESS FIXES

### Task 7.1 — Fix Admin Tables for Mobile

**Apply to all admin table pages** (`MenuPage`, `StaffPage`, `OrdersPage`, `ExpensesPage`, etc.):

```typescript
// Wrap table in scrollable container:
<div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
  <table style={{ minWidth: 700 }}>
    ...
  </table>
</div>
```

### Task 7.2 — Fix Checkout Page Tablet Layout

**`online-order-web/src/pages/CheckoutPage.tsx` (line ~138):**
```typescript
// Replace fixed 380px with responsive:
gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(300px, 380px)'
```

### Task 7.3 — Fix Menu Page Mobile Sidebar

**`online-order-web/src/pages/MenuPage.tsx`:**
- On mobile, convert the 200px category sidebar to a horizontal scrolling pill bar
- Use `display: none` on sidebar below 768px
- Show horizontal category pills instead

### Task 7.4 — Fix NotFoundPage Link

**`online-order-web/src/pages/NotFoundPage.tsx` (line ~10):**
```typescript
// Replace:
<a href="/order/">
// With:
<a href="/">
```

### Task 7.5 — Add Pagination "Per Page" Selector

**Add to all paginated admin pages:**
```typescript
<select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
  <option value={10}>10 per page</option>
  <option value={25}>25 per page</option>
  <option value={50}>50 per page</option>
  <option value={100}>100 per page</option>
</select>
```

---

## PHASE 8: STATE MANAGEMENT FIXES

### Task 8.1 — Fix Filter-Page Reset Issue

**`admin-dashboard/src/pages/OrdersPage.tsx` (line ~146):**
```typescript
// Ensure page resets to 1 when filters change:
useEffect(() => {
  setPage(1);
}, [statusFilter, typeFilter]);
```

Apply same pattern to `MenuPage.tsx` when `selectedCat` or `search` changes.

### Task 8.2 — Fix Cross-Tab Token Sync

**`online-order-web/src/components/Layout.tsx`:**
```typescript
// Add storage event listener for cross-tab sync:
useEffect(() => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === 'online_token') {
      setToken(e.newValue);
      if (!e.newValue) setCustomerName(null);
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}, []);
```

### Task 8.3 — Fix Price Consistency

**Create `apps/online-order-web/src/utils/money.ts`:**
```typescript
export function toMVR(value: unknown): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(num)) return 'MVR 0.00';
  return `MVR ${num.toFixed(2)}`;
}

export function toCents(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(num) ? 0 : Math.round(num * 100);
}
```

Replace all `parseFloat(String(...)).toFixed(2)` and `Number(...)` price conversions with these utilities.

---

## RULES

1. **Do NOT create new files** unless explicitly listed above (new pages, new utils).
2. **Do NOT refactor** working code that isn't part of this audit.
3. **Do NOT change** API response formats or database schemas unless a new feature requires it.
4. **Do NOT add** Redux, Zustand, React Query, or other state management libraries. Fix issues with existing useState/useEffect.
5. **Test every change** — ensure existing functionality still works after fixes.
6. **Preserve existing styling** — match the current visual design language (warm browns, teal accents, amber commerce colors).
7. **Commit after each phase** with a descriptive message like `fix(admin): add DOMPurify sanitization to all user-facing strings`.
8. **Keep TypeScript strict** — no `any` types, no `@ts-ignore`.

## FILE REFERENCE

### Admin Dashboard Key Files:
- `apps/admin-dashboard/src/App.tsx` — Router + auth wrapper
- `apps/admin-dashboard/src/pages/` — All 22 page components
- `apps/admin-dashboard/src/components/Layout.tsx` — Sidebar + header + Modal/Btn/Card components
- `apps/admin-dashboard/src/hooks/usePermissions.ts` — Permission checker
- `apps/admin-dashboard/src/api.ts` — Axios API client

### Online Order Web Key Files:
- `apps/online-order-web/src/App.tsx` — Router
- `apps/online-order-web/src/pages/` — All 12 page components
- `apps/online-order-web/src/components/Layout.tsx` — Header + footer + nav
- `apps/online-order-web/src/context/CartContext.tsx` — Shopping cart state
- `apps/online-order-web/src/context/SiteSettingsContext.tsx` — Theme/config
- `apps/online-order-web/src/hooks/useCheckout.ts` — Checkout logic
- `apps/online-order-web/src/api.ts` — API client

### POS Web Key Files:
- `apps/pos-web/src/App.tsx` — Main app + auth flow
- `apps/pos-web/src/components/MenuGrid.tsx` — Category/item grid
- `apps/pos-web/src/components/OrderCart.tsx` — Order composition
- `apps/pos-web/src/components/OpsPanel.tsx` — Operations panel
- `apps/pos-web/src/hooks/useCart.ts` — Cart logic
- `apps/pos-web/src/hooks/useOrderCreation.ts` — Order submission
- `apps/pos-web/src/offlineQueue.ts` — Offline order queue

### Backend Key Files:
- `backend/routes/api.php` — All API routes
- `backend/app/Http/Middleware/` — 8 middleware files
- `backend/app/Policies/` — 8 policy files
- `backend/app/Http/Controllers/Api/` — 62 controllers
- `backend/app/Http/Requests/` — 34+ form request validators
- `backend/app/Models/` — 94 Eloquent models
