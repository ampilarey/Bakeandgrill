# Maldives GST Module — Bake & Grill

## Overview

Bake & Grill uses **General Sector GST at 8% (800 basis points)**. All tax math uses **integer laari** internally. Historical order totals are never recalculated; corrections use ledger adjustment entries.

**Tourism sector note:** Tourism GST was 16% from 1 Jan 2023 to 30 Jun 2025 and is 17% from 1 Jul 2025. Bake & Grill does not use tourism GST unless a separate tourism taxable activity is configured later.

## Admin access

**Finance → GST** (`/admin/gst`) — requires `reports.financial`.

### Settings

Configure under the **Settings** tab (or `PUT /api/admin/gst/settings`):

| Field | Default | Notes |
|-------|---------|-------|
| `accounting_basis` | `hybrid` | Changeable — not hard-coded |
| `default_tax_rate_bp` | `800` | General sector 8% |
| `sector` | `general` | |
| `tax_inclusive` | `false` | |

**Accounting basis (Maldives GST Act):**

- **Invoice basis** — legal default unless MIRA approves another method.
- **Hybrid (operational default)** — POS/walk-in/cash/card/BML posts output GST when payment is confirmed; B2B tax invoices post on invoice issue date.
- **Payment basis** — all output GST on payment confirmation.

Consult your accountant before changing accounting basis.

## Input GST on purchases — per item

Owner, 2026-09-06: "gst not return in cafe." Owner, 2026-09-07: "some items are
eligible for GST return." Both hold:

- The price typed on a purchase line is the money handed over, GST included.
- An inventory item can be marked **Bought with 8% GST that comes back**
  (`inventory_items.gst_rate_bp = 800`). Every purchase line for it is
  pre-ticked; a line can be un-ticked (a shop with no tax invoice) or ticked
  for an item that normally has none.
- The line stores the GST inside its price (`purchase_items.gst_laar`). The
  purchase adds its lines up: `gst_laar`, `amount_excluding_gst_laar` (the
  value the GST was charged on — the taxed lines only), `total_laar`.
- The claim is made only when the supplier TIN, tax invoice number and date
  are on the purchase and the claim is ticked. Otherwise the GST is posted to
  the ledger as **blocked**, with the reason, and stays in the cost.
- Cost figures (`PurchaseSpendQuery`, monthly sheet, P&L, the item's recorded
  unit cost at receipt) are net of GST that comes back and include GST that is
  blocked. The monthly sheet shows both amounts beside "Ingredients bought".

A purchase whose lines carry no GST is untouched: the whole-invoice figures a
person types for a claim still stand.

## MIRA exports

| Export | When required |
|--------|----------------|
| **Output Tax Statement (XLSX)** | Mandatory only when MIRA requires it — e.g. when annual total income for the previous tax year’s taxable periods reaches the MIRA threshold |
| **Input Tax Statement (XLSX)** | Whenever claiming input tax |

Sheets match MIRA layout: `TaxInvoices`, `OtherTransactions`, and `Input Tax Statement`.

## Workflow

1. Complete **GST Settings** (TIN, taxable activity number, seller details).
2. Run **`php artisan gst:backfill-ledger --from=YYYY-MM-DD --to=YYYY-MM-DD --dry-run`** after go-live to populate historical ledger entries.
3. Review **Reconciliation** warnings each period.
4. Export Input Tax Statement when filing input claims.
5. Export Output Tax Statement when MIRA threshold applies.
6. **Lock period** after filing to prevent mutations (adjustments post to next open period).

## API endpoints

- `GET /api/gst/bootstrap` — public tax rate for POS/online preview
- `GET /api/admin/gst/settings` / `PUT` — settings
- `GET /api/reports/finance/gst/summary?period=YYYY-MM`
- `GET /api/reports/finance/gst/output-statement?period=`
- `GET /api/reports/finance/gst/input-statement?period=`
- Export routes under `/api/reports/finance/gst/export/*`

Legacy `GET /api/reports/finance/tax` remains for Reports page compatibility.

## Accountant confirmation checklist

- [ ] MIRA-approved accounting basis documented
- [ ] TIN and taxable activity number verified
- [ ] Opening carry-forward input tax (if any)
- [ ] Sample XLSX validated against MIRA portal before first filing
- [ ] Hybrid posting rules understood for POS vs B2B
