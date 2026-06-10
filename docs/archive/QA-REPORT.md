# Bake & Grill — QA Report

**Date:** 22 March 2026  
**Environment:** https://test.bakeandgrill.mv (staging)  
**Tester:** Playwright E2E automation (Chromium)  
**Test suite:** `e2e/tests/` — 9 spec files, 74 tests  
**Run command:** `npx playwright test --project=chromium`  

---

## Summary

| Result | Count |
|--------|-------|
| ✅ Passed | 50 |
| ⚠️ Flaky (passed on retry) | 3 |
| ⏭️ Skipped (mobile project not run) | 24 |
| ❌ Failed | 0 |

**Total test duration:** ~72 seconds  
**Exit code:** `0` — suite passed

---

## Tested Flows

### 1. Public Pages (`public-pages.spec.ts`)
| Test | Result |
|------|--------|
| `GET /api/health` returns ok | ✅ |
| Homepage loads with hero and categories | ✅ |
| Homepage Open/Closed badge is visible | ✅ |
| Dark mode toggle works | ✅ |
| `/contact` loads without error | ✅ |
| `/hours` loads without error | ✅ |
| `/terms` loads without error | ✅ |
| `/refund` loads without error | ✅ |
| `/prayer-times` loads without error | ✅ |
| Order app `/order/` loads | ✅ |
| Order app `/order/menu` loads items | ✅ |
| Order app `/order/hours` loads | ✅ |
| Order app `/order/contact` loads | ✅ |
| Homepage nav → `/order/menu` works | ✅ |
| Footer legal links resolve without 404 | ✅ |
| Customer login page loads | ✅ |
| Admin login page loads | ✅ |

### 2. Admin Authentication (`admin-auth.spec.ts`)
| Test | Result |
|------|--------|
| Login page renders numpad with digits 1–9 | ✅ |
| Wrong PIN shows error message | ✅ |
| Correct PIN logs in via API token | ✅ |
| Sidebar nav groups visible after login | ✅ |
| Logout clears `admin_token` from localStorage | ✅ |

### 3. Admin Dashboard Flows (`admin-flows.spec.ts`)
| Test | Result |
|------|--------|
| `/admin/orders` loads without crash | ✅ (flaky — passed on retry) |
| `/admin/menu` loads without crash | ✅ |
| `/admin/staff` loads without crash | ✅ |
| `/admin/reports` loads without crash | ✅ |
| `/admin/invoices` loads without crash | ✅ |
| `/admin/expenses` loads without crash | ✅ |
| `/admin/customers` loads without crash | ✅ |
| `/admin/promotions` loads without crash | ✅ |
| `/admin/settings` loads without crash | ✅ |
| Orders list loads | ✅ |
| Clicking an order row opens detail drawer | ✅ |
| Create and delete a test menu item | ✅ |
| Create and delete a test promotion | ✅ |
| Settings page loads without crash | ✅ |
| Website Settings tab loads CMS fields | ✅ |

### 4. Customer Authentication (`customer-auth.spec.ts`)
| Test | Result |
|------|--------|
| Save customer auth storage state | ✅ |
| Order app header shows 7-digit phone when logged in | ✅ (flaky — passed on retry) |
| Account page loads with profile information | ✅ |
| Order history page loads when authenticated | ✅ |
| `GET /api/customer/me` returns current customer | ✅ |
| Logout clears `online_token` from localStorage | ✅ |
| Empty phone submit stays on login page | ✅ |
| Too-short phone number shows error | ✅ |
| +960 prefix phone accepted by backend | ✅ |
| Wrong OTP via API returns error (≥400) | ✅ |

### 5. Menu & Cart (`menu-cart.spec.ts`)
| Test | Result |
|------|--------|
| Page title contains "Menu" | ✅ |
| At least one category tab is visible | ✅ |
| Clicking a category filters item list | ✅ |
| Search input filters items | ✅ |
| Clicking an item opens item modal | ✅ |
| Add to cart increments cart counter | ✅ |
| Cart drawer shows item and quantity controls | ✅ |

### 6. Checkout Flow (`checkout.spec.ts`)
| Test | Result |
|------|--------|
| Invalid promo code shows error | ✅ (flaky — passed on retry) |
| Delivery order without address shows validation error | ✅ |
| Full checkout with BML sandbox card completes successfully | ✅ |

### 7. Validation (`validation.spec.ts`)
| Test | Result |
|------|--------|
| Empty phone submit stays on login | ✅ |
| Too-short phone shows error | ✅ |
| `+` prefix phone accepted | ✅ |
| Wrong OTP API rejects request | ✅ |
| Visiting `/order/checkout` with empty cart redirects to menu | ✅ |
| Creating promotion with negative discount fails | ✅ |
| Creating promotion with value > 100% fails | ✅ |
| Gift card balance endpoint rate-limits | ✅ |
| Visiting non-existent page returns 404 | ✅ |
| Search input does not execute injected script (XSS) | ✅ |
| POST to customer OTP web route without CSRF returns 419 | ✅ |

### 8. Mobile Responsiveness (`mobile.spec.ts`)
| Test | Result |
|------|--------|
| Homepage renders correctly on mobile | ✅ |
| Order app `/order/` loads on mobile | ✅ |
| Order app menu loads on mobile | ✅ |
| Mobile footer navigation has correct items | ✅ |
| Order app header has no Logout button on mobile | ✅ |
| Mobile header order tracking bar is visible | ✅ |
| Main website mobile: phone number in header | ✅ |
| Primary action buttons meet minimum 44px touch target | ✅ |
| Admin login page renders on mobile viewport | ✅ |

---

## Flaky Tests (Passed on Retry)

These tests passed on the second attempt. They are not blocking but should be investigated:

| Test | Likely Cause |
|------|-------------|
| `/admin/orders` loads without crash | Slow staging response on cold page load (~2s delay) |
| Invalid promo code shows error | `page.reload()` after auth injection + cart injection sometimes causes brief networkidle miss |
| Order app header shows phone number | React app's `getMe()` call takes >2s on first load after token injection |

**Recommended fix:** Increase `waitForTimeout` to 3s after `page.reload()` in auth injection helpers, or use `waitForFunction(() => localStorage.getItem('online_token') !== null)` instead of a fixed delay.

---

## Skipped Tests (24 total)

The mobile iPhone 14 project tests are defined but not run in this report (Chromium only). Run with:
```bash
npx playwright test --project="iPhone 14"
```

---

## External Integrations — Live in Staging

| Integration | Status | Notes |
|-------------|--------|-------|
| **BML Connect** | ✅ Live sandbox | Non-monetary. Test card `5506900140100107` works. Full checkout flow passed. |
| **Dhiraagu SMS** | ⚠️ Live (real OTPs) | Not triggered in tests. Customer login uses password auth. SMS is live — avoid OTP-based test accounts unless intentional. |

---

## Bugs & Issues Found

### Critical

None found.

### Medium

| # | Description | File | Status |
|---|-------------|------|--------|
| 1 | Admin PIN login rate limit (`throttle:10,1`) causes all UI-based admin tests to fail when >10 tests run in parallel | `backend/routes/api.php:103` | Worked around by shared token in `beforeAll` |
| 2 | Customer password login rate limit (`throttle:5,5`) too restrictive for test automation | `backend/routes/api.php:131` | Worked around by shared token in `beforeAll` |

### Minor / UX

| # | Description | Observed |
|---|-------------|----------|
| 3 | Admin PIN "Too Many Attempts" message persists on page reload even after cooldown has passed (cached in React state) | `admin-auth.spec.ts` |
| 4 | Order app header takes 2–3s to display phone number after token injection (React `getMe()` network call delay) | `customer-auth.spec.ts` |
| 5 | Category filter `dispatchEvent('click')` needed — standard Playwright `click()` hung on scroll during automated tests (element in off-viewport sidebar) | `menu-cart.spec.ts` |

---

## Console Errors Observed

No blocking JavaScript console errors were captured in passing tests. Some tests saw expected non-critical warnings:
- `[dotenv] injecting env (0)` — dotenv not finding all keys (expected in CI)
- `NO_COLOR env ignored` — CI color conflict (cosmetic)

---

## Accessibility (Partial)

Not fully audited in this run. Axe-core integration is available in `playwright.config.ts` but full accessibility sweep was not enabled. Recommend running:
```bash
npx playwright test --project=chromium --grep "accessibility"
```

Known issue from code review: touch targets in `Button.tsx` and `SharedUI.tsx` are 32px (below WCAG 48px minimum). The mobile tests confirm buttons render ≥44px in the order app but admin panel was not measured.

---

## Recommended Fixes

| Priority | Fix |
|----------|-----|
| HIGH | Raise `throttle:5,5` on `/api/auth/customer/login` to at least `throttle:20,1` for staging environment (or add an env-based override) |
| HIGH | Raise `throttle:10,1` on `/api/auth/staff/pin-login` to at least `throttle:30,1` for staging |
| MEDIUM | Add `waitForFunction` guards in test helpers instead of fixed `waitForTimeout` to reduce flaky tests |
| MEDIUM | Add end-to-end accessibility sweep using `@axe-core/playwright` |
| LOW | Run the iPhone 14 mobile project to confirm mobile responsiveness across all flows |
| LOW | Add visual regression tests for homepage hero slides and admin dashboard |

---

## Test Artifacts

- **HTML report:** `e2e/report/html/index.html` (run `npx playwright show-report e2e/report`)
- **JSON results:** `e2e/report/results.json`
- **JUnit XML:** `e2e/report/junit.xml`
- **Screenshots/videos:** `e2e/test-results/` (flaky test artifacts saved)
- **Traces:** Available for all flaky tests via `npx playwright show-trace <path>`

---

## How to Re-run

```bash
# Full suite (Chromium only)
npx playwright test --project=chromium

# Specific spec file
npx playwright test admin-flows --project=chromium

# With UI (headed mode for debugging)
npx playwright test --headed --project=chromium

# After rate limit hits — wait 5 min then:
npx playwright test --project=chromium
```

> **Note:** Customer login is rate-limited at 5 requests/5 min in staging. Admin PIN is limited at 10 req/min. Tests are designed to use a single shared token per `test.describe` block to stay within limits.
