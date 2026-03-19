# Bake & Grill — Full Platform Audit Report

**Date:** 2026-03-19
**Scope:** Admin Panel, Website Layout (online-order-web), Order App (POS), Backend Security
**Stack:** Laravel 12 + React 19 + TypeScript + Vite + Tailwind CSS 4 + PostgreSQL

---

## Table of Contents

1. [Admin Panel Audit](#1-admin-panel-audit)
2. [Website Layout Audit (online-order-web)](#2-website-layout-audit)
3. [Order App Audit (POS)](#3-order-app-audit)
4. [Admin Editing Tools Audit](#4-admin-editing-tools-audit)
5. [Backend & Security Audit](#5-backend--security-audit)
6. [Summary & Priority Matrix](#6-summary--priority-matrix)

---

## 1. Admin Panel Audit

**Path:** `apps/admin-dashboard/`
**Pages:** 22 | **Components:** 12+ | **Total:** ~6,000+ lines

### 1.1 CRITICAL — Security Issues

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| S1 | `WebhooksPage.tsx` | 43-46 | URL validation says "must be HTTPS" but only uses `new URL()` — doesn't check protocol. HTTP webhooks accepted. | HIGH |
| S2 | `LoginPage.tsx` | 124-128 | Dev PINs (1111, 2222, 3333, 4444) gated by `import.meta.env.DEV` — safe if build is correct, but risk if misconfigured | MEDIUM |
| S3 | `SettingsPage.tsx` | 560-571 | Textarea accepts raw JSON without sanitization — stored XSS risk if rendered elsewhere | MEDIUM |
| S4 | All pages | — | User-supplied strings (names, descriptions) rendered without DOMPurify sanitization | MEDIUM |

### 1.2 HIGH — Missing Error Handling

| # | File | Line | Issue |
|---|------|------|-------|
| E1 | `DashboardPage.tsx` | 34 | `catch ((e: Error) => setError(e.message))` — crashes if `e` is not Error type |
| E2 | `SettingsPage.tsx` | 350 | `.catch(() => error('Failed'))` — swallows actual error details |
| E3 | `DeliveryPage.tsx` | 57 | `catch { /* ignore */ }` — no logging at all |
| E4 | `LoyaltyPage.tsx` | 237 | `.catch(() => toast.error('Failed'))` — no error context |
| E5 | `MenuPage.tsx` | 363 | `(e as Error).message` — no fallback if message is undefined |

### 1.3 HIGH — Missing Input Validation

| # | File | Line | Issue |
|---|------|------|-------|
| V1 | `MenuPage.tsx` | 233-234 | `parseFloat(form.base_price)` — doesn't validate numeric format |
| V2 | `StaffPage.tsx` | 77-82 | Email field requires non-empty but no format validation |
| V3 | `PromotionsPage.tsx` | 54 | Allows 0% discount — `discount_value <= 0` should reject |
| V4 | `WebhooksPage.tsx` | 38-45 | Same HTTPS issue as S1 above |

### 1.4 MEDIUM — Accessibility Issues

| # | File | Issue |
|---|------|-------|
| A1 | `LoginPage.tsx` | Numpad buttons missing ARIA labels, no screen reader support |
| A2 | All modals | Missing `role="dialog"`, `aria-modal="true"`, focus trap |
| A3 | `ExpensesPage.tsx` | Labels are styled `<div>` not semantic `<label>` |
| A4 | Tables throughout | No `scope` attributes on `<th>`, no `<caption>` |

### 1.5 MEDIUM — State Management Issues

| # | File | Issue |
|---|------|------|
| ST1 | `MenuPage.tsx` | `selectedCat`, `search`, `page` not grouped — inconsistent state |
| ST2 | `OrdersPage.tsx` | Filter changes don't reliably reset page to 1 |
| ST3 | `AnalyticsPage.tsx` | 5+ separate `useState` calls instead of single data object |
| ST4 | `DeliveryPage.tsx` | Loading state only covers orders, not drivers |

### 1.6 MEDIUM — Performance Issues

| # | File | Issue |
|---|------|------|
| P1 | All pages | No `React.lazy()` code splitting — all 22 pages in main bundle |
| P2 | `AnalyticsPage.tsx` | 5 concurrent API calls with no caching (no React Query/SWR) |
| P3 | All table pages | Filtered/sorted data not wrapped in `useMemo` |
| P4 | `Layout.tsx` | 20+ Lucide icon imports — no tree shaking optimization |

### 1.7 LOW — UI/UX Issues

- `SettingsPage.tsx`: 41KB monolith — should be split into sub-components
- Mobile responsiveness incomplete on table-heavy pages (`MenuPage`, `StaffPage`, `OrdersPage`)
- No horizontal scroll on tables for mobile
- No "per page" selector on paginated tables
- Index used as React key in several lists (`DashboardPage.tsx:110`, `KDSPage.tsx:183`)

---

## 2. Website Layout Audit

**Path:** `apps/online-order-web/`
**Pages:** 12 | **Components:** 16 | **Contexts:** 4

### 2.1 CRITICAL — Security Issues

| # | File | Line | Issue | Severity |
|---|------|------|-------|----------|
| WS1 | `ItemModal.tsx` | 81-84 | Item description rendered without sanitization — stored XSS | HIGH |
| WS2 | `ReviewForm.tsx` | 24 | Review comments submitted without validation | HIGH |
| WS3 | `Layout.tsx` | 169 | Customer name displayed without sanitization | MEDIUM |
| WS4 | Multiple files | — | WhatsApp links built from phone numbers without URL encoding | MEDIUM |

### 2.2 HIGH — Code Quality Issues

| # | File | Line | Issue |
|---|------|------|-------|
| WC1 | `HomePage.tsx` | 35-44 | `.catch(() => {})` — silent failure, user sees nothing |
| WC2 | `OrderStatusPage.tsx` | 40 | Defaults to "open" on API error — misleading |
| WC3 | `Layout.tsx` | 41-48 | Token validation based only on customer name presence |
| WC4 | `AuthBlock.tsx` | 21 | No phone number format validation before OTP request |
| WC5 | `OrderHistoryPage.tsx` | 39 | Fragile array type coercion for API response |

### 2.3 HIGH — State Management Issues

| # | File | Issue |
|---|------|-------|
| WST1 | Multiple files | Token in localStorage AND component state — cross-tab sync broken |
| WST2 | `CartContext.tsx` | Cart deduplication uses modifier ID order — reorder creates duplicates |
| WST3 | `useCheckout.ts` | `promoApplied` pending flag not validated before checkout |

### 2.4 MEDIUM — Layout & Navigation Issues

| # | File | Issue |
|---|------|-------|
| WL1 | `NotFoundPage.tsx` | Links to `/order/` — may not exist |
| WL2 | `CheckoutPage.tsx` | 380px fixed sidebar breaks tablet layout |
| WL3 | `MenuPage.tsx` | Desktop sidebar (200px) crashes mobile layout — no media query |
| WL4 | Multiple files | Only mobile (<768px) vs desktop — no tablet breakpoint |
| WL5 | `Layout.tsx` | Mobile menu button visibility not coordinated with handler |

### 2.5 MEDIUM — Accessibility Issues

| # | File | Issue |
|---|------|-------|
| WA1 | `ItemModal.tsx` | Focus trap logic incomplete — skips some focusable elements |
| WA2 | `PrayerBar.tsx` | Geo button has `title` but no `aria-label` |
| WA3 | `HoursPage.tsx` | Open/closed status uses color only — fails for color-blind users |

### 2.6 MEDIUM — Performance Issues

| # | File | Issue |
|---|------|-------|
| WP1 | `MenuPage.tsx` | Scroll listener fires every pixel — needs debounce |
| WP2 | `PrayerBar.tsx` | Sequential API calls for today/tomorrow — should be `Promise.all()` |
| WP3 | `ItemModal.tsx` | No `will-change` or transform optimization for animations |

### 2.7 LOW — Data Handling Issues

- Price conversion inconsistency: strings from API converted to numbers differently across files
- `toFixed(2)` used without validating input — `NaN.toFixed(2)` returns `"NaN"`
- Date formatting without timezone awareness
- No maximum quantity limit on menu items — users can add unlimited

---

## 3. Order App Audit (POS)

**Path:** `apps/pos-web/`
**Components:** `MenuGrid`, `OrderCart`, `OpsPanel` | **Hooks:** 4 | **Offline:** `offlineQueue.ts`

### 3.1 CRITICAL Issues

| # | File | Issue | Severity |
|---|------|-------|----------|
| PS1 | `LoginPage.tsx:128` | Dev PINs visible (gated by DEV flag) | MEDIUM |
| PS2 | `App.tsx:101` | Token stored in localStorage without encryption | MEDIUM |
| PS3 | `offlineQueue.ts:47` | Queue overflow silently drops oldest entry — could lose orders | HIGH |
| PS4 | `api.ts:18` | VITE_API_BASE_URL fallback warns but still connects to any origin | MEDIUM |

### 3.2 HIGH — Missing Features

| # | Feature | Issue |
|---|---------|-------|
| PF1 | Split bill | No split-by-item or split-by-percentage |
| PF2 | Offline sync | Queue exists but no conflict resolution strategy |
| PF3 | Table management | Open/close but no visual floor map |
| PF4 | Receipt | No email/SMS receipt from POS |
| PF5 | Discount | No custom discount entry (only predefined) |

### 3.3 MEDIUM — UI/UX Issues

- No keyboard shortcuts for common POS actions
- No barcode/QR scanner integration
- Touch targets may be too small for touchscreen POS devices
- No sound/vibration feedback on order actions
- Cart total doesn't show running subtotal with tax breakdown

---

## 4. Admin Editing Tools Audit

### 4.1 Incomplete CRUD Operations

| Page | Create | Read | Update | Delete | Issue |
|------|--------|------|--------|--------|-------|
| **Menu Items** | Yes | Yes | Yes | Yes | No bulk import/export |
| **Categories** | Yes | Yes | Partial | No | Can't edit name after creation, no `is_active` toggle in UI |
| **Staff** | Yes | Yes | Yes | Yes | No PIN reset, no email validation |
| **Promotions** | Yes | Yes | Yes | Yes | No usage statistics, no date picker |
| **Expenses** | Yes | Yes | **NO** | Yes | Missing edit functionality entirely |
| **Invoices** | **NO** | Yes | Partial | No | Can only mark sent/paid, no create/edit |
| **Purchase Orders** | Yes | Yes | Partial | No | Can't edit line items or cancel |
| **Reports** | N/A | Partial | N/A | N/A | "Detailed breakdown coming soon" placeholder |
| **Analytics** | N/A | Yes | N/A | N/A | No export to CSV, limited to 8 top customers |
| **KDS** | N/A | Yes | N/A | N/A | Can't edit order items or add notes |

### 4.2 Missing Bulk Operations (ALL Pages)

- No "Select all" checkbox
- No multi-select for bulk actions (delete, update status, export)
- No CSV/Excel import on any page
- No CSV/Excel export on any page

### 4.3 Missing Admin Editing Features

| # | Feature | Description |
|---|---------|-------------|
| ET1 | Website Layout Editor | No admin tool to customize website theme, colors, fonts, hero images |
| ET2 | Menu Layout Editor | No drag-and-drop menu item ordering |
| ET3 | Page Content Editor | No CMS for About, Contact, Hours pages |
| ET4 | Banner/Announcement Editor | No tool to create/manage homepage banners |
| ET5 | Email Template Editor | No customization of receipt/notification emails |
| ET6 | Receipt Template Editor | No receipt layout customization |
| ET7 | Order Form Builder | No customization of checkout form fields |
| ET8 | Dashboard Widget Editor | No customizable dashboard layout |

---

## 5. Backend & Security Audit

### 5.1 CRITICAL — Security Issues

| # | File | Issue | Severity |
|---|------|-------|----------|
| BS1 | `routes/api.php` | Several admin routes missing `RequirePermission` middleware | HIGH |
| BS2 | `SecurityHeaders.php` | CSP not strict enough — `'unsafe-inline'` for styles | MEDIUM |
| BS3 | Multiple controllers | `$request->all()` used in some places — mass assignment risk | HIGH |
| BS4 | `CustomerAuthController.php` | OTP rate limiting (3/5min) may be too generous for brute force | MEDIUM |
| BS5 | `StaffAuthController.php` | PIN-based auth is inherently weak (4-digit) — no lockout after failed attempts documented | HIGH |

### 5.2 HIGH — Authorization Gaps

| # | Issue | Detail |
|---|-------|--------|
| BA1 | Owner bypass | `user.role === 'owner'` bypasses all frontend permission checks — backend must also enforce |
| BA2 | Missing policies | No policy for Promotion, Loyalty, Reservation, Expense, Invoice CRUD |
| BA3 | Webhook secrets | Displayed once in modal but visible in DOM |

### 5.3 MEDIUM — API Issues

| # | Issue | Detail |
|---|-------|--------|
| BI1 | No API versioning | All routes under `/api/` with no version prefix |
| BI2 | No request throttling on some endpoints | Analytics, reports endpoints unthrottled |
| BI3 | SSE streams | No authentication timeout on long-lived SSE connections |

---

## 6. Summary & Priority Matrix

### Issue Count by Area

| Area | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| Admin Panel | 4 | 9 | 12 | 5 | 30 |
| Website Layout | 4 | 8 | 9 | 4 | 25 |
| POS App | 4 | 5 | 5 | 0 | 14 |
| Admin Editing Tools | 0 | 10 | 8 | 0 | 18 |
| Backend Security | 5 | 3 | 3 | 0 | 11 |
| **TOTAL** | **17** | **35** | **37** | **9** | **98** |

### Top 10 Priority Fixes

1. **Add input sanitization (DOMPurify)** across all React apps for user-supplied strings
2. **Fix webhook URL HTTPS validation** — currently accepts HTTP
3. **Add missing CRUD** — Expenses edit, Invoice create/edit, Category edit
4. **Fix error handling** — replace silent catches with user-facing error toasts
5. **Add permission middleware** to unprotected admin API routes
6. **Implement code splitting** with `React.lazy()` on all route-level pages
7. **Fix mobile responsiveness** on admin tables and checkout layout
8. **Add accessibility** — ARIA labels, focus traps, semantic HTML
9. **Add bulk operations** — select all, multi-action, CSV import/export
10. **Build website layout editing tools** — theme editor, content CMS, banner manager
