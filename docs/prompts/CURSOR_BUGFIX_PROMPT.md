# Bake & Grill — Bug Fix Pass

You are fixing bugs in `apps/online-order-web` — a React 18 + Vite + React Router v6 app for a Maldivian cafe called Bake & Grill. The app uses inline styles, CartContext for global cart state, localStorage for persistence, and a custom `useCheckout` hook for the checkout flow.

**App root:** `apps/online-order-web/src/`
**Router:** `<BrowserRouter basename="/order">` in `main.tsx`
**Key files to understand before making changes:**
- `context/CartContext.tsx` — global cart state, saves to `localStorage("bakegrill_cart")`
- `hooks/useCheckout.ts` — checkout logic, reads cart from localStorage independently
- `components/Layout.tsx` — shared header/footer, reads auth from localStorage
- `components/AuthBlock.tsx` — OTP login, saves token to localStorage
- `pages/OrderStatusPage.tsx` — post-payment page, clears cart from localStorage

---

## BUG 1: Cart not cleared from React state after payment (Critical)

**File:** `pages/OrderStatusPage.tsx`, lines 59-63
**Also:** `context/CartContext.tsx`

**Problem:** When payment succeeds, `OrderStatusPage` does:
```ts
localStorage.removeItem("bakegrill_cart");
```
This removes the key from localStorage, but `CartContext`'s React state still holds the old cart items. When the user clicks "Order more" (navigates to `/`), the Layout remounts with CartProvider which still has the stale `cart` state. Worse, the `useEffect` in `CartProvider` (line 57) that syncs state TO localStorage runs and **writes the old cart back**, undoing the clear.

**Fix:** Import and use `useCart().clearCart()` in OrderStatusPage, OR dispatch a custom event that CartProvider listens for.

Option A (recommended — event-based, since OrderStatusPage is outside CartProvider's Layout route but still inside CartProvider in main.tsx):
```tsx
// OrderStatusPage.tsx — replace the localStorage.removeItem call:
useEffect(() => {
  if (paymentState === "CONFIRMED") {
    localStorage.removeItem("bakegrill_cart");
    window.dispatchEvent(new Event("cart_cleared"));
  }
}, [paymentState]);
```

```tsx
// CartContext.tsx — add listener in CartProvider:
useEffect(() => {
  const handleClear = () => setCart([]);
  window.addEventListener("cart_cleared", handleClear);
  return () => window.removeEventListener("cart_cleared", handleClear);
}, []);
```

Actually, looking at `main.tsx`, OrderStatusPage IS inside `<CartProvider>` (it wraps the entire BrowserRouter), so the simpler fix works:

```tsx
// OrderStatusPage.tsx
import { useCart } from '../context/CartContext';

// Inside the component:
const { clearCart } = useCart();

useEffect(() => {
  if (paymentState === "CONFIRMED") {
    clearCart();  // This updates React state AND triggers the localStorage save
  }
}, [paymentState, clearCart]);
```

Remove the old `localStorage.removeItem("bakegrill_cart")` call entirely.

---

## BUG 2: CartSummary doesn't include modifier prices (Critical)

**File:** `components/CartSummary.tsx`, line 27

**Current:**
```tsx
MVR {(item.price * item.quantity).toFixed(2)}
```

**Problem:** This only multiplies the base price by quantity. Modifiers are displayed on lines 19-22 but their prices are NOT added to the line total. If someone adds extra cheese (+MVR 5), the line total is wrong.

**Fix:**
```tsx
MVR {((item.price + (item.modifiers ?? []).reduce((s, m) => s + m.price, 0)) * item.quantity).toFixed(2)}
```

---

## BUG 3: AuthBlock doesn't save `online_customer_name` to localStorage (Critical)

**File:** `components/AuthBlock.tsx`, lines 34-36

**Current:**
```ts
const res = await verifyOtp({ phone, otp });
localStorage.setItem("online_token", res.token);
onSuccess(res.token, res.customer.name ?? res.customer.phone);
```

**Problem:** Layout.tsx (line 13) reads `localStorage.getItem('online_customer_name')` to show "Hi, {name}" in the header. But AuthBlock never writes that key. The greeting always shows null.

**Fix — add after the setItem call:**
```ts
const res = await verifyOtp({ phone, otp });
localStorage.setItem("online_token", res.token);
localStorage.setItem("online_customer_name", res.customer.name ?? res.customer.phone);
onSuccess(res.token, res.customer.name ?? res.customer.phone);
```

---

## BUG 4: AuthBlock doesn't dispatch `auth_change` event (Critical)

**File:** `components/AuthBlock.tsx`, line 35

**Problem:** Layout.tsx (lines 22-23) listens for custom `auth_change` event to re-sync auth state. The `storage` event only fires in OTHER tabs, not the current tab. After logging in, if the user navigates to a Layout-wrapped page, the header won't show the logged-in state until a full page reload.

**Fix — add after saving to localStorage in `handleVerify`:**
```ts
localStorage.setItem("online_token", res.token);
localStorage.setItem("online_customer_name", res.customer.name ?? res.customer.phone);
window.dispatchEvent(new Event("auth_change"));  // <-- ADD THIS
onSuccess(res.token, res.customer.name ?? res.customer.phone);
```

---

## BUG 5: Inconsistent env variable — `VITE_API_URL` vs `VITE_API_BASE_URL` (Critical)

**Files:**
- `pages/ReservationPage.tsx`, line 6: `import.meta.env.VITE_API_URL`
- `components/ReviewForm.tsx`, line 4: `import.meta.env.VITE_API_URL`
- `hooks/usePushNotifications.ts`, line 3: `import.meta.env.VITE_API_URL`
- `api.ts`, line 32: `import.meta.env.VITE_API_BASE_URL` (this is the correct one)

**Problem:** Three files use `VITE_API_URL` while the main `api.ts` uses `VITE_API_BASE_URL`. If the deployer sets `VITE_API_BASE_URL` (the documented/primary one), ReservationPage, ReviewForm, and usePushNotifications will ignore it and fall back to `/api`, which may point to the wrong server.

**Fix:** Change all three files to use `VITE_API_BASE_URL`:

```ts
// ReservationPage.tsx line 6:
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// ReviewForm.tsx line 4:
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// usePushNotifications.ts line 3:
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
```

Better yet, these files should import `API_BASE_URL` from `../api` instead of reading env vars independently. But the minimal fix is just changing the env var name.

---

## BUG 6: OrderStatusPage progress bar broken for "paid" status (Medium)

**File:** `pages/OrderStatusPage.tsx`, lines 194 and 328

**Problem:** The progress bar UI renders 4 steps:
```tsx
{["pending", "preparing", "ready", "completed"].map((s) => (
```

But `isStatusAtLeast()` uses a 6-step `STATUS_ORDER`:
```ts
const STATUS_ORDER = ["pending", "paid", "preparing", "ready", "out_for_delivery", "completed"];
```

When status is `"paid"`, `isStatusAtLeast("paid", "preparing")` returns `false` because index 1 < index 2. So only 1 out of 4 segments lights up. But "paid" means the order is confirmed and about to be prepared — it should show at least the first 2 segments.

**Fix:** The progress bar steps should account for "paid" being between "pending" and "preparing". Update `isStatusAtLeast` to treat "paid" as equivalent to "preparing" for progress display, OR update the progress bar to check both:

```tsx
// Simple fix — map "paid" to "preparing" for progress display purposes:
const progressStatus = order.status === "paid" ? "preparing" : order.status;

// Then use progressStatus instead of order.status in the progress bar:
background: isStatusAtLeast(progressStatus, s) ? "#1ba3b9" : "#dee2e6",
```

---

## BUG 7: LanguageContext doesn't set `dir`/`lang` on initial load (Medium)

**File:** `context/LanguageContext.tsx`, lines 34-44

**Problem:** `setLang()` updates `document.documentElement.lang` and `.dir`, but it's only called when the user CHANGES the language. On initial mount, if localStorage has `bakegrill_lang = "dv"`, the state initializes to `"dv"` but the document stays LTR with default lang. The page renders LTR with Dhivehi text until the user toggles twice.

**Fix — add a useEffect in LanguageProvider:**
```tsx
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("bakegrill_lang") as Lang | null;
    return saved ?? "en";
  });

  // Sync document attributes on mount and lang change
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "dv" ? "rtl" : "ltr";
  }, [lang]);

  // ... rest of the code
```

Note: You'll need to add `useEffect` to the import from React at the top of the file. Currently it only imports `createContext, useContext, useState, type ReactNode`.

---

## BUG 8: Font mismatch on standalone pages (Medium)

**Files:** `pages/CheckoutPage.tsx`, line 229 and `pages/OrderStatusPage.tsx`, line 363

**Current:**
```ts
fontFamily: "'Inter', sans-serif"
```

**Problem:** The app loads Poppins via Google Fonts (in `index.css`). Inter is never loaded. These two standalone pages (outside Layout) fall back to system sans-serif, looking visually different from all other pages.

**Fix:**
```ts
fontFamily: "'Poppins', sans-serif"
```

Change in both files.

---

## BUG 9: Missing `/privacy` route — dead link (Medium)

**File:** `components/Layout.tsx`, line 226

**Current:**
```tsx
<Link to="/privacy" style={...}>Privacy Policy</Link>
```

**Problem:** No `/privacy` route exists in `main.tsx`. No `PrivacyPage` component exists. Clicking renders a blank page.

**Fix — Option A (simple, recommended):** Change to an anchor tag pointing to a placeholder or remove it:
```tsx
<span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>Privacy Policy</span>
```

**Fix — Option B:** If you want to keep it as a link, add a simple catch-all route (see Bug 10).

---

## BUG 10: No catch-all 404 route (Medium)

**File:** `main.tsx`

**Problem:** Any unmatched URL (e.g., `/order/nonexistent` or the `/privacy` link from Bug 9) renders a completely blank page. No error message, no way back.

**Fix — add a catch-all route inside the Layout route:**
```tsx
<Route element={<Layout />}>
  <Route index element={<HomePage />} />
  <Route path="menu" element={<MenuPage />} />
  <Route path="about" element={<AboutPage />} />
  <Route path="contact" element={<ContactPage />} />
  <Route path="hours" element={<HoursPage />} />
  <Route path="reservations" element={<ReservationPage />} />
  {/* 404 catch-all */}
  <Route path="*" element={
    <div style={{ textAlign: 'center', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1c1e21', marginBottom: '0.5rem' }}>Page not found</h1>
      <p style={{ color: '#636e72', marginBottom: '1.5rem' }}>The page you're looking for doesn't exist.</p>
      <a href="/order/" style={{ color: '#1ba3b9', fontWeight: 600 }}>Back to home</a>
    </div>
  } />
</Route>
```

---

## BUG 11: `OrderStatusPage.sectionTitle` margin conflict (Low)

**File:** `pages/OrderStatusPage.tsx`, lines 462-470

**Current:**
```ts
sectionTitle: {
  fontSize: 16,
  fontWeight: 700,
  color: "#212529",
  paddingBottom: 12,
  borderBottom: "1px solid #f0f0f0",
  marginBottom: 16,   // <-- set here
  margin: 0,          // <-- then overridden to 0 by shorthand!
}
```

**Problem:** `margin: 0` is a shorthand that resets ALL margins, including the `marginBottom: 16` declared above it. The title has no bottom margin. Line 262 patches this with `{ ...styles.sectionTitle, marginBottom: 16 }` but the root style is wrong.

**Fix — remove `margin: 0` and use `marginTop: 0` instead:**
```ts
sectionTitle: {
  fontSize: 16,
  fontWeight: 700,
  color: "#212529",
  paddingBottom: 12,
  borderBottom: "1px solid #f0f0f0",
  marginTop: 0,
  marginBottom: 16,
}
```

And remove the redundant override on line 262:
```tsx
// Change this:
<h2 style={{ ...styles.sectionTitle, marginBottom: 16 }}>Items Ordered</h2>
// To this:
<h2 style={styles.sectionTitle}>Items Ordered</h2>
```

---

## BUG 12: Missing `logo.png` in dev public directory (Low)

**File:** `apps/online-order-web/public/` — only contains `manifest.json` and `sw.js`

**Also:** `apps/online-order-web/index.html` (favicon/apple-touch-icon), `components/Layout.tsx` lines 53 and 185 (header/footer logo)

**Problem:** During local Vite dev server, all references to `/logo.png` will 404. The file exists at `backend/public/logo.png` but Vite doesn't serve from there.

**Fix:** Copy `backend/public/logo.png` into `apps/online-order-web/public/logo.png`:
```bash
cp backend/public/logo.png apps/online-order-web/public/logo.png
```

---

## BUG 13: Dead `.product-image` CSS class with old purple gradient (Low)

**File:** `index.css`, lines 68-76

**Current:**
```css
.product-image {
  width: 100%;
  height: 160px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3.5rem;
}
```

**Problem:** No component uses `className="product-image"`. This is dead code with the old purple gradient that was replaced with inline teal-to-amber gradients.

**Fix:** Delete the entire `.product-image` block (lines 68-76). Also delete any other unused CSS classes. Candidates:
- `.product-card-modern` (lines 55-63) — not used (inline styles used instead)
- `.product-info` (lines 65-67) — not used
- `.product-name` (lines 69-73) — not used
- `.product-price` (lines 75-79) — not used
- `.add-button` (lines 81-91) — not used
- `.menu-item-card` (lines 113-123) — not used
- `.category-btn` (lines 125-131) — not used

All of these are dead — the components use inline styles. Remove them to reduce CSS bloat. Keep `.category-pill`, `.cart-card`, `.btn-primary`, `.header`, `.footer`, `.skip-link`, and the responsive media query classes as they ARE used.

---

## BUG 14: MenuPage category filter uses falsy check (Low)

**File:** `pages/MenuPage.tsx`, line 48

**Current:**
```ts
if (activeCategoryId) list = list.filter((i) => i.category_id === activeCategoryId);
```

**Problem:** If a category has `id: 0`, `activeCategoryId` would be `0` which is falsy. The filter would be skipped, showing all items instead of filtering.

**Fix:**
```ts
if (activeCategoryId !== null) list = list.filter((i) => i.category_id === activeCategoryId);
```

---

## Constraints

- **Do NOT change any API endpoints, response shapes, or backend code**
- **Do NOT install new dependencies**
- **Do NOT restructure the routing hierarchy** (Layout wraps public pages, standalone for Checkout/OrderStatus)
- **Do NOT change the CartContext serialization format** — other code depends on it
- **Keep all existing functionality working** — only fix bugs, don't add features
- **Match existing code style** — inline styles, no CSS modules

---

## Priority Order

Fix in this order (critical bugs first):

1. **Bug 1** — Cart not cleared after payment (users see old cart items)
2. **Bug 2** — CartSummary missing modifier prices (wrong totals shown)
3. **Bug 3 + Bug 4** — AuthBlock localStorage + event (fix together, same file)
4. **Bug 5** — Env variable mismatch (reservations/reviews hit wrong endpoint)
5. **Bug 6** — Progress bar wrong for "paid" status
6. **Bug 7** — LanguageContext RTL on initial load
7. **Bug 8** — Font mismatch (Inter → Poppins)
8. **Bug 9 + Bug 10** — Privacy link + 404 route (fix together)
9. **Bug 11** — sectionTitle margin
10. **Bug 12** — Copy logo.png for dev
11. **Bug 13** — Remove dead CSS
12. **Bug 14** — Category filter falsy check
