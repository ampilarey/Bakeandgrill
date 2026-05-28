# POS UAT — Blocked & Unavailable

## BLOCKED — Staff credentials required

**Count:** 127 test rows (see CSV `Status=BLOCKED`).

**Reason:** Valid **POS staff email + PIN** were not provided in this session. The following depend on `POST /api/auth/staff/pin-login` succeeding:

- Session persistence (A007, A008, A009)
- Device ID after re-login (B003)
- All logged-in header / mode toggles (C001–C006)
- Menu, cart, checkout, hold, send bill (E–N, most of H–M, K, L)
- All OPS areas (O–U) except what could be inferred from code
- Most mobile/tablet **flows** (W002–W004, W006–W009)
- Barcode with real catalog (I001–I003)
- Payment and refund flows with real orders

**Needed to complete:** Demo staff user with PIN, registered on UAT; optional seeded tables, menu items with modifiers and barcodes, and a known order ID for refunds/send-bill.

---

## NOT EXECUTED — Manual or tooling only

| IDs | Reason |
|-----|--------|
| B004 | Clear `localStorage` / site data to force new `pos_device_id` — requires DevTools or fresh profile |
| D002–D007 | Offline / reconnect / mid-session drop — browser MCP does not reliably simulate `navigator.onLine` |
| F007 | Menu load failure after retries — needs network throttling or API kill |
| K010 | Order creation API failure — needs 5xx simulation |
| V002 | Tables fetch failure — needs API error simulation |
| V005 | Inventory load failure — needs API error simulation |

**Needed:** Manual testing with Chrome DevTools (Network offline, throttling) or a staging mock.

---

## NOT AVAILABLE — Spec vs current POS UI

| ID | Gap |
|----|-----|
| T002 | Refund **status filter** — not exposed in `OpsPanel`; API supports query param only from code path `fetchRefunds(status?)`. |
| S007 | **Multiple purchase lines** in one purchase from OPS — use **+ Add line** on Receive stock (Operations → Inventory). |

---

## Exists in code but not verified live

All OPS and POS features in `App.tsx`, `useOrderCreation.ts`, `useOps.ts`, `OpsPanel.tsx`, `SendBillPanel.tsx` **are present in source** but were **not exercised** on UAT due to auth block. No evidence they are disabled on the server; only lack of credentials prevented execution.
