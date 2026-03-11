# Bake & Grill — Full Cafe Website Layout Overhaul

You are transforming `apps/online-order-web` from a login-gated ordering form into a proper full cafe website with public pages, a landing page, and a browsable menu that doesn't require login.

## Project Context

- **App:** `apps/online-order-web/` — React 18 + Vite + Tailwind + React Router v6
- **Base path:** `<BrowserRouter basename="/order">`
- **Styling:** Tailwind + custom CSS in `index.css`, CSS vars (`--teal: #1ba3b9`, `--dark: #1c1e21`)
- **Font:** Poppins (Google Fonts)
- **API:** Uses `createApiClient()` from `@shared/api`, endpoints in `api.ts`
- **Auth:** OTP-based (phone → SMS code → token stored in localStorage as `online_token`)
- **Currency:** MVR (Maldivian Rufiyaa), prices in `base_price` as floats

---

## Current Problems

1. **No public pages** — The entire site requires OTP login before showing anything. Visitors can't even see the menu without signing in.
2. **No landing page** — Goes straight to a login form. No hero, no branding, no call-to-action.
3. **Dead footer links** — Footer has links to `/hours`, `/contact`, `/privacy` that don't exist.
4. **App.tsx is 926 lines** — One monolithic component handles login, menu browsing, cart, modals, and the entire layout. Unmaintainable.
5. **No shared layout** — Header and footer are copy-pasted between the logged-in and logged-out views in App.tsx. No reusable layout wrapper.
6. **No search** — `searchQuery` state exists but there's no search input rendered anywhere.
7. **No SEO** — No page titles, no meta descriptions, everything behind auth wall.

---

## Architecture Changes

### New File Structure

```
src/
├── main.tsx                    # Router setup (update)
├── api.ts                      # Keep as-is
├── index.css                   # Add new styles
├── components/
│   ├── Layout.tsx              # NEW — shared header + footer wrapper
│   ├── AuthBlock.tsx           # Keep as-is
│   ├── CartSummary.tsx         # Keep as-is
│   ├── CartDrawer.tsx          # NEW — extracted cart sidebar/drawer
│   ├── MenuCard.tsx            # NEW — extracted from App.tsx MenuCard component
│   └── ItemModal.tsx           # NEW — extracted modifier selection modal
├── pages/
│   ├── HomePage.tsx            # NEW — landing page
│   ├── MenuPage.tsx            # NEW — public menu browsing (rewrite existing stub)
│   ├── AboutPage.tsx           # NEW — about us page
│   ├── ContactPage.tsx         # NEW — contact page with map placeholder
│   ├── HoursPage.tsx           # NEW — opening hours page
│   ├── CheckoutPage.tsx        # Keep as-is
│   └── OrderStatusPage.tsx     # Keep as-is
├── hooks/
│   ├── useCheckout.ts          # Keep as-is
│   └── useCart.ts              # NEW — extracted cart logic from App.tsx
└── context/
    └── CartContext.tsx          # UPDATE — make functional with useCart hook
```

### Delete After Refactor
- `src/pages/CartPage.tsx` (unused, 72 lines)
- `src/pages/EventPage.tsx` (stub, 16 lines — merge event items into MenuPage)
- `src/data/mockItems.ts` (unused mock data)

---

## Implementation Details

### 1. Create `components/Layout.tsx` — Shared Layout Wrapper

Extract the duplicated header + footer from App.tsx into a reusable layout component.

```tsx
// components/Layout.tsx
import { Link, Outlet } from 'react-router-dom';

export function Layout() {
  const token = localStorage.getItem('online_token');
  // Get customer name from context or localStorage

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <header> {/* Use the EXACT same header from current App.tsx lines 432-472 */}
        {/* Logo: Bake & Grill */}
        {/* Nav links: Home, Menu, About, Contact */}
        {/* If logged in: "Hi, {name}" + Logout button */}
        {/* If not logged in: "Sign In" link button */}
      </header>

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      <footer className="footer">
        {/* Use the EXACT same footer from current App.tsx lines 599-627 */}
        {/* Update links to use <Link> from react-router instead of <a href> */}
      </footer>
    </div>
  );
}
```

**Navigation links in header:**
- Home → `/` (always visible)
- Menu → `/menu` (always visible)
- About → `/about` (always visible)
- Contact → `/contact` (always visible)
- If logged in: "Hi, {name}" + "Logout" pill button + "My Orders" link
- If not logged in: "Sign In" pill button → `/menu` (which shows auth inline at checkout)

**Footer links — update to match new routes:**
- Menu → `/menu`
- Opening Hours → `/hours`
- Contact Us → `/contact`
- Privacy Policy → `/privacy` (can be a simple static page)
- About Us → `/about`

### 2. Create `pages/HomePage.tsx` — Landing Page

A beautiful, modern landing page for the cafe. **No login required.**

**Sections (top to bottom):**

1. **Hero Section** (full-width, with gradient overlay)
   - Large heading: "Authentic Dhivehi Cuisine, Fresh Pastries & Premium Grills"
   - Subheading: "Order fresh food online from Bake & Grill Café, Malé"
   - Two CTA buttons: "Order Now →" (teal, links to `/menu`) and "View Menu" (outlined, links to `/menu`)
   - Background: Use a gradient matching the brand (`linear-gradient(135deg, rgba(27, 163, 185, 0.15), rgba(184, 168, 144, 0.1))`) or a placeholder food image div

2. **Features Strip** (3 columns on desktop, stacked on mobile)
   - "Fresh Daily" — "Made from scratch every morning"
   - "Quick Delivery" — "Hot food delivered across Malé"
   - "Order Online" — "Skip the queue, order from your phone"
   - Use simple text icons or CSS shapes (no emoji in production)

3. **Popular Items Preview** (horizontal scroll or 4-column grid)
   - Fetch first 4-8 items from `fetchItems()` API
   - Use the same MenuCard component (extracted)
   - "View Full Menu →" link at bottom
   - **This section loads real data from the API — no mock data**

4. **About Preview** (two-column: text left, placeholder right)
   - Short paragraph about Bake & Grill
   - "Majeedhee Magu, Malé, Maldives — Near ferry terminal"
   - "Learn More →" link to `/about`

5. **Opening Hours Quick View**
   - Call `fetchOpeningHoursStatus()` to show if currently open/closed
   - Simple hours display (can be hardcoded initially since API only returns open/closed status)
   - Link to `/hours`

**Styling:**
- Use Tailwind for layout (container, grid, flex, responsive)
- Match existing color scheme: `--teal` (#1ba3b9), `--dark` (#1c1e21), white cards
- Responsive: stack all columns on mobile
- Smooth scroll behavior

### 3. Rewrite `pages/MenuPage.tsx` — Public Menu Browsing

This is the core fix. **The menu must be browsable without login.** Login is only required at checkout.

**Extract from App.tsx:**
- Category sidebar + filtering logic
- Menu item grid (MenuCard component)
- Item modal (modifier selection)
- Cart sidebar/drawer
- Search functionality (the state exists but no input is rendered — ADD the search input)

**Layout (3-column on desktop):**
```
[Categories Sidebar] [Item Grid (3-4 cols)] [Cart Sidebar]
```

**On mobile:**
- Categories: horizontal scroll pills at top
- Items: 1-2 column grid
- Cart: fixed bottom drawer (same as current)

**Key behavior changes:**
- Menu loads immediately on page load (public, no auth needed)
- Category filter, search, and sort all work without login
- "Add to cart" works without login (cart stored in localStorage)
- When user clicks "Proceed to Checkout" → navigate to `/checkout`
  - CheckoutPage already handles auth (shows AuthBlock if no token)
  - So the menu never blocks on login

**Search input:** Add above the item grid:
```tsx
<input
  type="text"
  placeholder="Search menu items..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-teal-400 focus:outline-none"
/>
```

**Sort dropdown:** Add next to search:
```tsx
<select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
  <option value="name">Name A-Z</option>
  <option value="price-low">Price: Low to High</option>
  <option value="price-high">Price: High to Low</option>
</select>
```

### 4. Extract `components/MenuCard.tsx`

Move the `MenuCard` component (App.tsx lines 17-127) into its own file. Keep exact same styling and behavior.

```tsx
// components/MenuCard.tsx
import { useState } from 'react';
import type { Item } from '../api';
import { API_ORIGIN } from '../api';

type Props = {
  item: Item;
  onSelectItem: (item: Item) => void;
  onAddToCartWithQuantity: (item: Item, quantity: number) => void;
};

export function MenuCard({ item, onSelectItem, onAddToCartWithQuantity }: Props) {
  // ... exact same code from App.tsx lines 17-127
}
```

### 5. Extract `components/ItemModal.tsx`

Move the modifier selection modal (App.tsx lines 866-921) into its own component.

```tsx
// components/ItemModal.tsx
import type { Item, Modifier } from '../api';

type Props = {
  item: Item;
  selectedModifiers: Modifier[];
  onToggleModifier: (modifier: Modifier) => void;
  onAddToCart: () => void;
  onClose: () => void;
};

export function ItemModal({ item, selectedModifiers, onToggleModifier, onAddToCart, onClose }: Props) {
  // ... exact same modal code from App.tsx
}
```

### 6. Extract `hooks/useCart.ts`

Move all cart state and logic from App.tsx into a custom hook:

```tsx
// hooks/useCart.ts
export function useCart() {
  // cart state (from localStorage)
  // addItem, removeItem, updateQuantity, clearCart
  // cartTotal computed value
  // persist to localStorage on change
  // return { cart, cartTotal, addItem, updateQuantity, addItemWithQuantity, clearCart }
}
```

### 7. Create `pages/AboutPage.tsx`

Simple static page. **No login required.**

```
About Bake & Grill
─────────────────

[Hero banner with gradient]

Who We Are
─────────
Bake & Grill Café is a beloved eatery in the heart of Malé, serving authentic
Dhivehi cuisine alongside fresh-baked pastries and premium grills since [year].

Our Mission
───────────
To bring you the freshest, most delicious food made with locally sourced
ingredients and traditional recipes.

Location
────────
Majeedhee Magu, Malé, Maldives
Near the ferry terminal

[Map placeholder div with gray background]

Contact
───────
Phone: +960 9120011
Email: hello@bakeandgrill.mv
WhatsApp: +960 9120011
```

Style with the existing card pattern (white cards, 16px border-radius, subtle shadow).

### 8. Create `pages/ContactPage.tsx`

Simple contact page. **No login required.**

```
Contact Us
──────────

[Two-column layout]

Left: Contact form (name, email, message, send button)
  - Form can be non-functional initially (just show a "Thank you" alert on submit)
  - Style inputs same as CheckoutPage (rounded-10, border #dee2e6)

Right: Contact info card
  - Phone: +960 9120011
  - Email: hello@bakeandgrill.mv
  - WhatsApp: wa.me/9609120011
  - Address: Majeedhee Magu, Malé, Maldives
  - [Map placeholder]
```

### 9. Create `pages/HoursPage.tsx`

Opening hours page. **No login required.**

- Call `fetchOpeningHoursStatus()` to show live open/closed status at the top
- Display a weekly hours table (can be hardcoded initially):

```
Opening Hours
─────────────

[Live status: "We're Open!" (green) or "Currently Closed" (amber)]

Day          Hours
───────────  ─────────────
Saturday     6:00 AM – 11:00 PM
Sunday       6:00 AM – 11:00 PM
Monday       6:00 AM – 11:00 PM
Tuesday      6:00 AM – 11:00 PM
Wednesday    6:00 AM – 11:00 PM
Thursday     6:00 AM – 11:00 PM
Friday       2:00 PM – 11:00 PM
```

Style as a clean card with table rows.

### 10. Update `main.tsx` — New Router Config

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { HoursPage } from './pages/HoursPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderStatusPage } from './pages/OrderStatusPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/order">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/hours" element={<HoursPage />} />
          <Route path="/privacy" element={<AboutPage />} /> {/* Reuse about for now */}
        </Route>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders/:orderId" element={<OrderStatusPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
```

**Note:** CheckoutPage and OrderStatusPage stay OUTSIDE the Layout because they have their own headers (back button style).

### 11. Gut `App.tsx`

After extracting everything, **delete App.tsx entirely** or reduce it to a simple redirect:

```tsx
import { Navigate } from 'react-router-dom';
export default function App() {
  return <Navigate to="/" replace />;
}
```

All the menu logic moves to `MenuPage.tsx`. All the cart logic moves to `useCart.ts`. All the layout moves to `Layout.tsx`.

### 12. Update `index.css` — Add New Styles

Add styles for the new pages:

```css
/* Hero section */
.hero {
  background: linear-gradient(135deg, rgba(27, 163, 185, 0.12) 0%, rgba(184, 168, 144, 0.08) 100%);
  padding: 5rem 2rem;
  text-align: center;
}

.hero h1 {
  font-size: 3rem;
  font-weight: 800;
  color: var(--dark);
  line-height: 1.2;
  max-width: 700px;
  margin: 0 auto 1.5rem;
}

.hero p {
  font-size: 1.2rem;
  color: #636e72;
  max-width: 500px;
  margin: 0 auto 2rem;
}

.hero-buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Features strip */
.features-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  max-width: 1000px;
  margin: 0 auto;
  padding: 4rem 2rem;
}

.feature-card {
  text-align: center;
  padding: 2rem;
}

.feature-card h3 {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 0.5rem;
}

.feature-card p {
  color: #636e72;
  font-size: 0.95rem;
}

/* Section headings */
.section-heading {
  text-align: center;
  margin-bottom: 2.5rem;
}

.section-heading h2 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--dark);
}

.section-heading p {
  color: #636e72;
  margin-top: 0.5rem;
}

/* Page container */
.page-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 3rem 2rem;
}

/* Open/closed badge */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.25rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
}

.status-badge.open {
  background: #d4edda;
  color: #155724;
}

.status-badge.closed {
  background: #fff3cd;
  color: #856404;
}

/* Responsive */
@media (max-width: 768px) {
  .hero h1 {
    font-size: 2rem;
  }

  .hero {
    padding: 3rem 1.5rem;
  }

  .features-strip {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 2rem 1.5rem;
  }

  .page-container {
    padding: 2rem 1rem;
  }
}
```

---

## Cart State Management

The cart currently lives in App.tsx state with localStorage persistence. After the refactor:

1. Create `hooks/useCart.ts` with all cart logic extracted from App.tsx
2. Either use React Context (`CartContext`) or keep it as a standalone hook that reads/writes localStorage
3. Both `MenuPage` and `CheckoutPage` need access to the cart
4. The `Layout` header should show a cart item count badge

**Recommended approach:** Use `CartContext` wrapping the Layout in `main.tsx`:

```tsx
<CartProvider>
  <Routes>
    <Route element={<Layout />}>
      ...
    </Route>
  </Routes>
</CartProvider>
```

The existing `context/CartContext.tsx` file exists but may need updating to use the `useCart` hook internally.

---

## Constraints

- **Do NOT change any API endpoints or backend code.**
- **Do NOT change CheckoutPage or OrderStatusPage** (they work fine).
- **Keep the exact same color scheme** (`--teal: #1ba3b9`, `--dark: #1c1e21`).
- **Keep the same font** (Poppins).
- **Keep all existing functionality** — this is an additive refactor, not a rewrite.
- **Use React Router `<Link>`** instead of `<a href>` for internal navigation.
- **No emoji in production UI** — use CSS/SVG icons or simple text. The current hero uses `🍽️` which looks unprofessional. Replace with styled text or a CSS gradient shape.
- **Mobile-first responsive** — all new pages must work on 375px+ screens.
- **Don't install new dependencies** — use only what's already in package.json (React, React Router, Tailwind).

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `main.tsx` | UPDATE | New route config with Layout wrapper |
| `App.tsx` | DELETE or REDIRECT | All logic extracted to MenuPage + useCart |
| `components/Layout.tsx` | CREATE | Shared header + footer + Outlet |
| `components/MenuCard.tsx` | CREATE | Extracted from App.tsx |
| `components/ItemModal.tsx` | CREATE | Extracted from App.tsx |
| `components/CartDrawer.tsx` | CREATE | Extracted cart sidebar from App.tsx |
| `pages/HomePage.tsx` | CREATE | Public landing page |
| `pages/MenuPage.tsx` | REWRITE | Public menu browsing with search, sort, cart |
| `pages/AboutPage.tsx` | CREATE | Static about page |
| `pages/ContactPage.tsx` | CREATE | Contact form + info |
| `pages/HoursPage.tsx` | CREATE | Opening hours display |
| `hooks/useCart.ts` | CREATE | Extracted cart logic |
| `context/CartContext.tsx` | UPDATE | Wire to useCart hook |
| `index.css` | UPDATE | Add new page styles |
| `pages/CartPage.tsx` | DELETE | Unused |
| `pages/EventPage.tsx` | DELETE | Merge into MenuPage |
| `data/mockItems.ts` | DELETE | Unused |

**After this refactor:**
- Visitors can browse the full website without logging in
- The menu is publicly browsable with search and sort
- All footer links work
- The site has proper landing, about, contact, and hours pages
- App.tsx is gone — code is split into focused, maintainable components
- Login is only required at checkout
