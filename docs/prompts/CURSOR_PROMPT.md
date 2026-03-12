# Bake & Grill — Color Scheme & Polish Pass

You are improving `apps/online-order-web` — a React 18 + Vite + Tailwind + React Router v6 app for a Maldivian café. The architecture is already solid (Layout wrapper, public pages, CartContext, etc). This pass focuses on **color scheme fixes, accessibility, and visual polish**.

## Project Context

- **App:** `apps/online-order-web/src/`
- **Router:** `<BrowserRouter basename="/order">`
- **Styling:** Mix of Tailwind classes and inline `style={{}}` objects. CSS vars defined in `index.css`
- **Font:** Poppins (Google Fonts)
- **Currency:** MVR (Maldivian Rufiyaa)
- **Total files:** ~3,200 lines across 20 files

---

## Current CSS Variables (`index.css :root`)

```css
--teal: #1ba3b9;
--teal-hover: #148a9d;
--amber: #D97706;       /* DECLARED BUT NEVER USED ANYWHERE */
--dark: #1c1e21;
--text: #2d3436;
--border: #e9ecef;
--bg: #f5f7f8;
--surface: #ffffff;
--surface-2: #f8f9fa;
--text-muted: #6c757d;
```

---

## TASK 1: Use `--amber` for prices and "Add to Cart" buttons

**Problem:** `--amber` (#D97706) is declared but never referenced. Teal does everything: nav links, buttons, prices, active states, focus rings. Nothing stands out.

**Fix:** Use amber as the "action/commerce" color. Teal stays for navigation, links, and informational UI.

### Files to change:

**`components/MenuCard.tsx`:**
- Price display (currently `color: '#1ba3b9'`) → change to `color: 'var(--amber)'` or `'#D97706'`
- "Add to cart" button background (currently `#1ba3b9`) → change to `#D97706`
- "Add to cart" button hover → `#B45309` (darker amber)
- Keep "Customize" button as teal (it's informational, not a purchase action)

**`components/CartDrawer.tsx`:**
- Cart total price (currently `color: '#1ba3b9'`) → `#D97706`
- "Proceed to Checkout" button → keep teal (navigation action, not purchase)

**`components/ItemModal.tsx`:**
- Price display → `#D97706`
- "Add to Cart" button → `#D97706` with hover `#B45309`

**`pages/MenuPage.tsx`:**
- Any inline price colors → `#D97706`

**`pages/HomePage.tsx`:**
- Featured item prices (if displayed) → `#D97706`
- "Order Now" CTA button in hero → change to amber (`#D97706`) since it's a purchase action
- "View Menu" CTA → keep as white/outlined (informational)

**`pages/CheckoutPage.tsx`:**
- "Pay MVR X with BML" button → `#D97706` background (this is THE purchase action)
- Summary total → `#D97706`

**`pages/OrderStatusPage.tsx`:**
- Item prices in order details → `#D97706`
- Keep status colors as-is (they're semantic: green=success, blue=preparing, etc)

**`components/CartSummary.tsx`:**
- Item total prices → `#D97706`

### Summary of color roles after this change:

| Color | Role | Where |
|-------|------|-------|
| Teal `#1ba3b9` | Navigation, links, info, categories | Nav links, category pills, "Customize" button, focus rings |
| Amber `#D97706` | Commerce, prices, purchase actions | Prices, "Add to Cart", "Pay", cart totals |
| Dark `#1c1e21` | Text, headings | Body text, headings, footer bg |

---

## TASK 2: Fix placeholder gradient to use brand colors

**Problem:** Items without images get a purple gradient (`rgba(102,126,234)` → `rgba(118,75,162)`) that has nothing to do with the teal/amber brand.

**File:** `components/MenuCard.tsx`

**Current (around line 35-40):**
```tsx
background: `linear-gradient(${45 + (item.id * 30)}deg, rgba(27,163,185,0.25), rgba(118,75,162,0.2))`
```

**Change to:**
```tsx
background: `linear-gradient(${45 + (item.id * 30)}deg, rgba(27,163,185,0.2), rgba(217,119,6,0.15))`
```

This uses teal-to-amber, matching the brand palette. The angle still varies by item ID for visual variety.

Also change the placeholder emoji `☕` to a simple SVG icon or text:
```tsx
// Instead of emoji:
<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
  <path d="M3 6h18v2a6 6 0 01-6 6H9a6 6 0 01-6-6V6z" />
  <path d="M6 18h12" />
  <path d="M9 14v4" />
  <path d="M15 14v4" />
</svg>
```

---

## TASK 3: Fix disabled button contrast (WCAG fail)

**File:** `index.css`

**Current:**
```css
.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

**Problem:** `#ccc` background with white text is ~2.5:1 contrast ratio. WCAG AA requires 4.5:1.

**Fix:**
```css
.btn-primary:disabled {
  background: #8e9aab;
  color: white;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

`#8e9aab` with white text gives ~4.6:1 contrast ratio (passes AA).

---

## TASK 4: Remove broken dark mode

**File:** `index.css`

**Problem:** The `@media (prefers-color-scheme: dark)` block swaps CSS vars, but **every page component uses hardcoded inline colors** like:
- `background: 'white'` / `background: '#fff'`
- `color: '#212529'` / `color: '#1c1e21'`
- `background: '#f8f9fa'`
- `border: '1px solid #e9ecef'`

These inline styles override CSS vars, so dark mode users see a broken mix of dark backgrounds with hardcoded white cards and dark text on dark backgrounds.

**Fix:** Delete the entire `@media (prefers-color-scheme: dark)` block (lines ~21-38 in `index.css`). Dark mode should only be added back when ALL inline styles are migrated to use CSS vars.

---

## TASK 5: Replace emoji icons with text or CSS

**Problem:** Production UI uses emojis (🔥📱📅🏠☕🍽️🤷🔍) which render differently across devices, look unprofessional, and have accessibility issues (screen readers read them inconsistently).

### Replace in these files:

**`pages/HomePage.tsx`:**
- Feature icons (`🔥📱📅🏠`) → Replace with simple CSS circles with text initials or descriptive text headers. For example:
  ```tsx
  // Instead of icon: '🔥'
  // Use a styled div:
  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(27,163,185,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1ba3b9', fontWeight: 700, fontSize: '1.2rem' }}>
    F
  </div>
  ```
  Or simply remove the icon divs and let the titles speak for themselves.

**`pages/MenuPage.tsx`:**
- Search icon `🔍` → Use a simple text "Search..." placeholder or CSS `::before` pseudo-element
- Loading state `🍽️` → Replace with "Loading menu..." text
- Empty state `🤷` → Replace with "No items found" text (no emoji)

**`pages/AboutPage.tsx`:**
- Value card icons (`🌿🤝✨📱`) → Same treatment as HomePage features: CSS circles or just remove

**`pages/ContactPage.tsx`:**
- Contact icons (`📞✉️💬📍`) → Use text labels instead: "Phone", "Email", "WhatsApp", "Address"

**`pages/HoursPage.tsx`:**
- Open/closed indicators → Already uses CSS dots, keep those. Remove any emoji if present.

**`pages/OrderStatusPage.tsx`:**
- Status icons (`⏳👨‍🍳✅🛵🎉❌`) → Keep these as they're in a status mapping object and are semantic. They add meaning in this context. But if you want to be thorough, replace with text badges.

**`components/ReviewForm.tsx`:**
- Star icons `★` → These are fine (they're Unicode, not emoji). Keep as-is.

**Priority:** Focus on HomePage and MenuPage first (highest traffic). AboutPage and ContactPage are lower priority.

---

## TASK 6: Wire up LanguageContext translations

**Problem:** `context/LanguageContext.tsx` defines 20+ translation keys for English and Dhivehi (with RTL support), but no component actually uses the `useLanguage()` hook. All text is hardcoded in English.

**Fix (minimum viable):**
- In `Layout.tsx` header, add a language toggle button (EN / ދވ)
- In `MenuPage.tsx`, use `t('menu.title')`, `t('menu.search')`, `t('cart.title')`, `t('cart.empty')`, `t('cart.checkout')`
- In `CartDrawer.tsx`, use `t('cart.title')`, `t('cart.empty')`, `t('cart.checkout')`
- Keep other pages in English for now

**How to use:**
```tsx
import { useLanguage } from '../context/LanguageContext';

function MyComponent() {
  const { t, language, setLanguage } = useLanguage();
  return <h1>{t('menu.title')}</h1>; // "Menu" or "މެނޫ"
}
```

---

## TASK 7: Small UX fixes

### 7a. Quantity buttons too small on mobile
**File:** `components/CartDrawer.tsx`
- Current: 22px circular buttons
- Fix: Increase to 32px minimum (44px is ideal touch target per Apple HIG)

### 7b. Add loading skeletons
**File:** `pages/MenuPage.tsx`
- Instead of emoji loading indicator, show 4-8 placeholder cards with pulsing gray rectangles:
```tsx
{loading && Array.from({ length: 8 }).map((_, i) => (
  <div key={i} style={{
    background: '#f1f3f5',
    borderRadius: '16px',
    height: '320px',
    animation: 'pulse 1.5s ease-in-out infinite',
  }} />
))}
```

Add to `index.css`:
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 7c. Add `<title>` per page
Each page should set `document.title` on mount:
```tsx
useEffect(() => { document.title = 'Menu — Bake & Grill'; }, []);
```

Pages:
- HomePage: "Bake & Grill — Fresh Food in Malé"
- MenuPage: "Menu — Bake & Grill"
- AboutPage: "About — Bake & Grill"
- ContactPage: "Contact — Bake & Grill"
- HoursPage: "Hours — Bake & Grill"
- CheckoutPage: "Checkout — Bake & Grill"
- OrderStatusPage: "Order #XXX — Bake & Grill"

---

## Constraints

- **Do NOT change any API endpoints, types, or backend code**
- **Do NOT change routing structure or Layout wrapper**
- **Do NOT install new dependencies** — use only what's in package.json
- **Do NOT change CheckoutPage's hook logic** (`useCheckout.ts`) — only change styles/colors
- **Keep Poppins font, keep border-radius: 16px card pattern**
- **Test on mobile (375px)** — all touch targets must be 32px+ minimum

---

## Priority Order

1. **Task 1** (amber for prices/commerce) — biggest visual impact
2. **Task 3** (disabled button contrast) — accessibility fix
3. **Task 4** (remove dark mode) — prevents broken rendering
4. **Task 2** (placeholder gradient) — brand consistency
5. **Task 5** (replace emojis) — professionalism
6. **Task 7** (UX fixes) — polish
7. **Task 6** (translations) — lowest priority, do if time permits
