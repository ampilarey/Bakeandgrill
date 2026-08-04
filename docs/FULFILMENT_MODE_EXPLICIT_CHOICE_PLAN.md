# Fulfilment Mode — Explicit Choice Plan (order app)

**App:** `apps/online-order-web` (customer ordering React app)
**Scope:** Frontend only. No backend, no migrations, no DB changes.
**Deploy:** quick TEST pull after `./scripts/build-all.sh order`.

---

## 1. Problem

Customers place pickup orders when they wanted delivery, because **pickup is never actually
chosen — it is a silent fallback that renders identically to a deliberate choice.**

The stored channel is read like this:

```16:19:apps/online-order-web/src/api/menu.ts
export function getSalesChannel(): SalesChannel {
  if (typeof localStorage === 'undefined') return 'online_pickup';
  return localStorage.getItem(SALES_CHANNEL_KEY) === 'delivery' ? 'delivery' : 'online_pickup';
}
```

Anything that is not literally `'delivery'` — including an empty localStorage on a first
visit — resolves to `online_pickup`. `OrderModeToggle` then paints the Pickup pill with the
filled primary background. On screen there is **no difference** between "customer chose
pickup" and "customer never touched the control".

Who is affected:

- Anyone reaching `/menu` without passing the home mode cards (bottom-nav Menu tab, QR code,
  shared link, saved shortcut).
- Returning customers — the choice persists in localStorage indefinitely.

Two related defects make this worse and are in scope:

- Switching mode at checkout **silently deletes** cart lines not sold on the new channel.
- When delivery is unavailable, checkout **silently flips** the customer to pickup.

---

## 2. Decisions already made (do not re-litigate)

| Question | Decision |
|---|---|
| Remove the menu toggle? | **No — keep it.** The menu is channel-filtered server-side (`fetchItems` sends `?channel=`), so the choice must precede browsing. |
| Add another selector to checkout? | **No — checkout already has one** (`order-type` accordion, first, open by default). Make it *confirm* instead of *assume*. |
| Hard-block Place Order until chosen? | **Yes, block.** A wrong-mode order costs more than one tap. |
| Reset the confirmation each order? | **No, persist it.** Regulars must not be re-prompted. |
| Force a choice before the menu loads? | **No.** Out of scope — neutral pills only. |

---

## 3. Current architecture (verified anchors)

**Single shared value.** localStorage key `bakegrill_sales_channel`, wrapped by
`getSalesChannel()` / `setSalesChannel()` in `src/api/menu.ts` (lines 14–25).
`setSalesChannel` dispatches a `sales_channel_change` window event.

**React layer.** `src/context/OrderModeContext.tsx` exposes `{ mode, setMode, channel }`,
initialises from `getSalesChannel()`, and re-syncs on `sales_channel_change`.

**Three places that set the mode:**

| Where | File | Explicit? |
|---|---|---|
| Home mode cards | `src/components/home/ModeEntryCards.tsx:147-150` | Yes |
| Menu segmented toggle | `src/components/OrderModeToggle.tsx` (rendered `src/pages/MenuPage.tsx:704-718`) | Yes |
| Checkout order-type buttons | `src/pages/CheckoutPage.tsx:308-338` | Yes |
| Checkout auto-fallback | `src/pages/CheckoutPage.tsx:206-209` | **No — automatic** |
| Delivery→pickup menu fallback | `src/api/menu.ts:211-218` (calls `setSalesChannel` directly) | **No — automatic** |

The last two must **not** count as a customer choice.

**Two different "delivery is blocked" definitions:**

```659:660:apps/online-order-web/src/pages/MenuPage.tsx
  const pickupBlocked = !isServiceAvailable('online_pickup');
  const deliveryBlocked = (isOpen === true && !deliveryAvailable) || !isServiceAvailable('online_delivery');
```

```198:198:apps/online-order-web/src/pages/CheckoutPage.tsx
  const deliveryBlocked = (orderElig != null && !orderElig.delivery.accepting) || !deliveryServiceAvailable;
```

Menu uses `delivery_available` from `fetchOnlineOrderingStatus`; checkout uses
`fetchOrderingEligibility().delivery.accepting`. They can disagree.

**Silent prune at checkout** (no toast; the MenuPage equivalent at lines 211–218 *does* warn):

```366:381:apps/online-order-web/src/hooks/useCheckout.ts
  useEffect(() => {
    const ch: SalesChannel = orderType === "delivery" ? "delivery" : "online_pickup";
    ...
    fetchItems(ch)
      .then((res) => {
        const ids = new Set((res.data ?? []).map((i) => i.id));
        pruneCartToAllowedItemIds(ids);
```

---

## 4. Implementation

Five phases. Ship as one branch; commit per phase is fine.

### Phase 1 — Track whether the customer actually chose

**`src/api/menu.ts`** — add next to the existing channel helpers:

```ts
const SALES_CHANNEL_CONFIRMED_KEY = 'bakegrill_sales_channel_confirmed';

export function isSalesChannelConfirmed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SALES_CHANNEL_CONFIRMED_KEY) === '1';
}

export function confirmSalesChannel(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SALES_CHANNEL_CONFIRMED_KEY, '1');
}
```

Do **not** call `confirmSalesChannel()` from the delivery→pickup fallback at `menu.ts:211-218`.

**`src/context/OrderModeContext.tsx`**:

- Add `modeConfirmed: boolean` to the context value, initialised from `isSalesChannelConfirmed()`.
- Change the signature to `setMode(next: OrderMode, opts?: { explicit?: boolean })`, defaulting
  to `explicit: true`. When explicit, call `confirmSalesChannel()` and set `modeConfirmed` state.
- Keep the existing early-return guard (`getSalesChannel() === nextChannel`) — but still confirm
  in that branch, because tapping the already-active pill is still a deliberate choice.
- Re-read `isSalesChannelConfirmed()` inside the existing `sales_channel_change` listener so the
  flag stays correct across the fallback path.

**`src/pages/CheckoutPage.tsx:206-209`** — the auto-fallback effect must pass
`{ explicit: false }` so an automatic flip never counts as a choice.

### Phase 2 — Stop pre-lighting Pickup

**`src/components/OrderModeToggle.tsx`** — read `modeConfirmed` from `useOrderMode()`.

- When `!modeConfirmed`: neither pill gets `background: 'var(--color-primary)'` / `color: '#fff'`.
  Both render in the neutral (transparent / muted) style.
- `aria-pressed` must be `false` for both pills when unconfirmed — that is accurate, nothing is chosen.
- Keep blocked-mode behaviour exactly as-is (tappable, `onBlockedTap`, reduced opacity).
- Add a small muted prompt beside/under the toggle when unconfirmed, using the new
  `mode.choose_prompt` key.

Note: the menu still loads the pickup list underneath while unconfirmed. That is accepted —
the pills are visually neutral, the data is not. Do not add a blocking interstitial.

### Phase 3 — Checkout confirms instead of assuming

All in **`src/pages/CheckoutPage.tsx`**:

- `const needsModeChoice = !modeConfirmed;` (from `useOrderMode()`).
- Force the accordion open while unconfirmed: `openId` already starts at `'order-type'` (line 113);
  additionally prevent `toggle('order-type')` from collapsing it while `needsModeChoice`.
- In `bodyOrderType` (lines 308-338), do **not** apply `S.typeBtnActive` to either button while
  `needsModeChoice`, mirroring Phase 2.
- Accordion `summary` (line 1055): show `t('checkout.choose_order_type')` instead of the current
  mode while `needsModeChoice`.
- Sticky CTA: add `|| needsModeChoice` to the `disabled` expression at lines 1116-1122, and set
  `placeLabel` to `t('checkout.choose_order_type')` when `needsModeChoice` (keep existing
  `placeBlockedByGate` precedence — gate closed still wins).
- Add a short hint line into `stickyAbove` (lines 911+) when `needsModeChoice`, using
  `checkout.choose_order_type_hint`.

Tapping either button calls `setOrderType(type)` → explicit → confirmed → CTA unlocks.

### Phase 4 — Surface the two silent behaviours

**(a) Prune notice at checkout.** `useCheckout` has no toast access and `CheckoutPage` does not
import one. Wire it as:

- In `useCheckout.ts` (effect at 366-381), count lines that will be removed **before** pruning
  (same shape as `MenuPage.tsx:213`), and expose
  `lastChannelPrune: { count: number; at: number } | null` from the returned object (line 1121+).
- In `CheckoutPage.tsx`, `import { useToast } from '../context/ToastContext'` and add an effect
  that fires `showToast` when `lastChannelPrune.at` changes, reusing the existing keys
  `menu.toast_prune_one` / `menu.toast_prune_many` with `{n}` replaced.

**(b) Auto-fallback notice.** When the effect at `CheckoutPage.tsx:206-209` flips the mode,
show a toast explaining it — `t('checkout.delivery_unavailable')` for delivery→pickup, and a new
`checkout.pickup_unavailable_switched` for the reverse. Fire once per flip, not per render.

### Phase 5 — One definition of "delivery blocked"

Create **`src/utils/fulfilmentAvailability.ts`** with pure functions:

```ts
export function isDeliveryBlocked(args: {
  isOpen: boolean | null;
  deliveryAvailable: boolean;       // gate API delivery_available
  eligibilityAccepting: boolean | null; // fetchOrderingEligibility, null = unknown
  serviceAvailable: boolean;        // ServiceStatusContext 'online_delivery'
}): boolean;

export function isPickupBlocked(args: { serviceAvailable: boolean }): boolean;
```

Semantics: blocked when the service flag is off, **or** eligibility is known and not accepting,
**or** the shop is open and `delivery_available` is false. Unknown (`null`) eligibility must not
block.

- `MenuPage.tsx:659-660` and `CheckoutPage.tsx:198` both switch to these helpers.
- `MenuPage` must additionally call `fetchOrderingEligibility()` (already used by checkout,
  public endpoint) and feed `eligibilityAccepting`. Failure → `null`, never blocking.

---

## 5. i18n keys

Add to `TRANSLATIONS` in `src/context/LanguageContext.tsx` (single English map; there is no
second locale map to update):

| Key | English |
|---|---|
| `mode.choose_prompt` | `Choose pickup or delivery` |
| `checkout.choose_order_type` | `Choose pickup or delivery` |
| `checkout.choose_order_type_hint` | `Select how you want your order before placing it.` |
| `checkout.pickup_unavailable_switched` | `Pickup is unavailable right now — switched to delivery.` |

Reuse existing keys, do not duplicate: `mode.pickup`, `mode.delivery`, `mode.toggle_aria`,
`checkout.acc_order_type`, `checkout.type_pickup`, `checkout.type_delivery`,
`checkout.delivery_unavailable`, `menu.toast_prune_one`, `menu.toast_prune_many`.

---

## 6. Tests

Extend:

- `src/context/OrderModeContext.test.tsx` — `modeConfirmed` false on fresh storage; true after
  `setMode('delivery')`; **still false** after `setMode('pickup', { explicit: false })`; still
  false after a `sales_channel_change` fired by the delivery→pickup fallback; tapping the
  already-active mode confirms.
- `src/components/OrderModeToggle.test.tsx` — unconfirmed renders neither pill active
  (`aria-pressed=false` on both); after a tap the tapped pill is active; blocked behaviour unchanged.

Add:

- `src/pages/CheckoutPage.orderTypeGate.test.tsx` — Place button disabled while unconfirmed with
  the choose label; enabled after tapping Pickup; already-confirmed customers see no gate.
- `src/pages/CheckoutPage.channelPrune.test.tsx` — switching mode with an ineligible cart line
  toasts the prune message.
- `src/utils/fulfilmentAvailability.test.ts` — truth table for the helper, including
  `eligibilityAccepting: null` not blocking.

Run the full suite (`npm test -- --run` in `apps/online-order-web`) plus `npx tsc --noEmit`.

---

## 7. Acceptance criteria

1. Fresh browser → `/menu`: neither pill is filled; a prompt to choose is visible.
2. Fresh browser → straight to checkout: Place Order is disabled and labelled to choose; the
   Order Type section is open and cannot be collapsed until a choice is made.
3. Tapping Pickup or Delivery anywhere (home card, menu toggle, checkout button) unlocks
   everything and is remembered on reload.
4. An automatic delivery→pickup flip (blocked delivery, or empty delivery menu) does **not**
   count as a choice, and the customer is told it happened.
5. Switching mode at checkout with an ineligible cart line shows a removal toast.
6. Delivery availability agrees between menu and checkout — a mode selectable on the menu is not
   silently rejected at checkout.
7. Existing customers with a stored channel are **not** re-prompted (see migration note below).

**Migration note:** existing customers have `bakegrill_sales_channel` set but no confirmation
flag, so they would be prompted once. That is acceptable and intentional — it is a one-time tap
that also corrects anyone stuck on a stale default. Do not back-fill the flag.

---

## 8. Out of scope

- Blocking interstitial before the menu loads.
- Any backend, API, or migration change.
- Using `next_delivery_window` for richer "delivery opens at…" copy (unused today; separate task).
- Making the island zone check a hard block at submit (currently soft; unchanged).

---

## 9. Ship steps

```bash
cd apps/online-order-web && npm test -- --run && npx tsc --noEmit
cd ../.. && ./scripts/build-all.sh order
git add -A && git commit && git push origin main
```

Then the quick TEST pull (order-app UI only, no migrations):

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv && git pull origin main && cd backend && php artisan config:cache && php artisan route:cache && php artisan view:clear && php artisan queue:restart && git log -1 --oneline
```
