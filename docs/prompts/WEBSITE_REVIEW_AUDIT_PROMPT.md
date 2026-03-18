# Bake & Grill — Website Review & Modernization Audit Prompt

> **Scope:** Customer-facing online ordering app (`apps/online-order-web/`), shared packages, and relevant backend integration points.
> **Goal:** Fix all bugs, eliminate code smells, modernize the UI/UX to a polished 2026 standard, and harden the app for production.

---

## CONTEXT

This is a React 19 + TypeScript + Tailwind CSS 4.2 + Vite 7 monorepo for a restaurant in Malé, Maldives called "Bake & Grill." The customer-facing ordering app lives at `apps/online-order-web/`. It has 10 pages (Home, Menu, Checkout, OrderStatus, PreOrder, About, Contact, Hours, Reservation, Privacy), a shared Layout with header/footer, and supporting contexts (Cart, Language, SiteSettings). The backend is Laravel 12.

---

## PART 1 — BUGS TO FIX

### BUG-01: Duplicated SVG Icon Components
**Files:** `Layout.tsx`, `HomePage.tsx`, `CheckoutPage.tsx`
**Issue:** `WhatsAppIcon` and `ViberIcon` SVG components are copy-pasted identically across 3+ files (only the `width`/`height` differ: 13px, 14px, 16px). This is a maintenance hazard — a fix in one file won't propagate.
**Fix:** Extract `WhatsAppIcon` and `ViberIcon` into a shared `src/components/icons/` folder. Accept `size` as a prop (default 16). Import everywhere.

### BUG-02: ItemModal Uses Hardcoded Colors Instead of Design Tokens
**File:** `src/components/ItemModal.tsx`
**Issue:** The entire modal uses hardcoded hex values (`#D4813A`, `#B86820`, `#1C1408`, `#8B7355`, `#EDE4D4`, `#FEF3E8`) instead of the CSS custom properties defined in `index.css` (`--color-primary`, `--color-primary-hover`, `--color-dark`, `--color-text-muted`, `--color-border`, `--color-primary-light`). If the brand colors change via the design tokens, this modal will look inconsistent.
**Fix:** Replace every hardcoded color with the corresponding `var(--color-*)` token.

### BUG-03: ErrorBoundary Leaks Raw Error Messages to Users
**File:** `src/components/ErrorBoundary.tsx:36`
**Issue:** `{this.state.message || 'An unexpected error occurred...'}` displays the raw JavaScript error message to end users. This can leak internal paths, API URLs, or sensitive stack info.
**Fix:** Always show a user-friendly generic message. Log the real error to a monitoring service (or at minimum keep the `console.error` but strip the message from the UI). Remove `this.state.message` from the rendered output entirely.

### BUG-04: ErrorBoundary Uses Wrong Brand Color
**File:** `src/components/ErrorBoundary.tsx:42`
**Issue:** The "Reload page" button uses `background: '#1ba3b9'` (a teal/cyan color) which doesn't match any color in the Bake & Grill design system (amber/brown palette). This looks like a copy-paste from another project.
**Fix:** Use `var(--color-primary)` for the button background.

### BUG-05: 404 Page Uses Inline Styles + Wrong Font Stack
**File:** `src/main.tsx:42-46`
**Issue:** The catch-all `*` route renders an inline `<div>` with hardcoded font-family, colors (`#1c1e21`, `#636e72`), and padding. These don't use design tokens and the font-family declaration is redundant since the app already sets it globally.
**Fix:** Extract to a proper `NotFoundPage.tsx` component using CSS classes or design token variables.

### BUG-06: Console Warnings in Production Builds
**Files:** `api.ts:37`, `ErrorBoundary.tsx:14`, `SiteSettingsContext.tsx`, `useCheckout.ts`, `usePushNotifications.ts`
**Issue:** ~15+ `console.error()` and `console.warn()` calls ship to production. The `api.ts:37` one fires on every production load if `VITE_API_BASE_URL` is not set (which is the expected default behavior for same-origin deployment), creating noise in the console.
**Fix:** Remove the `console.warn` in `api.ts:35-38` (the fallback to `/api` is correct and expected behavior, no warning needed). For other error logs, either remove them or gate behind `import.meta.env.DEV`.

### BUG-07: Cart localStorage Has No Schema Versioning
**File:** `src/context/CartContext.tsx:20-41`
**Issue:** The `loadCart()` function reads `bakegrill_cart` from localStorage and casts it to a specific shape. If the shape changes in a future release (e.g., adding `variant_id`), users with old cached data will get silent failures or corrupted cart state. The `try/catch` will just return `[]` and silently wipe their cart.
**Fix:** Add a `version` field to the stored JSON. On load, check the version — if it's outdated, migrate or clear with a toast notification explaining why.

### BUG-08: `base_price` Parsed Repeatedly as String
**Files:** `MenuCard.tsx:164`, `HomePage.tsx:264`, `CartContext.tsx:89-90`, `ItemModal.tsx:12-13`
**Issue:** `parseFloat(String(item.base_price))` appears in 4+ places. The `String()` wrapper suggests `base_price` can be either `number` or `string` from the API. This is a type safety gap — the TypeScript type should enforce one, and parsing should happen once at the API boundary.
**Fix:** In the shared API client or `api.ts`, normalize `base_price` and `modifier.price` to `number` when responses are received. Remove all `parseFloat(String(...))` calls from components.

### BUG-09: No Focus Trap in ItemModal
**File:** `src/components/ItemModal.tsx`
**Issue:** The modal overlay uses `position: fixed` with a backdrop click to close, but there's no focus trap. Keyboard users can Tab out of the modal into the page behind it. Also, pressing Escape doesn't close the modal.
**Fix:** Add a focus trap (use a small utility or the native `<dialog>` element). Add `onKeyDown` for Escape key to call `onClose()`. Auto-focus the first interactive element when the modal opens.

### BUG-10: Hover Effects Use Imperative DOM Manipulation
**Files:** `MenuCard.tsx:50-61`, `Layout.tsx:121-122,136-137,151-153`, `HomePage.tsx:115-116,131-133,191-192,243-244,329-330`
**Issue:** Every hover effect is done via `onMouseEnter`/`onMouseLeave` with `e.currentTarget.style.x = '...'`. This is fragile (state can get stuck if mouse events fire out of order), verbose, not accessible (no keyboard focus equivalent), and prevents CSS-based optimizations.
**Fix:** Move all hover states to CSS classes using `:hover` and `:focus-visible` pseudo-selectors. Use Tailwind utilities (`hover:bg-primary hover:-translate-y-1 transition-all`) or CSS classes in `index.css`.

### BUG-11: Category Links on HomePage Don't Filter Menu
**File:** `src/pages/HomePage.tsx:179-202`
**Issue:** All four category cards (`Hedhikaa`, `Fresh Bakes`, `Grills`, `Special Orders`) link to `/menu` without any query parameter or state to filter by category. Users expect clicking "Grills" to show grills, not the full menu.
**Fix:** Link to `/menu?category=grills` (or pass state via React Router). Update `MenuPage.tsx` to read the query param and pre-select that category filter.

### BUG-12: Featured Items on HomePage Don't Link to Specific Items
**File:** `src/pages/HomePage.tsx:231-268`
**Issue:** Each featured item card links to `/menu` generically. Users expect clicking a specific item to open that item's detail or scroll to it on the menu page.
**Fix:** Link to `/menu?item={item.id}` or `/menu#item-{item.id}` and handle the deep link in `MenuPage.tsx`.

---

## PART 2 — CODE QUALITY & ARCHITECTURE IMPROVEMENTS

### QUALITY-01: Massive Inline Style Objects Everywhere
**Affected files:** Every component — `MenuCard.tsx` (260 lines, nearly all inline styles), `Layout.tsx`, `HomePage.tsx`, `CheckoutPage.tsx`, `ItemModal.tsx`, all pages.
**Issue:** The codebase uses Tailwind CSS (imported in `index.css` line 1-3) but barely uses it. Instead, nearly every element has `style={{...}}` objects with 5-15 properties. This defeats Tailwind's purpose, bloats component files, makes responsive design harder, prevents hover/focus/media-query styling, and hurts readability.
**Fix:** Systematically convert all inline styles to Tailwind utility classes. For the existing CSS custom properties, use Tailwind's `theme.extend` in `tailwind.config.js` to map them (e.g., `colors: { primary: 'var(--color-primary)' }`). Target:
- `MenuCard.tsx` should go from ~260 lines to ~120 lines
- `HomePage.tsx` should go from ~340 lines to ~180 lines
- `Layout.tsx` should go from ~360 lines to ~200 lines

### QUALITY-02: No Shared UI Component Library
**Issue:** Common UI patterns (buttons, cards, badges, form fields, section headers) are reimplemented inline in every file. The `CheckoutPage.tsx` defines its own `Field`, `SummaryRow`, and `SectionCard` components locally.
**Fix:** Create a `src/components/ui/` folder with reusable primitives:
- `Button.tsx` (variants: primary, secondary, ghost, disabled)
- `Card.tsx` (with optional title)
- `Badge.tsx` (variants: combo, spicy, unavailable, status)
- `Input.tsx` / `Textarea.tsx` (with label, error state)
- `Modal.tsx` (with focus trap, backdrop, escape handling)
- `SectionHeader.tsx` (eyebrow + heading pattern used on HomePage)

### QUALITY-03: `index.css` Has Legacy Alias Duplication
**File:** `src/index.css:28-38`
**Issue:** There's a "Legacy aliases (backward compat)" section with duplicate color variables (`--amber` vs `--color-primary`, `--dark` vs `--color-dark`, etc.) with slightly DIFFERENT values (e.g., `--amber: #D4813A` vs `--color-primary: #d97706`). This means some components using legacy vars show a different shade of amber than those using the new tokens.
**Fix:** Decide on one color palette. Remove the legacy aliases entirely. Find-and-replace any `var(--amber)`, `var(--dark)`, `var(--surface)`, `var(--bg)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--text-muted)` references to use the `--color-*` versions.

### QUALITY-04: No Lazy Loading / Code Splitting for Routes
**File:** `src/main.tsx`
**Issue:** All 10 pages are eagerly imported at the top of `main.tsx`. For a restaurant ordering app, most users will only visit 2-3 pages (Home, Menu, Checkout). The rest (About, Contact, Hours, Privacy, Reservation, PreOrder) are dead weight on initial load.
**Fix:** Use `React.lazy()` and `<Suspense>` for non-critical routes:
```tsx
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
// etc.
```
Keep `HomePage`, `MenuPage`, and `CheckoutPage` eagerly loaded since they're the critical path.

### QUALITY-05: API Responses Not Cached
**Issue:** Every page mount triggers fresh API calls (`fetchItems()`, `fetchCategories()`, `fetchOpeningHoursStatus()`, etc.) with no caching. Navigating Home → Menu → Home fires `fetchItems()` twice.
**Fix:** Introduce a lightweight data-fetching layer. Options:
- Use TanStack Query (React Query) for automatic caching, deduplication, and background refetching
- Or implement a simple in-memory cache in the shared API client with TTL (e.g., 60 seconds for menu data, 30 seconds for opening hours)

### QUALITY-06: Missing `removeItem` in Cart Context
**File:** `src/context/CartContext.tsx`
**Issue:** There's `updateQuantity` (which removes if quantity <= 0) but no explicit `removeItem(index)` method. Consumers have to call `updateQuantity(index, 0)` which is unintuitive.
**Fix:** Add a `removeItem(index: number)` method to the context for clarity.

---

## PART 3 — MODERNIZATION & UI/UX IMPROVEMENTS

### MODERN-01: Add Smooth Page Transitions
**Issue:** Page navigations are instant hard-cuts with no transition. Modern food ordering apps (Uber Eats, DoorDash) use subtle fade/slide transitions.
**Fix:** Add a simple fade transition using React Router's `useLocation` and CSS transitions, or use `framer-motion`'s `AnimatePresence` with a lightweight fade (opacity 0→1, 150ms ease).

### MODERN-02: Add Skeleton Loading States
**Issue:** When data is loading, pages show nothing (empty space) or a brief flash. There are no loading skeletons or shimmer effects.
**Fix:** Create a `Skeleton.tsx` component (simple CSS animation, no library needed). Use it in:
- `MenuPage.tsx` — show skeleton cards while menu items load
- `HomePage.tsx` — show skeleton for featured items section
- `CheckoutPage.tsx` — show skeleton for order summary

### MODERN-03: Add Toast Notifications
**Issue:** When a user adds an item to cart, there's no visual feedback beyond the cart count changing in the header. Users miss this subtle change, especially on mobile.
**Fix:** Implement a lightweight toast/snackbar system:
- "Added to cart" toast with item name (auto-dismiss 3s)
- "Item removed" toast
- "Order placed successfully" toast
- Position: bottom-center on mobile, bottom-right on desktop

### MODERN-04: Improve Mobile Bottom Navigation
**File:** `Layout.tsx:330-360`
**Issue:** The mobile nav uses emoji icons (🏠, 🍽️, 🛒, 🕐, 📞) which render differently across devices and look unprofessional. The nav has no active state indicator for the current page.
**Fix:**
- Replace emojis with proper SVG icons (use a small icon set like Lucide or inline SVGs)
- Add active state styling (filled icon + accent color + dot indicator) based on current `location.pathname`
- Add a subtle top border or background highlight for the active item
- Consider adding a subtle haptic-style scale animation on tap

### MODERN-05: Add a Proper Hero Section with Image
**File:** `src/pages/HomePage.tsx:62-139`
**Issue:** The hero section is text-only on a plain background. For a food/restaurant website, visual appetite appeal is critical for conversions.
**Fix:**
- Add a hero background image (or gradient overlay on an image) showing food photography
- Use a subtle parallax or zoom effect on scroll
- Consider a rotating carousel of 2-3 hero images (food shots)
- Add a backdrop blur container for the text to maintain readability

### MODERN-06: Add Scroll-to-Top on Navigation
**Issue:** When navigating between pages, the scroll position is retained from the previous page. If a user scrolls down the menu and clicks "About," they land mid-page.
**Fix:** Add a `ScrollToTop` component that calls `window.scrollTo(0, 0)` on every route change. Place it inside the `BrowserRouter`.

### MODERN-07: Add Image Optimization
**Issue:** Menu item images load as full-size originals with no optimization. No `srcset`, no WebP format, no responsive sizes.
**Fix:**
- Add `srcSet` and `sizes` attributes to menu item images
- Request the backend serve WebP variants (or use a CDN with auto-format)
- Add proper `width` and `height` attributes to prevent layout shift (CLS)
- Consider using `<picture>` element with WebP fallback to JPEG

### MODERN-08: Add Pull-to-Refresh on Mobile
**Issue:** Mobile users have no way to refresh data without manually reloading the browser. In PWA mode, there's no refresh affordance.
**Fix:** Implement pull-to-refresh on the Menu page and Order Status page. This is especially important for the `OrderStatusPage.tsx` where users are waiting for updates.

### MODERN-09: Enhance the Menu Page UX
**Suggestions for `MenuPage.tsx`:**
- Add a sticky category bar that scrolls horizontally (like food delivery apps)
- Highlight the current category as the user scrolls through the menu
- Add "scroll to category" when tapping a category chip
- Add an item count per category badge
- Add a "Back to top" floating button after scrolling past 3 screen heights
- Add a subtle animation when items first appear (stagger fade-in)

### MODERN-10: Add Dark Mode Support
**Issue:** The design system only has light mode colors. No `prefers-color-scheme: dark` support.
**Fix:**
- Add dark mode color tokens in `:root` under a `[data-theme="dark"]` selector or `@media (prefers-color-scheme: dark)`
- Dark palette suggestion: `--color-bg: #1a1612`, `--color-surface: #2a2520`, `--color-text: #f5f0eb`, keep `--color-primary: #d97706`
- Add a toggle in the header (sun/moon icon)
- Persist preference in localStorage

---

## PART 4 — SEO & PERFORMANCE

### SEO-01: Add Schema.org Structured Data
**File:** `index.html`
**Issue:** No JSON-LD structured data for search engines. Google won't show rich results (star ratings, hours, menu items).
**Fix:** Add JSON-LD scripts for:
- `Restaurant` / `LocalBusiness` schema (name, address, phone, hours, cuisine)
- `Menu` / `MenuItem` schema for menu items
- `BreadcrumbList` for navigation

### SEO-02: Add Missing Meta Tags
**File:** `index.html`
**Missing:**
- `<link rel="canonical" href="https://bakeandgrill.mv/order/" />`
- `<meta property="og:url" content="https://bakeandgrill.mv/order/" />`
- `<meta property="og:locale" content="en_US" />`
- `<meta name="twitter:card" content="summary_large_image" />`
- `<meta name="twitter:title" content="..." />`
- `<meta name="twitter:description" content="..." />`
- `<meta name="twitter:image" content="..." />`

### SEO-03: Add Dynamic Page Titles
**Issue:** Only `HomePage.tsx` sets `document.title`. Other pages (Menu, About, Contact, etc.) don't update the title, so the browser tab always says the same thing.
**Fix:** Add `useEffect(() => { document.title = 'Menu — Bake & Grill'; }, [])` to every page, or create a `usePageTitle(title: string)` hook.

### SEO-04: Generate `sitemap.xml` and `robots.txt`
**Issue:** No sitemap or robots.txt exists.
**Fix:** Add static `robots.txt` and `sitemap.xml` to `public/` folder.

### PERF-01: Reduce CSS Bundle Size
**File:** `src/index.css` (929 lines)
**Issue:** Large custom CSS file when Tailwind should handle most styling. Many classes may be unused.
**Fix:** After converting inline styles to Tailwind (QUALITY-01), audit `index.css` and remove unused custom CSS classes. The file should drop to ~200-300 lines (design tokens + a few custom components like footer, mobile nav, prayer bar).

### PERF-02: Add Resource Hints
**File:** `index.html`
**Fix:** Add preconnect/preload hints:
```html
<link rel="preload" href="/logo.png" as="image" />
<link rel="dns-prefetch" href="https://api.stripe.com" />
```
The font preconnects already exist (good).

---

## PART 5 — ACCESSIBILITY (A11Y)

### A11Y-01: Replace Emoji Icons with Proper SVGs + aria-labels
**Files:** `Layout.tsx` (mobile nav), `HomePage.tsx` (trust chips, categories)
**Issue:** Emojis (🏠, 🍽️, 🛒, 🕐, 📞, 🥐, 🍞, 🔥, 🎂, 🌅, ⚡, 💳, 💬) are used as functional icons. They render inconsistently across platforms, can't be styled, and screen readers announce them literally ("Pile of Poo" etc.).
**Fix:** Replace with inline SVGs (Lucide icons are lightweight and match the aesthetic). Keep emoji only where they're decorative content, not functional.

### A11Y-02: Add Skip-to-Content Link
**Issue:** There's a `.skip-link` class defined in CSS but it's not used in `Layout.tsx`.
**Fix:** Add `<a href="#main-content" className="skip-link">Skip to content</a>` as the first child of the layout, before the header. The `main` element already has `id="main-content"`.

### A11Y-03: Color Contrast Issues
**Issue:** Several text/background combinations may fail WCAG AA:
- Muted text (`#78716c`) on light background (`#fffbf5`) — contrast ratio ~4.1:1 (barely passes AA for large text, fails for small)
- Primary amber (`#d97706`) on white — contrast ratio ~3.3:1 (fails AA)
**Fix:** Darken muted text to at least `#6b6560` for 4.5:1 contrast. For primary color on white backgrounds (like the "Add" button text on cards), ensure the background is dark enough or use the primary as background with white text (which already passes).

### A11Y-04: Form Inputs Need Visible Labels
**File:** `CheckoutPage.tsx` (Field component)
**Issue:** The Field component has `<label>` elements but they're not associated with inputs via `htmlFor` / `id` attributes.
**Fix:** Generate unique IDs and connect labels to inputs with `htmlFor`/`id`.

### A11Y-05: Modal Needs `role="dialog"` and `aria-modal`
**File:** `ItemModal.tsx`
**Fix:** Add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the item name heading.

---

## PART 6 — TESTING

### TEST-01: Add Critical Path Tests
**Priority tests to add:**
1. `CartContext.test.tsx` — add item, update quantity, remove item, clear cart, localStorage persistence, cart total calculation
2. `MenuCard.test.tsx` — renders name/price, add to cart button, unavailable state, quantity stepper
3. `CheckoutPage.test.tsx` — form validation, order submission flow
4. `ItemModal.test.tsx` — modifier selection, price calculation, keyboard close
5. `api.test.ts` — API client error handling, auth token management

### TEST-02: Add Integration Tests
- Menu page: load categories → select category → add item → see cart update
- Checkout flow: cart with items → fill form → submit order → redirect to status
- Auth flow: request OTP → verify → see customer name in header

---

## EXECUTION ORDER

Work through these in priority order:

1. **BUG-01 through BUG-12** — Fix all bugs first
2. **QUALITY-03** — Fix the legacy color aliases (this unblocks everything else)
3. **QUALITY-01** — Convert inline styles to Tailwind (biggest impact on code quality)
4. **QUALITY-02** — Extract shared UI components
5. **QUALITY-04** — Add lazy loading for routes
6. **MODERN-04** — Fix mobile navigation icons
7. **MODERN-02** — Add skeleton loading states
8. **MODERN-03** — Add toast notifications
9. **MODERN-06** — Add scroll-to-top
10. **A11Y-01 through A11Y-05** — Accessibility fixes
11. **SEO-01 through SEO-04** — SEO improvements
12. **MODERN-01, 05, 07, 08, 09, 10** — Remaining modernization
13. **QUALITY-05, 06** — API caching and cart cleanup
14. **PERF-01, PERF-02** — Performance optimization
15. **TEST-01, TEST-02** — Testing

---

## RULES

- Use Tailwind CSS utilities for ALL styling. Inline `style={{}}` is banned going forward.
- Use CSS custom properties (`var(--color-*)`) for brand colors — never hardcode hex values in components.
- Every interactive element must be keyboard accessible.
- Every image must have a meaningful `alt` attribute.
- No `console.log/warn/error` in production code — gate behind `import.meta.env.DEV` or remove.
- Run `npm run build` after each major section to verify no TypeScript errors.
- Test on mobile viewport (375px width) after every UI change.
- Preserve all existing functionality — no regressions.
