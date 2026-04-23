# POS UAT Master Test Matrix — Bake & Grill

**Environment:** UAT — `https://test.bakeandgrill.mv/pos/`  
**App source:** `apps/pos-web/` (Vite SPA, API via `/api` same-origin in production)  
**Matrix version:** 2026-04-24 (full sweep update)  

## Code map (Phase 1)

| Concern | Primary files |
|--------|----------------|
| Shell / auth / device / online | `App.tsx` — `pos_token`, `pos_device_id`, `navigator.onLine`, `viewMode`, `fetchTables` after login |
| API | `api.ts` — staff login, orders, payments, tables, ops endpoints, SMS, send-bill |
| Offline queue | `offlineQueue.ts` — `localStorage` key `pos_offline_queue`, Web Locks, `/orders/sync` batch |
| Menu | `useMenu.ts` — `fetchCategories` + `fetchItems`, retries, `dataError` |
| Cart / payments UI | `useCart.ts`, `OrderCart.tsx` — lines, discount field, split tender |
| Checkout / hold / barcode / sync | `useOrderCreation.ts` — `createOrder` + `createOrderPayments`, hold/resume, `enqueue` when offline |
| OPS | `useOps.ts`, `OpsPanel.tsx` — shift, cash movements, sales summary, inventory, suppliers, purchases, refunds, SMS promo |
| Login | `LoginPage.tsx` — email + device ID + PIN pad; Sign In disabled if email empty or `pin.length < 4` |
| Menu / barcode | `MenuGrid.tsx` — order type, tables, categories, items, modifiers, barcode form |
| Send bill | `SendBillPanel.tsx` — Maldivian phone validation, `sendBill` API |

## Execution status legend

- **PASS** — Executed live on UAT in this run (browser automation).
- **BLOCKED** — Not executed; requires **staff email + PIN** (or other creds) not supplied in this session.
- **NOT EXECUTED** — Manual / environment only (offline, DevTools throttling, clear storage, API failure injection).
- **NOT AVAILABLE** — Test spec not met by current POS UI (feature gap documented).

---

## Area A — Access, login, session

| ID | Feature | Action | Expected | Credentials | Route | Status |
|----|---------|--------|----------|-------------|-------|--------|
| A001 | Open POS | Navigate to `/pos/` | Login UI loads | None | `/pos/` | PASS |
| A002 | Valid login | Email + PIN, Sign In | Main POS | Staff | `/pos/` | PASS |
| A003 | Invalid email | Wrong email + PIN | Error banner | None | `/pos/` | PASS |
| A004 | Invalid PIN | Valid-format email + wrong PIN | Error | None | `/pos/` | PASS |
| A005 | Blank email | Empty email | Cannot submit (disabled) | None | `/pos/` | PASS |
| A006 | Short PIN | PIN &lt; 4 digits | Sign In disabled | None | `/pos/` | PASS |
| A007 | Refresh session | F5 when logged in | Session persists | Staff | `/pos/` | PASS |
| A008 | Logout | Log out | Login screen | Staff | `/pos/` | PASS |
| A009 | Refresh after logout | F5 | Still logged out | Staff | `/pos/` | PASS |

## Area B — Device ID

| ID | Feature | Action | Expected | Credentials | Route | Status |
|----|---------|--------|----------|-------------|-------|--------|
| B001 | Auto device ID | First load | `POS-xxxxxxxx` | None | `/pos/` | PASS |
| B002 | Persist refresh | Reload | Same ID | None | `/pos/` | PASS |
| B003 | Stable re-login | Logout/login | Same ID | Staff | `/pos/` | PASS |
| B004 | New after clear | Clear `localStorage` | New ID | Manual | `/pos/` | NOT EXECUTED |
| B005 | Visible | Login shows device field; logged-in header shows device | Readable | None / Staff | `/pos/` | PASS |

## Area C — Header / shell / modes

| ID | Feature | Action | Expected | Credentials | Route | Status |
|----|---------|--------|----------|-------------|-------|--------|
| C001 | Title | Logged-in header | "Bake & Grill POS" | Staff | `/pos/` | PASS |
| C002 | Online badge | See Online/Offline | Visible | Staff | `/pos/` | PASS |
| C003 | Queue count | Header "Queue: N" | Visible | Staff | `/pos/` | PASS |
| C004 | POS mode | Click POS | POS UI | Staff | `/pos/` | PASS |
| C005 | OPS mode | Click OPS | OpsPanel | Staff | `/pos/` | PASS |
| C006 | Back to POS | From OPS | POS restored | Staff | `/pos/` | PASS |
| C007 | Site link | ← Main Website / ← Site | Opens `/` | None | `/` | PASS |

## Area D — Connectivity / offline

| ID | Feature | Action | Expected | Credentials | Status |
|----|---------|--------|----------|-------------|--------|
| D001 | Online use | Normal flow | APIs work | Staff | PASS |
| D002 | Offline badge | Disconnect | Offline | Manual | NOT EXECUTED |
| D003 | Queue offline | While offline | Count visible | Manual | NOT EXECUTED |
| D004 | Reconnect | Online returns | Badge green | Manual | NOT EXECUTED |
| D005 | Order offline | Checkout | Queued message | Staff+manual | NOT EXECUTED |
| D006 | Sync | Sync button | Batch sync | Staff+manual | NOT EXECUTED |
| D007 | Drop mid-session | Toggle network | No crash | Manual | NOT EXECUTED |

## Areas E–U — POS + OPS functional

Most rows remain **BLOCKED** in `pos_uat_test_matrix.csv` until cart/checkout/OPS mutations are exercised end-to-end. Partial coverage: **E001–E005** (tables fetch + order-type toggles), **F001–F002, F006** (menu API + reload), **O001** (OPS shell). See CSV for per-ID status.

See `pos_uat_test_matrix.csv` for full steps. Summary:

- **E** Tables / order types — `MenuGrid` + `App.tsx` table fetch.
- **F** Menu / categories — `useMenu`, loading and error states.
- **G** Items / modifiers — `MenuGrid` selection and `useCart`.
- **H** Cart — `OrderCart` qty, clear, payments, discount field.
- **I** Barcode — `lookupBarcode` + fallback to loaded items.
- **J** Discount / payments — payload vs displayed total (see bug report note).
- **K** Order creation / hold — `useOrderCreation`.
- **L** Payments — bundled in checkout `createOrderPayments`.
- **M** Hold / resume — hold + resume APIs.
- **N** Send bill — `SendBillPanel`.
- **O** Shifts — `OpsPanel` open/close.
- **P** Cash movements — in/out with reason.
- **Q** Sales summary — date range + `getSalesSummary`.
- **R** Inventory — adjust types adjustment/waste/correction.
- **S** Suppliers / purchases — single-line purchase UI in OpsPanel.
- **T** Refunds — list + create; **no filter control in POS UI** (T002 NOT AVAILABLE).
- **U** SMS promotions — preview + send in OPS.

## Area V — Error / resilience

| ID | Feature | Status |
|----|---------|--------|
| V001 | Login failure message | PASS |
| V002 | Tables fetch failure | NOT EXECUTED (simulate) |
| V003 | Order failure | BLOCKED |
| V004 | Send bill failure | BLOCKED |
| V005 | Inventory API failure | NOT EXECUTED (simulate) |

## Area W — Mobile / tablet

| ID | Feature | Status |
|----|---------|--------|
| W001 | Tablet layout 768×1024 | PASS (login) |
| W002–W004 | Tablet login / order / OPS | BLOCKED (viewport-specific runs not repeated this sweep) |
| W005 | Mobile layout 390×844 | PASS (login) |
| W006–W009 | Mobile login / cart / order / send bill | BLOCKED |

---

## Totals (this execution)

| Status | Count |
|--------|-------|
| PASS | 44 |
| BLOCKED | 95 |
| NOT EXECUTED | 11 |
| NOT AVAILABLE | 1 |
| **Total** | **151** |

**Evidence:** Staff UAT user `pos.uat.staff2@gmail.com`; use **`?nocache=`** or hard-refresh if the IDE browser serves an old `index-*.js` (CSP + cached localhost bundle). Full pass added **F5 session (A007)**, **post-logout F5 (A009)**, **OPS sales summary (Q001–Q004)**, **split tender add/remove (J005/J007)**, **empty checkout (K008)**, **shift shell (O002)**, **refunds section (T001)**. **Categories/menu:** backend returns `data` for `/categories`; POS expected `categories` — **fixed in** `apps/pos-web/src/api.ts` (**rebuild + deploy** `backend/public/pos/`). Remaining **BLOCKED** rows: cart line tests, checkout with payment, hold/resume, send bill, most OPS mutations.

Full machine-readable rows: `pos_uat_test_matrix.csv`.
