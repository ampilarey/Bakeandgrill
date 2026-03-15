# Admin Panel Full Audit Report

**Date:** March 15, 2026
**Scope:** Complete audit of `/apps/admin-dashboard/` — bugs, missing features, layout, UX, mobile responsiveness

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Missing Navigation Links (7 Hidden Pages)](#2-missing-navigation-links)
3. [Missing Features (Backend Exists, No Admin UI)](#3-missing-features-not-connected-to-panel)
4. [Bugs Found](#4-bugs-found)
5. [Mobile & Responsive Issues](#5-mobile--responsive-issues)
6. [UX & Layout Recommendations](#6-ux--layout-recommendations)
7. [Page-by-Page Audit](#7-page-by-page-audit)
8. [Prioritized Action Plan](#8-prioritized-action-plan)

---

## 1. Executive Summary

The admin panel has **22 pages** but **only 16 are accessible from the sidebar**. Key features like **SMS, Loyalty, Analytics, Profit & Loss, Supplier Intelligence, and Webhooks** have working pages but are **invisible** — users can't find them. Multiple backend features like **Gift Cards, Reviews, Daily Specials, Staff Scheduling, Inventory Management, Waste Logs, and Tables** have full API endpoints but **zero admin UI**.

The mobile experience has **critical issues** — fixed-width drawers, non-responsive grids, and touch targets below WCAG standards. The desktop layout is functional but could be modernized significantly.

### Key Numbers

| Metric | Count |
|--------|-------|
| Total admin pages | 22 |
| Pages in sidebar navigation | 16 |
| **Hidden pages (no nav link)** | **7** |
| Backend features with NO admin page | **10+** |
| Critical bugs found | 7 |
| Mobile/responsive issues | 18 |

---

## 2. Missing Navigation Links

These pages **exist and work** but have **no sidebar link** — users cannot discover them:

| Page | Route | What It Does | Priority |
|------|-------|-------------|----------|
| **SMS** | `/sms` | SMS campaign management & delivery logs | **HIGH** |
| **Loyalty** | `/loyalty` | Customer loyalty accounts & point adjustments | **HIGH** |
| **Analytics** | `/analytics` | Peak hours, retention, profitability, customer LTV | **HIGH** |
| **Profit & Loss** | `/profit-loss` | P&L statements, gross margin, cash flow | **HIGH** |
| **Supplier Intelligence** | `/supplier-intelligence` | Supplier performance ratings & price comparison | MEDIUM |
| **Webhooks** | `/webhooks` | Webhook subscriptions & logs (Owner only) | LOW |
| **Test Checklist** | `/checklist` | QA testing checklist (Owner only, dev tool) | LOW |

### Recommended Fix

Add these to the sidebar navigation in `Layout.tsx`:

```
BUSINESS group:
  - Add "Loyalty" → /loyalty (with Heart icon)
  - Move "Marketing" label to a sub-group or rename to "Promotions"
  - Add "SMS Campaigns" → /sms (with MessageSquare icon)

FINANCE group:
  - Add "Profit & Loss" → /profit-loss (with PieChart icon)
  - Add "Suppliers" → /supplier-intelligence (with Factory icon)

MANAGEMENT group:
  - Add "Analytics" → /analytics (with BarChart icon)
  - Add "Webhooks" → /webhooks (Owner only, with Webhook icon)
```

---

## 3. Missing Features (Not Connected to Panel)

These features have **full backend API endpoints** but **NO admin dashboard page**:

### HIGH Priority — Revenue & Customer Impact

| Feature | Backend Endpoints | What's Missing |
|---------|-------------------|----------------|
| **Gift Cards** | `GET/POST /admin/gift-cards`, `POST /admin/gift-cards/issue` | No page to create, view, or manage gift cards |
| **Reviews/Ratings** | `GET/POST/DELETE /admin/reviews`, `PATCH /admin/reviews/{id}/moderate` | No page to view/moderate customer reviews |
| **Daily Specials** | `GET/POST/DELETE /admin/specials` | No page to manage daily specials |
| **Inventory Management** | `GET/POST /inventory-categories`, `GET/POST /unit-conversions` | No dedicated inventory page (only purchase orders) |
| **Waste Logging** | `POST /waste-logs`, `GET /waste-logs/summary` | No waste tracking page |

### MEDIUM Priority — Operations

| Feature | Backend Endpoints | What's Missing |
|---------|-------------------|----------------|
| **Staff Scheduling** | `GET/POST/DELETE /admin/schedules` | No scheduling UI (sidebar says "Staff & Schedules" but page only has staff CRUD) |
| **Table Management** | `GET/POST /tables`, `PATCH /tables/{id}` | No table layout management page |
| **Referral Program** | `GET /admin/referrals` | No referral tracking page |
| **Xero Integration** | `GET /xero/connect`, `/status`, `/disconnect`, `/logs` | No Xero management UI (Settings redirects but no actual page) |
| **Permission Management** | `GET /permissions`, `GET/PUT /users/{user}/permissions` | No fine-grained permission editor |

### LOW Priority — Operational

| Feature | Backend Endpoints | What's Missing |
|---------|-------------------|----------------|
| **Cash Movements** | `POST /shifts/{id}/cash-movements` | No cash drawer tracking UI |
| **Time Clock** | `POST /time-clock/punch` | No time punch UI |
| **Low Stock Alerts** | `GET /low-stock-alerts` | No alerts dashboard |
| **Receipt Feedback** | `GET /receipts/{id}/feedback` | No customer feedback view |

---

## 4. Bugs Found

### Critical Bugs

| # | Page | Issue | Line |
|---|------|-------|------|
| 1 | **ProfitLossPage** | Division by zero: `Math.abs(row.value) / pnl.revenue.gross * 100` when gross = 0 | ~99 |
| 2 | **SettingsPage** | Crash: `HUB_CARDS.find((c) => c.id === active)!` non-null assertion without validation | ~376 |
| 3 | **WebhooksPage** | Security: `alert()` exposes webhook secret key in browser — should copy to clipboard | ~194 |
| 4 | **KDSPage** | "Ready" column is hardcoded as empty array, never populated from API | ~57 |
| 5 | **SmsPage** | SMS segment calculation ignores Unicode encoding (160 GSM vs 70 Unicode chars) | ~183 |
| 6 | **ReportsPage** | `useEffect` missing dependency — doesn't reload when date filters change | ~24 |
| 7 | **InvoicesPage** | Filter bug: empty string is falsy, so "All" filter option is silently ignored | ~22 |

### Medium Bugs

| # | Page | Issue |
|---|------|-------|
| 8 | **PromotionsPage** | Percentage validation missing negative number check |
| 9 | **LoyaltyPage** | `parseInt(delta)` doesn't handle NaN — no validation before API call |
| 10 | **ExpensesPage** | `parseInt(form.expense_category_id)` can produce NaN |
| 11 | **OrdersPage** | Auto-refresh creates multiple intervals due to stale closures |
| 12 | **PurchaseOrdersPage** | Query params not URL-encoded in API call |
| 13 | **MenuPage** | Dead code: `{false && (<img...>)}` — image preview disabled |
| 14 | **KDSPage** | `urgencyColor()` appends '22' to hex, assumes 6-char format |
| 15 | **ProfitLossPage** | Loads `getDailySummary(today())` instead of selected date range |

---

## 5. Mobile & Responsive Issues

### Critical (Unusable on Mobile)

| Issue | File | Details |
|-------|------|---------|
| **Fixed 420px drawer** | OrdersPage.tsx | Order detail drawer is 420px fixed — overflows on mobile screens |
| **KDS 3-column grid** | KDSPage.tsx | Hardcoded `repeat(3, 1fr)` — columns become ~80px wide on mobile |
| **No @media queries** | index.css | Entire CSS file has ZERO mobile breakpoints |
| **Menu form grids** | MenuPage.tsx | 2-column and 3-column grids never collapse to single column |

### High (Poor Mobile Experience)

| Issue | File | Details |
|-------|------|---------|
| Tables overflow horizontally | OrdersPage, PurchaseOrdersPage | No horizontal scroll indicators |
| Modal padding fixed at 28px | MenuPage | Leaves only ~264px for content on 320px screens |
| "More" drawer is 3-column | Layout.tsx | Too cramped on small phones — should be 2-column |
| Button touch targets < 48px | Button.tsx, SharedUI.tsx | Small buttons are 32px height (WCAG minimum: 48px) |
| Select inputs too small | SharedUI.tsx | 36px height, hard to tap on mobile |

### Medium

| Issue | File | Details |
|-------|------|---------|
| Z-index conflicts | Layout.tsx | Modal overlay (50) same as mobile menu overlay (50) |
| Sidebar collapse button z-index | Layout.tsx | z-index: 10, behind sidebar at z-index: 30 |
| Card padding not responsive | Card.tsx | Static padding, not viewport-aware |
| Image upload not stacking | MenuPage.tsx | Input + button side-by-side cramped on mobile |
| Inconsistent responsive approach | SettingsPage vs others | Only SettingsPage uses Tailwind breakpoints, rest use inline styles |

---

## 6. UX & Layout Recommendations

### Navigation Redesign

**Current Problem:** 16 items in sidebar + 7 hidden pages = features are hard to find.

**Recommendation: Grouped navigation with expandable sections**

```
OPERATIONS
  Dashboard
  Orders
  Kitchen Display
  Delivery

MENU & INVENTORY
  Menu Items
  Inventory
  Purchase Orders
  Daily Specials
  Waste Tracking

CUSTOMERS & MARKETING
  Loyalty Program
  SMS Campaigns
  Promotions & Discounts
  Gift Cards
  Reviews & Ratings
  Reservations

FINANCE & REPORTS
  Dashboard / Reports
  Invoices
  Expenses
  Profit & Loss
  Forecasts
  Supplier Intelligence

STAFF & OPERATIONS
  Staff Management
  Scheduling
  Analytics
  Table Management

SYSTEM (Owner only)
  Settings
  Webhooks
  Permissions
  Xero Integration
```

### Modern Dashboard Ideas

1. **Real-time order ticker** — Live feed of incoming orders on dashboard
2. **Quick action cards** — "Create Promo", "Send SMS", "Issue Gift Card" on dashboard
3. **Notification center** — Bell icon with low stock alerts, pending reviews, overdue invoices
4. **Global search** — Cmd+K to search orders, customers, menu items, invoices
5. **Dark mode toggle** — Warm dark theme matching the brown palette
6. **Breadcrumbs** — For nested pages like Settings sub-pages
7. **Drag & drop** — Menu category reordering, table layout builder
8. **Data export** — CSV/PDF export buttons on all report pages
9. **Activity feed** — Recent actions by all staff (audit log viewer)
10. **Contextual help tooltips** — Info icons explaining metrics

### Desktop Layout Improvements

1. **Wider sidebar on desktop** (240px → 260px) with better grouping and collapsible sections
2. **Sticky table headers** on scroll for long data tables
3. **Side-by-side comparison** on reports pages (e.g., this week vs last week)
4. **Inline editing** on menu items and staff pages (click cell to edit)
5. **Multi-select actions** — Bulk operations on orders, invoices, SMS

### Mobile Layout Improvements

1. **Card-based layouts** instead of tables on mobile
2. **Swipe actions** on list items (swipe to complete, archive, etc.)
3. **Bottom sheet modals** instead of centered modals on mobile
4. **Pull-to-refresh** on order and KDS pages
5. **Floating action button (FAB)** for primary actions (New Order, New Expense)
6. **Collapsible filter bars** that expand on tap

---

## 7. Page-by-Page Audit

### LoginPage (/login) — GOOD
- Well-implemented PIN login
- No issues found

### DashboardPage (/dashboard) — NEEDS WORK
- Missing empty state when data is null
- Grid layout might be tight on mobile
- **Enhancement:** Add quick action buttons, live order ticker

### OrdersPage (/orders) — MINOR ISSUES
- Auto-refresh interval has stale closure bug
- Order drawer is 420px fixed width (breaks mobile)
- Long customer names not truncated in table
- **Enhancement:** Add bulk actions, order search

### KDSPage (/kds) — NEEDS FIX
- "Ready" column is always empty (hardcoded `[]`)
- 3-column grid doesn't respond to mobile
- Urgency thresholds hardcoded (should be in settings)
- **Enhancement:** Sound notifications, order age timer

### DeliveryPage (/delivery) — MINOR ISSUES
- Only shows first 10 completed orders, no pagination
- No visual indicator for orders waiting > 15 min
- 30-second refresh is hardcoded

### MenuPage (/menu) — MINOR ISSUES
- Dead code: image preview disabled with `{false && ...}`
- Form grids don't collapse on mobile
- No minimum price validation
- **Enhancement:** Drag-and-drop reorder, bulk availability toggle

### PromotionsPage (/promotions) — MINOR ISSUES
- No delete confirmation dialog
- Missing negative value validation for percentages
- Price display confusing (divides by 100 for laari conversion)

### LoyaltyPage (/loyalty) — NOT IN NAV
- No sidebar link — users can't find this page
- Point adjustment has no confirmation dialog
- Star tier colors not accessible for colorblind users

### SmsPage (/sms) — NOT IN NAV
- No sidebar link — this is the page you're missing!
- SMS segment calculation ignores Unicode
- Empty campaigns tab lacks CTA to create one
- **Enhancement:** Campaign templates, scheduling

### ReportsPage (/reports) — INCOMPLETE
- Stub implementation — only shows summary, no breakdown
- Hardcoded date defaults
- "Coming soon" placeholder text visible to users

### InvoicesPage (/invoices) — MINOR ISSUES
- Filter "All" option silently breaks
- No confirmation before marking paid
- **Enhancement:** PDF preview, email invoice

### ExpensesPage (/expenses) — MINOR ISSUES
- Missing numeric validation on amount field
- Date range controls wrap awkwardly on mobile

### ProfitLossPage (/profit-loss) — NOT IN NAV + BUG
- No sidebar link
- Division by zero crash when gross revenue = 0
- Daily summary loads wrong date

### SupplierIntelligencePage (/supplier-intelligence) — NOT IN NAV
- No sidebar link
- Missing price comparison feature (mentioned in title)
- Star ratings lose precision (no fractional stars)

### ForecastPage (/forecasts) — NEEDS POLISH
- Infinity symbol (∞) for days remaining not explained
- Hardcoded inventory status thresholds

### AnalyticsPage (/analytics) — NOT IN NAV
- No sidebar link
- `Math.max(...[])` edge case on empty data
- Single error for all 5 API calls failing

### StaffPage (/staff) — GOOD, MINOR ISSUES
- Toggle active fails silently (no error shown)
- Role field inconsistency (`role_name` vs `role`)
- **Missing:** Scheduling tab (sidebar says "Staff & Schedules")

### ReservationsPage (/reservations) — MINOR ISSUES
- No confirmation on destructive status changes
- Hardcoded status transitions
- Notes truncation hides info

### SettingsPage (/settings) — INCOMPLETE
- Devices and Integrations sub-pages just redirect
- No hex color validation for website settings
- JSON field doesn't validate syntax
- Crash risk with non-null assertion

### WebhooksPage (/webhooks) — NOT IN NAV + SECURITY
- No sidebar link
- Secret key exposed via `alert()` — security risk
- **Fix:** Copy to clipboard and show once in modal

### PurchaseOrdersPage (/purchase-orders) — MINOR ISSUES
- No pagination for large PO lists
- Suggestion panel lacks "Create PO" action button
- Query params not URL-encoded

### TestChecklistPage (/checklist) — DEV TOOL
- Should be hidden in production or moved out of pages/

---

## 8. Prioritized Action Plan

### Phase 1: Critical Fixes (Do First)

- [ ] **Add 7 missing pages to sidebar navigation** in Layout.tsx
- [ ] **Fix ProfitLossPage division by zero** crash
- [ ] **Fix SettingsPage non-null assertion** crash
- [ ] **Fix WebhooksPage secret key exposure** (replace alert with clipboard copy)
- [ ] **Fix KDSPage "Ready" column** (connect to API or remove column)
- [ ] **Fix ReportsPage useEffect dependency** (reload on filter change)
- [ ] **Fix InvoicesPage filter bug** (handle empty string)
- [ ] **Fix mobile drawer width** (OrdersPage 420px → responsive)

### Phase 2: Missing Features (High Impact)

- [ ] Build **Gift Cards** management page
- [ ] Build **Reviews & Ratings** moderation page
- [ ] Build **Daily Specials** management page
- [ ] Build **Staff Scheduling** page (add tab to StaffPage)
- [ ] Build **Inventory Management** page (categories, conversions, waste logs)
- [ ] Build **Table Management** page
- [ ] Build **Referral Program** tracking page
- [ ] Complete **Settings** sub-pages (Devices, Integrations/Xero)
- [ ] Complete **Reports** page (detailed breakdowns by item/category/staff)

### Phase 3: Mobile Responsiveness

- [ ] Add global CSS breakpoints (@media queries) to index.css
- [ ] Convert KDS to responsive grid (1-col mobile, 2-col tablet, 3-col desktop)
- [ ] Make all form grids collapse to single column on mobile
- [ ] Increase touch target sizes to 48px minimum
- [ ] Add horizontal scroll indicators to all tables
- [ ] Make modals full-width on mobile (bottom sheets)
- [ ] Fix z-index hierarchy across all components
- [ ] Make "More" drawer 2-column on small screens

### Phase 4: UX Enhancements

- [ ] Add global search (Cmd+K)
- [ ] Add notification center with alerts
- [ ] Add confirmation dialogs for destructive actions
- [ ] Add breadcrumb navigation
- [ ] Add data export (CSV/PDF) to report pages
- [ ] Add dark mode support
- [ ] Add inline editing for tables
- [ ] Add drag-and-drop for menu reordering
- [ ] Add activity/audit log viewer
- [ ] Add bulk operations (multi-select + action)
- [ ] Role-based sidebar filtering (hide items user can't access)

---

*End of Audit Report*
