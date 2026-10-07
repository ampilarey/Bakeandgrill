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

## On deploy

Nobody loses a type: Manager and Staff get all four by default, and the
migration `2026_10_08_140000_pos_order_type_permissions.php` gives them to every
custom role and every person who could ring sales. Turn types off afterwards.

A till still holding a permission list from before the deploy shows every type
until the cashier signs in again; the server enforces the switches either way.

## Where things live

| What | Where |
|---|---|
| Permissions | `PermissionCatalog::ORDER_TYPE_PERMISSIONS` (`pos.order_type.dine_in`, `.takeaway`, `.pickup`, `.delivery`) |
| Server check | `App\Domains\Orders\Support\PosOrderTypeGate` |
| Till | `allowedOrderTypes()` in `apps/pos-web/src/hooks/usePosPermissions.ts`; `OrderCart` `allowedOrderTypes` |
| Tests | `backend/tests/Feature/Pos/PosOrderTypePermissionsTest.php`, `OrderCart.layout.test.tsx`, `usePosPermissions.orderTypes.test.ts` |
