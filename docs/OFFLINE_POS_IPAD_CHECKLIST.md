# Offline POS — iPad manual checklist

Use on **test.bakeandgrill.mv/pos** before production rollout.

## Bootstrap (online)

1. Log in with staff PIN on a registered POS device.
2. Open shift with opening cash.
3. Confirm menu loads and a sale completes online (cash).
4. Force-refresh once — shift + menu should restore without re-open if shift still open server-side.

## Go offline

5. Enable airplane mode (or block Wi‑Fi) on the iPad.
6. Confirm banner: *Offline mode — cash, card, and transfer only*.
7. Confirm credit / BML / send-bill / open tickets refresh fail gracefully (no crash).

## Offline sale — cash

8. Ring a takeaway item, Charge → Cash → confirm.
9. Local receipt opens with `OFF-…` number.
10. Sync Status shows 1 pending order.

## Offline sale — card

11. Ring another item, Charge → Card → confirm.
12. Pending count increases; card total shown in Sync Status / close-shift warning.

## Offline sale — transfer

13. Ring item, Charge → Transfer → confirm.
14. Pending transfer total updates.

## Blocked offline

15. Attach customer with credit — Credit Account tender must be hidden/disabled offline.
16. Attempt promo/loyalty/gift card — must be rejected with clear message.

## Sync

17. Restore internet; wait ~60s or tap **Sync now** in Sync Status panel.
18. Pending clears; synced orders appear in admin Orders with matching local number in `offline_local_number`.

## Shift close

19. With pending offline orders, Close shift must block with **Sync now** button.
20. After sync completes, close shift succeeds; expected cash matches server summary.

## PWA update

21. With pending offline orders, POS update banner must not force reload.
22. After all orders synced, update may proceed (existing posUpdateSafety behaviour).

## Regression (online)

23. Online cash sale still works via normal `POST /orders` path.
24. KDS receives ticket once when offline order syncs (no duplicate on retry).
