# Bake & Grill — Full Refactor Prompt

> **For Cursor AI / Copilot / Claude** — Read this entire file before making changes.
> Apply changes incrementally, part by part. Test after each part.

---

## TABLE OF CONTENTS

1. [Part 1: Consolidate Roles (4 → 3)](#part-1-consolidate-roles-4--3)
2. [Part 2: Granular Per-User Permissions](#part-2-granular-per-user-permissions-owner-controlled)
3. [Part 3: Website Settings Management](#part-3-website-settings-management-owner-dashboard)
4. [Part 4: Admin Panel Layout Redesign](#part-4-admin-panel-layout-redesign)
5. [Part 5: Frontend Role & Permission Updates](#part-5-frontend-role--permission-updates)

---

## Project Context

- **Stack:** Laravel 11 backend API + React 19 frontend (Vite + TypeScript)
- **Apps:** `apps/admin-dashboard`, `apps/pos-web`, `apps/online-order-web`, `apps/kds-web`
- **Backend:** `backend/` (Laravel with Sanctum auth)
- **Admin dashboard CSS:** Currently uses inline React styles (NO Tailwind)
- **Other apps CSS:** Tailwind CSS v4
- **Theme:** Brown/Tan color scheme (`#D4813A` primary, `#1C1408` dark)
- **Current roles:** Owner, Admin, Manager, Cashier
- **Current admin sidebar:** 27 menu items in 5 groups — too cluttered

---

## PART 1: Consolidate Roles (4 → 3)

**Current roles:** Owner, Admin, Manager, Cashier
**New roles:** Owner, Manager, Staff

### 1.1 — Backend: Role Seeder

File: `backend/database/seeders/RoleSeeder.php`

- Remove the `admin` role entirely
- Rename `cashier` → `staff` (slug: `staff`, name: `Staff`, description: `Front-line staff member`)
- Keep `owner` and `manager` unchanged

### 1.2 — Backend: Migration

Create migration: `php artisan make:migration consolidate_user_roles`

```php
// Up:
// 1. Find the 'owner' role ID
// 2. Reassign all users with 'admin' role → 'owner' role
// 3. Find or create 'staff' role (slug: 'staff', name: 'Staff')
// 4. Reassign all users with 'cashier' role → 'staff' role
// 5. Delete 'admin' row from roles table
// 6. Delete 'cashier' row from roles table (if staff was created as new)
//    OR update cashier row: set slug='staff', name='Staff'

// Down:
// Reverse — recreate admin and cashier roles
```

### 1.3 — Backend: Route Middleware

Files: `backend/routes/api.php`, `backend/routes/api_finance.php`

Find and replace ALL role middleware:

| Old                                    | New                        |
| -------------------------------------- | -------------------------- |
| `role:admin,owner`                     | `role:owner`               |
| `role:owner,admin`                     | `role:owner`               |
| `role:manager,admin,owner`             | `role:manager,owner`       |
| `role:owner,admin,manager`             | `role:manager,owner`       |
| `role:cashier,manager,admin,owner`     | `role:staff,manager,owner` |
| `role:owner,admin,manager,cashier`     | `role:staff,manager,owner` |
| Any other combination with `admin`     | Replace `admin` → `owner`  |
| Any other combination with `cashier`   | Replace `cashier` → `staff`|

### 1.4 — Backend: Policies

Files: `backend/app/Policies/*.php` (all 8 policy files)

- Replace every `'admin'` slug reference → `'owner'`
- Replace every `'cashier'` slug reference → `'staff'`

### 1.5 — Backend: Controllers & Services

- Search entire `backend/app/` for strings `'admin'` and `'cashier'` used as role slugs
- Update `DemoUserSeeder.php` — create 3 demo users (owner, manager, staff)
- Update `StaffAuthController.php`, `StaffController.php`, `TimeClockController.php`, etc.

### 1.6 — Backend: Tests

Files: `backend/tests/Feature/*.php`

- Update all test files referencing `admin` or `cashier` role slugs
- Update test factories/helpers that create users with old roles

---

## PART 2: Granular Per-User Permissions (Owner-Controlled)

### 2.1 — Database: Permissions Table

Create migration: `create_permissions_table`

```
permissions table:
  - id (bigint, primary key, auto-increment)
  - name (string) — human-readable, e.g. "View Reports"
  - slug (string, unique) — e.g. "reports.view"
  - group (string) — for UI grouping, e.g. "Reports"
  - description (string, nullable) — help text
  - timestamps
```

### 2.2 — Database: Role-Permission Pivot

Create migration: `create_role_permission_table`

```
role_permission table:
  - role_id (foreign key → roles.id, cascade delete)
  - permission_id (foreign key → permissions.id, cascade delete)
  - PRIMARY KEY (role_id, permission_id)
```

### 2.3 — Database: User-Permission Override Pivot

Create migration: `create_user_permission_table`

```
user_permission table:
  - id (bigint, primary key)
  - user_id (foreign key → users.id, cascade delete)
  - permission_id (foreign key → permissions.id, cascade delete)
  - granted (boolean) — true = explicitly granted, false = explicitly denied
  - granted_by (foreign key → users.id, nullable, set null on delete)
  - timestamps
  - UNIQUE (user_id, permission_id)
```

### 2.4 — Model: Permission

File: `backend/app/Models/Permission.php`

```php
class Permission extends Model
{
    protected $fillable = ['name', 'slug', 'group', 'description'];

    public function roles() { return $this->belongsToMany(Role::class, 'role_permission'); }
    public function users() { return $this->belongsToMany(User::class, 'user_permission')->withPivot('granted', 'granted_by')->withTimestamps(); }
}
```

### 2.5 — Trait: HasPermissions

File: `backend/app/Traits/HasPermissions.php`

Add this trait to the User model. Logic:

```php
trait HasPermissions
{
    public function permissions()
    {
        return $this->belongsToMany(Permission::class, 'user_permission')
            ->withPivot('granted', 'granted_by')
            ->withTimestamps();
    }

    /**
     * Check if user has a specific permission.
     * Resolution order:
     * 1. Owner role → always true (bypass all checks)
     * 2. Check user_permission overrides (explicit grant/deny)
     * 3. Fall back to role_permission defaults
     */
    public function hasPermission(string $slug): bool
    {
        // Owner always has all permissions
        if ($this->role && $this->role->slug === 'owner') {
            return true;
        }

        // Check user-level override first
        $override = $this->permissions()->where('slug', $slug)->first();
        if ($override) {
            return (bool) $override->pivot->granted;
        }

        // Fall back to role defaults
        if ($this->role) {
            return $this->role->permissions()->where('slug', $slug)->exists();
        }

        return false;
    }

    public function grantPermission(string $slug, ?int $grantedBy = null): void { /* sync with granted=true */ }
    public function revokePermission(string $slug, ?int $grantedBy = null): void { /* sync with granted=false */ }
    public function resetPermission(string $slug): void { /* detach from user_permission */ }

    /**
     * Get all effective permissions with source info.
     * Returns: [{ slug, name, group, granted, source: 'role'|'override' }, ...]
     */
    public function getEffectivePermissions(): array { /* ... */ }
}
```

### 2.6 — Update Role Model

File: `backend/app/Models/Role.php`

```php
public function permissions()
{
    return $this->belongsToMany(Permission::class, 'role_permission');
}
```

### 2.7 — Seed Permissions

File: `backend/database/seeders/PermissionSeeder.php`

```
Group: Orders
  orders.create    — "Create Orders"
  orders.view      — "View Orders"
  orders.void      — "Void Orders"
  orders.refund    — "Process Refunds"

Group: Reports
  reports.view          — "View Reports"
  reports.sales         — "Sales Reports"
  reports.inventory     — "Inventory Reports"
  reports.financial     — "Financial Reports"
  reports.xreport       — "X-Report"
  reports.zreport       — "Z-Report"

Group: Inventory
  inventory.view       — "View Inventory"
  inventory.manage     — "Manage Inventory"
  inventory.categories — "Manage Categories"

Group: Menu
  menu.view    — "View Menu"
  menu.manage  — "Manage Menu Items"

Group: Staff
  staff.view     — "View Staff"
  staff.create   — "Create Staff"
  staff.update   — "Update Staff"
  staff.delete   — "Delete Staff"
  staff.schedule — "Manage Schedules"

Group: Finance
  finance.view        — "View Finances"
  finance.invoices    — "Manage Invoices"
  finance.expenses    — "Manage Expenses"
  finance.cash_manage — "Cash Management"
  finance.profit_loss — "View Profit & Loss"

Group: Promotions
  promotions.view      — "View Promotions"
  promotions.manage    — "Manage Promotions"
  promotions.discounts — "Apply Discounts"

Group: Customers
  customers.view      — "View Customers"
  customers.manage    — "Manage Customers"
  customers.analytics — "Customer Analytics"

Group: Loyalty
  loyalty.view   — "View Loyalty Program"
  loyalty.manage — "Manage Loyalty Program"

Group: Reservations
  reservations.view   — "View Reservations"
  reservations.manage — "Manage Reservations"

Group: Delivery
  delivery.view   — "View Deliveries"
  delivery.manage — "Manage Deliveries"

Group: Devices
  devices.view   — "View Devices"
  devices.manage — "Manage Devices"

Group: Integrations
  integrations.xero     — "Xero Integration"
  integrations.webhooks — "Manage Webhooks"
  integrations.sms      — "SMS Campaigns"

Group: Website
  website.manage — "Manage Website Settings"

Group: Suppliers
  suppliers.view      — "View Suppliers"
  suppliers.manage    — "Manage Suppliers"
  suppliers.purchases — "Manage Purchases"
```

**Default role → permission mapping:**

- **Owner:** ALL permissions (but also bypasses checks via trait logic)
- **Manager:** Everything EXCEPT `staff.create`, `staff.delete`, `devices.manage`, `integrations.xero`, `integrations.webhooks`, `website.manage`
- **Staff:** `orders.create`, `orders.view`, `reports.view`, `inventory.view`, `menu.view`, `customers.view`, `suppliers.view`, `delivery.view`, `reservations.view`, `loyalty.view`

### 2.8 — Middleware: RequirePermission

File: `backend/app/Http/Middleware/RequirePermission.php`

```php
class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated'], 401);
        }

        foreach ($permissions as $permission) {
            if (!$user->hasPermission($permission)) {
                return response()->json(['message' => 'Insufficient permissions'], 403);
            }
        }

        return $next($request);
    }
}
```

Register as `'permission'` alias in `bootstrap/app.php`.

### 2.9 — API Endpoints for Permission Management

File: `backend/app/Http/Controllers/Api/PermissionController.php`

Routes (Owner only — `role:owner` middleware):

```
GET    /api/permissions                  → index()    — list all permissions, grouped
GET    /api/users/{user}/permissions     → show()     — user's effective permissions with source
PUT    /api/users/{user}/permissions     → update()   — bulk update user overrides
```

**PUT request body:**
```json
{
  "permissions": {
    "reports.view": true,
    "orders.void": false,
    "inventory.manage": null
  }
}
```
- `true` = explicitly grant
- `false` = explicitly deny
- `null` = remove override (revert to role default)

---

## PART 3: Website Settings Management (Owner Dashboard)

### 3.1 — Database: Site Settings Table

Create migration: `create_site_settings_table`

```
site_settings table:
  - id (bigint, primary key)
  - key (string, unique) — e.g. "site_name"
  - value (text, nullable) — the stored value
  - type (string) — one of: text, textarea, image, color, json, boolean
  - group (string) — UI grouping: "General", "Branding", "Footer", "Social", "SEO"
  - label (string) — human-readable form label
  - description (string, nullable) — help text for the form
  - is_public (boolean, default true) — exposed to public API or not
  - timestamps
```

### 3.2 — Model: SiteSetting

File: `backend/app/Models/SiteSetting.php`

```php
class SiteSetting extends Model
{
    protected $fillable = ['key', 'value', 'type', 'group', 'label', 'description', 'is_public'];

    // Static helpers with caching
    public static function get(string $key, $default = null): mixed
    {
        return Cache::rememberForever("site_setting.{$key}", function () use ($key, $default) {
            $setting = static::where('key', $key)->first();
            return $setting ? $setting->value : $default;
        });
    }

    public static function set(string $key, $value): void
    {
        static::where('key', $key)->update(['value' => $value]);
        Cache::forget("site_setting.{$key}");
        Cache::forget('site_settings.public');
    }

    public static function getGroup(string $group): Collection { /* ... */ }

    public static function allPublic(): array
    {
        return Cache::rememberForever('site_settings.public', function () {
            return static::where('is_public', true)->pluck('value', 'key')->toArray();
        });
    }
}
```

### 3.3 — Seed Default Settings

File: `backend/database/seeders/SiteSettingsSeeder.php`

```
Group: General
  site_name        (text)     — "Bake & Grill"
  site_tagline     (text)     — "Fresh Baked, Fire Grilled"
  business_email   (text)     — ""
  business_phone   (text)     — ""
  business_address (textarea) — ""
  business_hours   (json)     — {"mon":"8:00 AM - 8:00 PM","tue":"8:00 AM - 8:00 PM",...,"sun":"Closed"}

Group: Branding
  logo             (image)    — null
  logo_dark        (image)    — null
  favicon          (image)    — null
  primary_color    (color)    — "#D4813A"
  secondary_color  (color)    — "#1C1408"
  accent_color     (color)    — "#F5E6D3"

Group: Footer
  footer_text      (textarea) — "© 2026 Bake & Grill. All rights reserved."
  footer_links     (json)     — [{"label":"Privacy Policy","url":"/privacy"},{"label":"Terms","url":"/terms"}]
  show_social_links (boolean) — true

Group: Social Media
  social_facebook  (text)     — ""
  social_instagram (text)     — ""
  social_twitter   (text)     — ""
  social_tiktok    (text)     — ""
  social_youtube   (text)     — ""

Group: SEO
  meta_title       (text)     — "Bake & Grill — Fresh Baked, Fire Grilled"
  meta_description (textarea) — "Your neighborhood cafe serving freshly baked goods and fire-grilled favorites."
  og_image         (image)    — null
```

### 3.4 — API Endpoints

File: `backend/app/Http/Controllers/Api/SiteSettingsController.php`

```
GET  /api/site-settings/public   → public()  — NO auth, returns all is_public=true settings as key:value
GET  /api/site-settings          → index()   — Owner only, returns all settings grouped (for admin form)
PUT  /api/site-settings          → update()  — Owner only, bulk update settings
POST /api/site-settings/upload   → upload()  — Owner only, image upload (logo, favicon, og_image)
```

**PUT body:**
```json
{
  "settings": {
    "site_name": "My Cafe",
    "footer_text": "© 2026 My Cafe",
    "show_social_links": true
  }
}
```

**POST upload:**
- Multipart form: `file` + `key` (e.g. "logo")
- Validate: png, jpg, jpeg, svg, ico — max 2MB
- Store in: `storage/app/public/site/`
- Return: `{ "url": "/storage/site/logo_xxxxx.png" }`
- Bust all related caches on update

### 3.5 — Frontend: useSiteSettings Hook

File: `apps/admin-dashboard/src/hooks/useSiteSettings.ts` (and shared with other apps)

```typescript
// Context provider that loads GET /api/site-settings/public on app boot
// Provides: { settings, loading, error, refresh }
// Usage: const { settings } = useSiteSettings();
//        settings.site_name, settings.logo, etc.
```

Replace all hardcoded site name, logo references, footer text, and colors with dynamic values from this hook.

Apply `primary_color` and `secondary_color` as CSS custom properties on `:root`.

---

## PART 4: Admin Panel Layout Redesign

### 4.1 — Problems with Current Layout

1. **27 menu items** in sidebar — way too many, overwhelming for a small cafe
2. **Inline styles everywhere** — hard to maintain, inconsistent with other apps using Tailwind
3. **No visual hierarchy** — all menu items look the same, no clear grouping
4. **Mobile drawer** is just a copy of the desktop sidebar — not optimized for touch
5. **No breadcrumbs or page context** — users get lost in deep pages
6. **No quick actions** — common tasks require multiple clicks
7. **Emoji icons** — unprofessional, inconsistent rendering across devices

### 4.2 — Design Principles

- **Clean & minimal** — white/light backgrounds with brown accent colors
- **Card-based** — content organized in cards with clear spacing
- **Touch-friendly** — large tap targets, swipe gestures on mobile
- **Progressive disclosure** — show only what's needed, reveal more on demand
- **Consistent** — migrate to Tailwind CSS v4 (match pos-web and online-order-web)

### 4.3 — Color System (CSS Custom Properties)

```css
:root {
  /* Brand */
  --color-primary: #D4813A;        /* Warm brown-orange */
  --color-primary-light: #E8A66A;
  --color-primary-dark: #B5692E;

  /* Neutrals */
  --color-bg: #F8F6F3;             /* Warm off-white page background */
  --color-surface: #FFFFFF;         /* Cards, panels */
  --color-surface-hover: #FDF8F4;   /* Hover state */
  --color-border: #E8E0D8;          /* Subtle warm borders */
  --color-border-light: #F0EBE5;

  /* Text */
  --color-text: #1C1408;            /* Dark brown — primary text */
  --color-text-secondary: #6B5D4F;  /* Muted brown — secondary text */
  --color-text-tertiary: #9C8E7E;   /* Light brown — placeholder/hint */

  /* Sidebar */
  --color-sidebar-bg: #1C1408;      /* Dark brown */
  --color-sidebar-text: #C4B5A3;
  --color-sidebar-active: #D4813A;
  --color-sidebar-hover: rgba(212, 129, 58, 0.1);

  /* Status */
  --color-success: #22C55E;
  --color-warning: #F59E0B;
  --color-danger: #EF4444;
  --color-info: #3B82F6;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(28, 20, 8, 0.05);
  --shadow-md: 0 4px 12px rgba(28, 20, 8, 0.08);
  --shadow-lg: 0 8px 24px rgba(28, 20, 8, 0.12);
}
```

### 4.4 — Desktop Layout (≥1024px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐ ┌─────────────────────────────────────────────────────┐ │
│ │          │ │  Header Bar                                        │ │
│ │          │ │  ┌───────────────────────────┐  ┌──────┐ ┌──────┐ │ │
│ │  SIDEBAR │ │  │ 🔍 Search anything...     │  │ 🔔   │ │ Avatar│ │ │
│ │          │ │  └───────────────────────────┘  └──────┘ └──────┘ │ │
│ │  Logo    │ ├─────────────────────────────────────────────────────┤ │
│ │          │ │                                                     │ │
│ │  ─────── │ │  Page Title              [Action Button]            │ │
│ │          │ │  Breadcrumb > Trail                                 │ │
│ │  Ops     │ │                                                     │ │
│ │   Dash   │ │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │ │
│ │   Orders │ │  │  Stat Card  │ │  Stat Card  │ │  Stat Card  │  │ │
│ │   Kitchen│ │  │  ↑ 12.5%    │ │  ↓ 3.2%    │ │  → 0%       │  │ │
│ │   Deliver│ │  └─────────────┘ └─────────────┘ └─────────────┘  │ │
│ │          │ │                                                     │ │
│ │  Business│ │  ┌───────────────────────┐ ┌─────────────────────┐ │ │
│ │   Menu   │ │  │                       │ │                     │ │ │
│ │   Promos │ │  │   Main Content Area   │ │   Side Panel /      │ │ │
│ │   Loyalty│ │  │   (Tables, Charts,    │ │   Quick Info        │ │ │
│ │   SMS    │ │  │    Forms, etc.)       │ │                     │ │ │
│ │          │ │  │                       │ │                     │ │ │
│ │  Finance │ │  └───────────────────────┘ └─────────────────────┘ │ │
│ │   Reports│ │                                                     │ │
│ │   P&L    │ │                                                     │ │
│ │   Invoic │ │                                                     │ │
│ │          │ │                                                     │ │
│ │  ─────── │ │                                                     │ │
│ │  Settings│ │                                                     │ │
│ └──────────┘ └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Sidebar Details (Desktop):**
- Width: 240px expanded / 64px collapsed (icon-only)
- Fixed position, full height
- Logo at top (uses dynamic logo from site settings)
- Collapsible with smooth animation
- Navigation grouped with collapsible section headers

**Reorganized Navigation (17 items in 4 groups, down from 27):**

```
─── OPERATIONS
    📊  Dashboard
    📋  Orders
    👨‍🍳  Kitchen Display
    🚚  Delivery

─── BUSINESS
    🍽️  Menu
    📦  Inventory & Suppliers      ← combined: inventory + suppliers + purchases
    🎯  Marketing                  ← combined: promotions + loyalty + SMS
    📅  Reservations

─── FINANCE
    📈  Reports & Analytics        ← combined: reports + analytics
    💰  Revenue                    ← combined: invoices + P&L
    💸  Expenses
    📉  Forecasts

─── MANAGEMENT (Owner/Manager only)
    👥  Staff & Schedules          ← combined: staff + schedules
    ⚙️  Settings                   ← NEW: hub for website settings, devices, permissions, webhooks
```

**Key changes:**
- **27 → 14 top-level items** by combining related pages
- Combined pages use **tabs or sub-navigation** within the page (not nested sidebar menus)
- `Settings` becomes a hub page with sub-pages: Website, Devices, Permissions, Integrations
- Use **Lucide React icons** instead of emojis (professional, consistent, tree-shakable)

**Sidebar active state:**
- Active item: left border accent (`4px solid var(--color-primary)`), background highlight
- Hover: subtle background shift
- Section headers: uppercase, small, muted text

**Header Bar:**
- Height: 56px
- Global search (Command+K / Ctrl+K to focus)
- Notification bell with badge count
- User avatar + dropdown (profile, switch role view, logout)
- Breadcrumbs below header, inside content area

### 4.5 — Tablet Layout (768px – 1023px)

```
┌────────────────────────────────────────────────┐
│ ┌────┐ ┌──────────────────────────────────────┐│
│ │Icon│ │  Header (same as desktop)            ││
│ │Bar │ ├──────────────────────────────────────┤│
│ │    │ │                                      ││
│ │ 📊 │ │  Content area                        ││
│ │ 📋 │ │  (full width, responsive grid)       ││
│ │ 👨‍🍳 │ │                                      ││
│ │ 🚚 │ │  Cards stack in 2-column grid        ││
│ │ ── │ │                                      ││
│ │ 🍽️ │ │                                      ││
│ │ 📦 │ │                                      ││
│ │ 🎯 │ │                                      ││
│ │ 📅 │ │                                      ││
│ │ ── │ │                                      ││
│ │ 📈 │ │                                      ││
│ │ 💰 │ │                                      ││
│ │ 💸 │ │                                      ││
│ │ ── │ │                                      ││
│ │ 👥 │ │                                      ││
│ │ ⚙️ │ │                                      ││
│ └────┘ └──────────────────────────────────────┘│
└────────────────────────────────────────────────┘
```

- Sidebar: icon-only mode (64px), shows tooltip on hover
- Expand to full sidebar on hover or hamburger tap
- Content area uses 2-column grid for cards

### 4.6 — Mobile Layout (<768px)

```
┌─────────────────────────────┐
│  ☰  Bake & Grill    🔔  👤  │  ← Sticky top bar (56px)
├─────────────────────────────┤
│                             │
│  Good morning, Sarah 👋     │  ← Greeting (dashboard only)
│                             │
│  ┌─────────┐ ┌─────────┐   │  ← Quick action cards
│  │ New     │ │ Orders  │   │
│  │ Order   │ │ Today:12│   │
│  └─────────┘ └─────────┘   │
│  ┌─────────┐ ┌─────────┐   │
│  │ Revenue │ │ Kitchen │   │
│  │ $1,234  │ │ Queue:3 │   │
│  └─────────┘ └─────────┘   │
│                             │
│  Page Content               │
│  (single column, stacked)   │
│                             │
│                             │
├─────────────────────────────┤
│  📊    📋    🍽️    💰    ⚙️  │  ← Bottom tab bar (fixed)
│ Dash  Orders Menu  Money  More│
└─────────────────────────────┘
```

**Mobile-specific:**
- **NO sidebar** — replaced by bottom tab bar (5 most-used items)
- **"More" tab** → opens full-screen menu with all navigation grouped
- **Sticky top bar:** hamburger (opens full menu), app name/logo, notification bell, user avatar
- **Bottom tab bar:** 56px height, 5 tabs with icon + label
  - Dashboard, Orders, Menu, Money (reports), More
- **"More" full-screen menu:**

```
┌─────────────────────────────┐
│  ✕ Close            Search  │
├─────────────────────────────┤
│                             │
│  OPERATIONS                 │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ KDS │ │Deliv│ │Rsrvn│  │
│  └─────┘ └─────┘ └─────┘  │
│                             │
│  BUSINESS                   │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │Invnt│ │Promo│ │Loyal│  │
│  └─────┘ └─────┘ └─────┘  │
│                             │
│  FINANCE                    │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ P&L │ │Expns│ │Frcst│  │
│  └─────┘ └─────┘ └─────┘  │
│                             │
│  MANAGEMENT                 │
│  ┌─────┐ ┌─────┐           │
│  │Staff│ │Sttng│           │
│  └─────┘ └─────┘           │
│                             │
│  ┌─────────────────────────┐│
│  │  🚪 Log Out             ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

- Grid of icon cards — large touch targets (min 48x48)
- Grouped with section headers
- Search bar at top to find any page quickly

### 4.7 — Settings Hub Page (NEW)

Route: `/settings` — accessible to Owner only (Manager sees limited view)

```
┌─────────────────────────────────────────────────────┐
│  Settings                                            │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ 🌐       │ │ 👥       │ │ 📱       │ │ 🔗     │ │
│  │ Website  │ │ Roles &  │ │ Devices  │ │ Integr-│ │
│  │ Settings │ │ Permiss. │ │          │ │ ations │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│                                                      │
│  Below: Content of selected settings sub-page        │
│  Uses tabs or card-based navigation                  │
└─────────────────────────────────────────────────────┘
```

**Sub-pages:**
- `/settings/website` — site name, logo, favicon, colors, footer, social, SEO (from Part 3)
- `/settings/permissions` — manage role defaults & per-user permission overrides
- `/settings/devices` — register/enable/disable POS devices
- `/settings/integrations` — Xero, Webhooks, SMS provider config

### 4.8 — Website Settings Page Layout

Route: `/settings/website`

```
┌─────────────────────────────────────────────────────┐
│  ← Settings  /  Website Settings                     │
│                                                      │
│  [General] [Branding] [Footer] [Social] [SEO]       │  ← Tab bar
│                                                      │
│  ┌─ General ────────────────────────────────────────┐│
│  │                                                   ││
│  │  Site Name           [Bake & Grill          ]    ││
│  │                                                   ││
│  │  Tagline             [Fresh Baked, Fire...  ]    ││
│  │                                                   ││
│  │  Business Email      [hello@bakeandgrill.com]    ││
│  │                                                   ││
│  │  Business Phone      [+1 (555) 123-4567     ]    ││
│  │                                                   ││
│  │  Address             ┌───────────────────────┐   ││
│  │                      │ 123 Main Street       │   ││
│  │                      │ Suite 100             │   ││
│  │                      └───────────────────────┘   ││
│  │                                                   ││
│  │  Business Hours      ┌───────────────────────┐   ││
│  │                      │ Mon  [8:00AM] [8:00PM]│   ││
│  │                      │ Tue  [8:00AM] [8:00PM]│   ││
│  │                      │ ...                   │   ││
│  │                      │ Sun  [Closed] toggle  │   ││
│  │                      └───────────────────────┘   ││
│  │                                                   ││
│  │             [Cancel]  [💾 Save Changes]           ││
│  └───────────────────────────────────────────────────┘│
│                                                      │
│  ┌─ Branding (when tab selected) ───────────────────┐│
│  │                                                   ││
│  │  Logo          ┌──────────┐                      ││
│  │                │  Preview │  [Upload New]         ││
│  │                │  current │  [Remove]             ││
│  │                └──────────┘                       ││
│  │                                                   ││
│  │  Dark Logo     ┌──────────┐                      ││
│  │                │  Preview │  [Upload New]         ││
│  │                └──────────┘                       ││
│  │                                                   ││
│  │  Favicon       ┌────┐                             ││
│  │                │ Fav│  [Upload New]               ││
│  │                └────┘  (.ico, .png — 32x32)       ││
│  │                                                   ││
│  │  Colors        ┌───┐ Primary    #D4813A          ││
│  │                │   │ ──────────────────           ││
│  │                └───┘                              ││
│  │                ┌───┐ Secondary  #1C1408           ││
│  │                │   │ ──────────────────           ││
│  │                └───┘                              ││
│  │                ┌───┐ Accent     #F5E6D3           ││
│  │                │   │ ──────────────────           ││
│  │                └───┘                              ││
│  │                                                   ││
│  │  Preview:  [Live mini-preview of logo + colors]   ││
│  │                                                   ││
│  │             [Cancel]  [💾 Save Changes]           ││
│  └───────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 4.9 — Permission Management Page Layout

Route: `/settings/permissions`

```
┌─────────────────────────────────────────────────────┐
│  ← Settings  /  Roles & Permissions                  │
│                                                      │
│  ┌─ Role Defaults ──────────────────────────────────┐│
│  │  [Owner ▾]  [Manager ▾]  [Staff ▾]              ││
│  │                                                   ││
│  │  Currently editing: Manager                       ││
│  │                                                   ││
│  │  ☑ Orders          ☑ View  ☑ Create  ☐ Void     ││
│  │  ☑ Reports         ☑ View  ☑ Sales   ☐ Financial││
│  │  ☑ Inventory       ☑ View  ☐ Manage              ││
│  │  ...                                              ││
│  └───────────────────────────────────────────────────┘│
│                                                      │
│  ┌─ User Overrides ─────────────────────────────────┐│
│  │  Select staff member:  [Sarah - Staff      ▾]    ││
│  │                                                   ││
│  │  Base role: Staff                                 ││
│  │  Custom overrides: 2                              ││
│  │                                                   ││
│  │  Group        Permission        Default  Override ││
│  │  ─────────────────────────────────────────────── ││
│  │  Orders       View Orders       ✅ role   —      ││
│  │  Orders       Create Orders     ✅ role   —      ││
│  │  Orders       Void Orders       ❌ role   [✅]   ││  ← overridden to GRANT
│  │  Reports      View Reports      ✅ role   —      ││
│  │  Reports      Sales Reports     ❌ role   [✅]   ││  ← overridden to GRANT
│  │  Reports      Financial Reports ❌ role   —      ││
│  │  Inventory    View Inventory    ✅ role   —      ││
│  │  Inventory    Manage Inventory  ❌ role   —      ││
│  │  ...                                              ││
│  │                                                   ││
│  │  [Reset All to Defaults]  [💾 Save Overrides]    ││
│  └───────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 4.10 — Component Library (Shared)

Migrate the admin dashboard from inline styles to Tailwind CSS v4. Create these reusable components:

```
src/components/ui/
  ├── Button.tsx          — primary, secondary, danger, ghost variants + sizes
  ├── Card.tsx            — surface card with optional header, padding, shadow
  ├── Input.tsx           — text input with label, error, helper text
  ├── Select.tsx          — dropdown with label and error state
  ├── Toggle.tsx          — boolean toggle switch
  ├── Badge.tsx           — status badge (success, warning, danger, info, neutral)
  ├── Modal.tsx           — centered modal with overlay, sizes (sm, md, lg)
  ├── Toast.tsx           — toast notification system (success, error, info)
  ├── Tabs.tsx            — horizontal tab bar with content panels
  ├── Table.tsx           — responsive data table with sorting, pagination
  ├── Dropdown.tsx        — dropdown menu (for user avatar menu, etc.)
  ├── Breadcrumb.tsx      — breadcrumb trail from route hierarchy
  ├── SearchInput.tsx     — global search with Command+K shortcut
  ├── FileUpload.tsx      — drag & drop file upload with preview
  ├── ColorPicker.tsx     — color input with hex value
  ├── Skeleton.tsx        — loading skeleton placeholder
  └── EmptyState.tsx      — empty state with icon, title, description, action
```

### 4.11 — Install Lucide React for Icons

```bash
cd apps/admin-dashboard && npm install lucide-react
```

Replace all emoji icons in navigation with Lucide icons:

```typescript
import {
  LayoutDashboard, ClipboardList, ChefHat, Truck,
  UtensilsCrossed, Package, Target, CalendarDays,
  BarChart3, DollarSign, Receipt, TrendingDown,
  Users, Settings, Bell, Search, LogOut, Menu, X,
  Globe, Shield, Smartphone, Link2, Upload, Palette
} from 'lucide-react';
```

---

## PART 5: Frontend Role & Permission Updates

### 5.1 — Remove Admin & Cashier References

- Search all frontend code for `"admin"`, `"cashier"`, `Admin`, `Cashier`
- Replace with `"owner"` / `"staff"` / `Owner` / `Staff` as appropriate
- Update role dropdowns, guards, conditional renders

### 5.2 — Update RoleGuard Component

File: `apps/admin-dashboard/src/App.tsx`

- Update `RoleGuard` to check `allowedRoles` against new role slugs
- Add a `PermissionGuard` wrapper that checks `user.hasPermission(slug)`
- For routes that need fine-grained control, use `PermissionGuard` instead of `RoleGuard`

### 5.3 — Permission-Aware UI

- Create a `usePermissions()` hook that fetches the current user's effective permissions
- Components should conditionally render based on permissions, not just roles
- Example: `{can('reports.view') && <ReportsLink />}`
- Sidebar navigation items should be filtered by the user's effective permissions

### 5.4 — Staff Management Updates

- Role dropdown: show only Owner, Manager, Staff
- Add "Permissions" tab to staff detail/edit page
- Show permission grid with override toggles (Owner only)

---

## Implementation Order

Execute in this order to avoid breaking changes:

1. **Part 1** — Role consolidation (backend migration + seeder + middleware + policies)
2. **Part 2** — Permission system (database + models + trait + seeder + API)
3. **Part 4.10-4.11** — Component library + Tailwind migration + Lucide icons
4. **Part 4.4-4.9** — Layout redesign (sidebar, header, mobile, settings pages)
5. **Part 3** — Website settings (database + API + frontend page)
6. **Part 5** — Frontend permission integration

---

## Do NOT:

- Delete the `roles` table — permissions layer works ON TOP of roles
- Remove Sanctum auth — keep existing auth flow
- Change the API URL structure for existing endpoints (add new ones alongside)
- Break the POS app, Online Order app, or KDS app — changes are admin-dashboard focused
- Add any external component library (MUI, Chakra, etc.) — use Tailwind + custom components
- Skip form validation — validate everything server-side with Form Request classes
- Forget to bust cache when site settings are updated
