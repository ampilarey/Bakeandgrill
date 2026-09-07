<?php

declare(strict_types=1);

namespace App\Domains\Gst\Services;

use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;

/**
 * Input GST on purchases, decided line by line.
 *
 * Owner, 2026-09-06: "gst not return in cafe" — so the price typed on a
 * purchase line was the money gone, tax and all. Owner, 2026-09-07: "some
 * items are eligible for GST return." Both stay true: the typed price is
 * still what was handed over, and for an item bought with claimable GST
 * the 8% inside that price comes back from MIRA once a tax invoice is on
 * file, so it stops being cost.
 *
 * Each inventory item says whether it is bought with GST. Every purchase
 * line takes that as its default and can be overridden; the line records
 * the GST inside its price. The purchase adds its lines up: GST, the
 * amount before GST, and whether the claim can actually be made — which
 * needs the supplier's TIN and the tax invoice number and date. Without
 * those the GST is still shown, as blocked, so the owner can see what
 * fetching the invoice would be worth.
 *
 * A purchase whose lines carry no GST is left exactly as it was: the
 * header-level figures a person typed for a whole-invoice claim still
 * stand.
 */
final class PurchaseGstService
{
    public const DEFAULT_RATE_BP = 800;

    /** The rate a line is bought at: what was asked, else the item's own. */
    public function rateFor(mixed $requested, ?InventoryItem $item): int
    {
        if ($requested !== null && $requested !== '') {
            return max(0, (int) $requested);
        }

        return (int) ($item?->gst_rate_bp ?? 0);
    }

    /**
     * The GST inside a GST-inclusive amount: 108.00 at 8% holds 8.00.
     */
    public function gstInside(float $totalInclusive, int $rateBp): int
    {
        if ($rateBp <= 0 || $totalInclusive <= 0) {
            return 0;
        }
        $totalLaar = (int) round($totalInclusive * 100);

        return $totalLaar - (int) round($totalLaar * 10000 / (10000 + $rateBp));
    }

    /**
     * What one unit really costs once its claimable GST comes back. The
     * typed unit price when the purchase cannot claim.
     */
    public function netUnitCost(PurchaseItem $line, Purchase $purchase): float
    {
        $unit = (float) $line->unit_cost;
        $gst = (int) ($line->gst_laar ?? 0);
        $totalLaar = (int) round((float) $line->total_cost * 100);
        if ($gst <= 0 || $totalLaar <= 0 || !(bool) $purchase->is_input_tax_claimable) {
            return $unit;
        }

        return round($unit * ($totalLaar - $gst) / $totalLaar, 6);
    }

    /**
     * Sum the lines of a payload before it is stored, so the header can be
     * judged for claimability on what the purchase will contain.
     *
     * @param list<array<string, mixed>> $items
     *                                          `amount_excluding_gst_laar` is the value the GST was charged on — the
     *                                          taxed lines less their GST — not the whole order less GST. A line
     *                                          with no GST is outside the claim, and MIRA reconciles the claim
     *                                          against the base it was charged on.
     * @return array{gst_laar: int, total_laar: int, amount_excluding_gst_laar: int, lines_with_gst: int}
     */
    public function previewLines(array $items): array
    {
        $ids = array_values(array_filter(array_map(fn ($l) => isset($l['inventory_item_id']) ? (int) $l['inventory_item_id'] : null, $items)));
        $defaults = $ids === [] ? [] : InventoryItem::query()->whereIn('id', $ids)->pluck('gst_rate_bp', 'id')->all();

        $gst = 0;
        $total = 0;
        $taxable = 0;
        $withGst = 0;
        foreach ($items as $line) {
            $lineTotal = round((float) ($line['quantity'] ?? 0) * (float) ($line['unit_cost'] ?? 0), 2);
            $requested = $line['gst_rate_bp'] ?? null;
            $rate = ($requested !== null && $requested !== '')
                ? max(0, (int) $requested)
                : (int) ($defaults[(int) ($line['inventory_item_id'] ?? 0)] ?? 0);
            $lineGst = $this->gstInside($lineTotal, $rate);
            $gst += $lineGst;
            $total += (int) round($lineTotal * 100);
            if ($lineGst > 0) {
                $withGst++;
                $taxable += (int) round($lineTotal * 100) - $lineGst;
            }
        }

        return ['gst_laar' => $gst, 'total_laar' => $total, 'amount_excluding_gst_laar' => $taxable, 'lines_with_gst' => $withGst];
    }

    /**
     * Fold the payload's line GST into the header fields the validator and
     * the ledger read, when any line carries GST. Whole-invoice figures a
     * person typed are left alone otherwise.
     *
     * @param array<string, mixed> $data
     * @param list<array<string, mixed>> $items
     * @return array<string, mixed>
     */
    public function applyLinesToPayload(array $data, array $items): array
    {
        $preview = $this->previewLines($items);
        if ($preview['lines_with_gst'] === 0) {
            return $data;
        }

        $data['gst_laar'] = $preview['gst_laar'];
        $data['total_laar'] = $preview['total_laar'];
        $data['amount_excluding_gst_laar'] = $preview['amount_excluding_gst_laar'];
        $data['gst_rate_bp'] = self::DEFAULT_RATE_BP;
        $data['lines_with_gst'] = $preview['lines_with_gst'];
        // The claim flag stays as asked, so a claim asked for without the
        // tax-invoice details still fails validation and says what is
        // missing. rollup() decides what is stored once the lines are in.
        $data['is_input_tax_claimable'] = !empty($data['is_input_tax_claimable']);
        $claimable = $this->canClaim($data);
        $data['claim_block_reason'] = $claimable ? null : $this->blockReason($data, $preview['gst_laar']);
        if ($claimable) {
            $data['is_tax_invoice_received'] = true;
        }

        return $data;
    }

    /**
     * Recompute a stored purchase's header from its lines. Called after
     * lines are written and after the tax-invoice details change, so the
     * claim follows the facts on file.
     */
    public function rollup(Purchase $purchase): Purchase
    {
        $purchase->loadMissing('items');
        $lines = $purchase->items;
        $gst = (int) $lines->sum(fn (PurchaseItem $l) => (int) ($l->gst_laar ?? 0));
        if ($gst <= 0) {
            return $purchase;
        }

        $total = (int) $lines->sum(fn (PurchaseItem $l) => (int) round((float) $l->total_cost * 100));
        $taxable = (int) $lines->filter(fn (PurchaseItem $l) => (int) ($l->gst_laar ?? 0) > 0)
            ->sum(fn (PurchaseItem $l) => (int) round((float) $l->total_cost * 100) - (int) $l->gst_laar);
        $data = $purchase->attributesToArray();
        $claimable = $this->canClaim($data);

        $purchase->forceFill([
            'gst_laar' => $gst,
            'gst_rate_bp' => self::DEFAULT_RATE_BP,
            'total_laar' => $total,
            'amount_excluding_gst_laar' => $taxable,
            'tax_amount' => round($gst / 100, 2),
            'is_input_tax_claimable' => $claimable,
            'is_tax_invoice_received' => $claimable ? true : (bool) $purchase->is_tax_invoice_received,
            'claim_block_reason' => $claimable ? null : $this->blockReason($data, $gst),
        ])->save();

        return $purchase;
    }

    /** @param array<string, mixed> $data */
    private function canClaim(array $data): bool
    {
        return !empty($data['is_input_tax_claimable'])
            && !empty($data['supplier_tin'])
            && !empty($data['supplier_invoice_no'])
            && !empty($data['supplier_invoice_date']);
    }

    /** @param array<string, mixed> $data */
    private function blockReason(array $data, int $gstLaar): string
    {
        $mvr = number_format($gstLaar / 100, 2);
        if (empty($data['is_input_tax_claimable'])) {
            return "MVR {$mvr} of GST not claimed — tick the tax invoice and enter its details to claim it.";
        }

        return "MVR {$mvr} of GST cannot be claimed until the supplier TIN, invoice number and date are on file.";
    }
}
