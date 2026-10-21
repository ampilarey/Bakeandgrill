# Order types per role and person

Owner, 2026-10-07: "Some time some staff mistakenly select pick up for dine in"
… "Set permission settings so i can turn off each type for all, for example pick
up and delivery turns off for staffs and on for a specific staff only. I need
full control."

## How to use it

| To | Where |
|---|---|
| Turn a type off (or on) for a whole role | Admin → Settings → Roles & Permissions → pick the role → POS → **Order type: Dine-in / Takeaway / Pickup / Delivery** |
| Allow it for one person anyway | Admin → Team → Staff → the person → Permissions (or Roles & Permissions with `?user=`) → that type → **Force allow** |
| Stop one person using a type their role has | the same row → **Force deny** |
| Put them back on the role | the same row → **Inherit from role** |

The owner always has every type.

## What it does

- The till shows only the types the person may ring. An order already of
  another type (resumed, or rung by someone else) keeps its type on show and
  can still be edited and charged; they just cannot switch an order to a type
  that is off for them. With every type off the cart says so.
- The server checks it too, so nothing gets round it: creating an order
  (`POST /orders`, `/orders/delivery`), the batch sync (`/orders/sync`, that
  one order is listed as failed, the rest go through) and switching an order's
  type (`PATCH /orders/{id}/items`) answer 403 "You are not allowed to ring
  Pickup orders. Ask the owner to allow it in Admin → Staff."
- Not checked: online orders by customers, and offline sales synced after the
  internet comes back (the sale already happened; the till did not offer the
  type in the first place).
- A change reaches a till that is already signed in within a minute: the till
  reads its person again every minute while it is on screen, as soon as it
  comes back on screen, and at once when the server refuses something it
  offered (`useStaffRefresh`). Until 2026-10-10 it kept the list from sign-in
  until the next sign-in or unlock (owner, 2026-10-10: Pickup switched off for
  cashiers still showed on a till, and Dine-in, switched on, did not).

## A new ticket asks (2026-10-21)

Owner: "Cashier mistakenly or carelessly charge takeaway orders as a dine in order. Because
by default its selected." A new ticket now starts on no type, and the first item asks with a
sheet: Dine-in and Takeaway big, Pickup and Delivery under them, only the types the person may
ring (a type turned off above is not offered). Dine-in goes on to the free tables, with "Not
seated yet" for a customer who sits down after ordering. A person allowed one type only is
never asked. Charge and Save refuse until a type is chosen, the type clears after every sale,
and a dine-in ticket with no table is reminded at Save and at Charge. Changing the type or the
table afterwards works as before.

Checked in a browser against a local server (owner's tablet width and a 390 px phone, the
owner, a counter cashier with two types and a takeaway-only cashier), which found two money
bugs beside the one reported: the public settings had stopped carrying the service charge
settings, so the till's cart never showed it on dine-in and Charge stopped with "Order total
changed" (fixed by `App\Support\PublicOperationalSettings`, the named list of operational keys
the public settings carry beside the content registry); and a flat-fee item switched from
dine-in to takeaway kept no packaging fee (fixed in `reconcilePackagingOnEligibleSwitch`).

## On deploy

Nobody loses a type: Manager and Staff get all four by default, and the
migration `2026_10_08_140000_pos_order_type_permissions.php` gives them to every
custom role and every person who could ring sales. Turn types off afterwards.

A till still holding a permission list from before the deploy shows every type
until it reads its person again (within a minute of running this version); the
server enforces the switches either way.

## Where things live

| What | Where |
|---|---|
| Permissions | `PermissionCatalog::ORDER_TYPE_PERMISSIONS` (`pos.order_type.dine_in`, `.takeaway`, `.pickup`, `.delivery`) |
| Server check | `App\Domains\Orders\Support\PosOrderTypeGate` |
| Till | `allowedOrderTypes()` and `startingOrderType()` in `apps/pos-web/src/hooks/usePosPermissions.ts`; `OrderCart` `allowedOrderTypes` |
| The ask at the first item | `components/OrderTypeSheet.tsx` (type and table modes), `hooks/useOrderTypeGate.ts` (holds the tap), `utils/tileRules.ts` (add or Configure) |
| Service charge and other pricing keys in the public settings | `App\Support\PublicOperationalSettings` (`PublicOperationalSettingsTest`) |
| Till keeping the list current | `apps/pos-web/src/hooks/useStaffRefresh.ts` (used by `usePosApp`); `PERMISSIONS_STALE_EVENT` in `api/client.ts`, fired on a 403 that is not about the till itself |
| Tests | `backend/tests/Feature/Pos/PosOrderTypePermissionsTest.php`, `OrderCart.layout.test.tsx`, `usePosPermissions.orderTypes.test.ts`, `useStaffRefresh.test.ts`, `client.deviceBlocked.test.ts` |
