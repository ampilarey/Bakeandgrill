<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Models\Item;
use App\Models\Order;
use App\Models\SiteSetting;

class PackagingFeeCalculator
{
    public const MAX_PERCENT = 100.0;

    public const MAX_FIXED_MVR = 500.0;

    public function __construct(
        private readonly PackagingOptionResolver $optionResolver = new PackagingOptionResolver,
        private readonly OrderFeeTaxCalculator $feeTax = new OrderFeeTaxCalculator,
    ) {}

    /**
     * Packaging principal in laari for non-dine-in orders.
     * `$discountedSubtotalLaar` is unused (kept for call-site compatibility).
     */
    public function calculatePackaging(Order $order, int $discountedSubtotalLaar = 0): int
    {
        unset($discountedSubtotalLaar);

        return $this->sumPackagingForOrderType(
            (string) ($order->type ?? ''),
            $this->linesFromOrder($order),
        );
    }

    public function calculateSmallOrder(Order $order, int $discountedSubtotalLaar): int
    {
        return $this->previewSmallOrderForOrderType((string) ($order->type ?? ''), $discountedSubtotalLaar);
    }

    /**
     * @param list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null, packaging_fee_mode?: string|null, packaging_option_id?: int|null}> $lines
     */
    public function previewPackagingForOrderType(string $orderType, array $lines = []): int
    {
        return $this->sumPackagingForOrderType($orderType, $lines);
    }

    public function previewSmallOrderForOrderType(string $orderType, int $discountedSubtotalLaar): int
    {
        if ($discountedSubtotalLaar <= 0) {
            return 0;
        }

        if (!$this->boolSetting('small_order_fee_enabled', false)) {
            return 0;
        }

        if (!in_array($orderType, ['online_pickup', 'delivery'], true)) {
            return 0;
        }

        $thresholdMvr = (float) $this->stringSetting('small_order_fee_threshold_mvr', '0');
        $thresholdLaar = (int) round(max(0, $thresholdMvr) * 100);

        if ($discountedSubtotalLaar >= $thresholdLaar) {
            return 0;
        }

        $feeMvr = (float) $this->stringSetting('small_order_fee_amount_mvr', '0');
        $feeMvr = min(max(0, $feeMvr), self::MAX_FIXED_MVR);

        return max(0, (int) round($feeMvr * 100));
    }

    /**
     * @param list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null, packaging_fee_mode?: string|null, packaging_option_id?: int|null}> $lines
     * @return array{
     *   packaging_fee_laar: int,
     *   packaging_fee_label: string,
     *   small_order_fee_laar: int,
     *   small_order_fee_label: string,
     *   packaging_fee_taxable: bool,
     *   small_order_fee_taxable: bool,
     *   delivery_fee_taxable: bool,
     * }
     */
    public function previewCheckoutFees(string $orderType, int $discountedSubtotalLaar, array $lines = []): array
    {
        return [
            'packaging_fee_laar' => $this->previewPackagingForOrderType($orderType, $lines),
            'packaging_fee_label' => $this->stringSetting('packaging_fee_label', 'Packaging fee'),
            'small_order_fee_laar' => $this->previewSmallOrderForOrderType($orderType, $discountedSubtotalLaar),
            'small_order_fee_label' => 'Small order fee',
            'packaging_fee_taxable' => $this->packagingFeeTaxable(),
            'small_order_fee_taxable' => $this->smallOrderFeeTaxable(),
            // Carried here too so checkout can price the whole basket of fees
            // from one call — the delivery fee itself comes from its own
            // endpoint, but its taxability belongs with the other fees.
            'delivery_fee_taxable' => $this->feeTax->deliveryTaxable(),
        ];
    }

    public function orderTypeEligible(string $orderType): bool
    {
        // Event/catering orders carry packaging on quote lines so charged totals
        // match the customer-approved quote (CATERING-EVENTS-PLAN packaging fidelity).
        return in_array($orderType, ['takeaway', 'online_pickup', 'delivery', 'catering'], true);
    }

    /**
     * Fee taxability lives in OrderFeeTaxCalculator so totals, the GST ledger
     * and the checkout preview cannot answer it differently.
     */
    public function packagingFeeTaxable(): bool
    {
        return $this->feeTax->packagingTaxable();
    }

    public function smallOrderFeeTaxable(): bool
    {
        return $this->feeTax->smallOrderTaxable();
    }

    /**
     * @return array<string, mixed>
     */
    public function currentSettings(): array
    {
        return [
            'packaging_label' => $this->stringSetting('packaging_fee_label', 'Packaging fee'),
            'packaging_fee_taxable' => $this->packagingFeeTaxable(),
            'small_order_fee_taxable' => $this->smallOrderFeeTaxable(),
            'small_order_enabled' => $this->boolSetting('small_order_fee_enabled', false),
            'small_order_threshold_mvr' => (float) $this->stringSetting('small_order_fee_threshold_mvr', '50'),
            'small_order_amount_mvr' => (float) $this->stringSetting('small_order_fee_amount_mvr', '10'),
            'ordering_max_per_15min' => (int) $this->stringSetting('ordering_max_per_15min', '0'),
            'ramadan_hours_preset' => $this->jsonSetting('ramadan_hours_preset'),
        ];
    }

    public function orderingMaxPer15Min(): int
    {
        return max(0, (int) $this->stringSetting('ordering_max_per_15min', '0'));
    }

    /**
     * @param list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null, packaging_fee_mode?: string|null, packaging_option_id?: int|null}> $lines
     */
    public function sumPackagingForOrderType(string $orderType, array $lines): int
    {
        if (!$this->orderTypeEligible($orderType) || $lines === []) {
            return 0;
        }

        $resolved = $this->resolveLineFees($lines);
        $totalLaar = 0;

        foreach ($resolved as $line) {
            $qty = max(0, (int) round((float) ($line['quantity'] ?? 0)));
            if ($qty <= 0) {
                continue;
            }

            $feeMvr = (float) ($line['packaging_fee'] ?? 0);
            if ($feeMvr <= 0) {
                continue;
            }

            $feeLaar = (int) round(min(self::MAX_FIXED_MVR, max(0, $feeMvr)) * 100);
            $mode = $this->optionResolver->normalizeMode($line['packaging_fee_mode'] ?? PackagingOptionResolver::MODE_PER_UNIT);
            $units = $mode === PackagingOptionResolver::MODE_PER_LINE ? 1 : $qty;
            $totalLaar += $feeLaar * $units;
        }

        return max(0, $totalLaar);
    }

    /**
     * @return list<array{item_id: int, quantity: float, packaging_fee: float, packaging_fee_mode: string, packaging_option_id: int|null}>
     */
    private function linesFromOrder(Order $order): array
    {
        $order->loadMissing('items');

        $lines = [];
        foreach ($order->items as $orderItem) {
            $itemId = (int) ($orderItem->item_id ?? 0);
            if ($itemId <= 0) {
                continue;
            }
            $row = [
                'item_id' => $itemId,
                'quantity' => (float) ($orderItem->quantity ?? 0),
                'packaging_option_id' => $orderItem->packaging_option_id !== null
                    ? (int) $orderItem->packaging_option_id
                    : null,
            ];
            // Legacy rows (pre-options) have null option + zero fee column default —
            // omit snapshot so we re-resolve from the catalog item.
            $snapFee = (float) ($orderItem->packaging_fee ?? 0);
            $hasSnapshot = $orderItem->packaging_option_id !== null
                || $snapFee > 0
                || filled($orderItem->packaging_option_name);
            if ($hasSnapshot) {
                $row['packaging_fee'] = $snapFee;
                $row['packaging_fee_mode'] = (string) ($orderItem->packaging_fee_mode ?? PackagingOptionResolver::MODE_PER_UNIT);
            }
            $lines[] = $row;
        }

        return $lines;
    }

    /**
     * Prefer snapshotted fee/mode on each line; otherwise resolve from catalog.
     *
     * @param list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null, packaging_fee_mode?: string|null, packaging_option_id?: int|null}> $lines
     * @return list<array{item_id: int, quantity: float, packaging_fee: float, packaging_fee_mode: string, packaging_option_id: int|null}>
     */
    private function resolveLineFees(array $lines): array
    {
        $needResolve = [];
        foreach ($lines as $i => $line) {
            $hasSnapshot = array_key_exists('packaging_fee', $line)
                && $line['packaging_fee'] !== null
                && $line['packaging_fee'] !== '';
            if (!$hasSnapshot) {
                $needResolve[$i] = true;
            }
        }

        $itemsById = [];
        if ($needResolve !== []) {
            $ids = [];
            foreach (array_keys($needResolve) as $i) {
                $id = (int) ($lines[$i]['item_id'] ?? 0);
                if ($id > 0) {
                    $ids[] = $id;
                }
            }
            if ($ids !== []) {
                $itemsById = Item::query()
                    ->with(['packagingOptions' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')])
                    ->whereIn('id', array_values(array_unique($ids)))
                    ->get()
                    ->keyBy('id');
            }
        }

        $out = [];
        foreach ($lines as $i => $line) {
            $itemId = (int) ($line['item_id'] ?? 0);
            if ($itemId <= 0) {
                continue;
            }

            $qty = (float) ($line['quantity'] ?? 0);
            $optionId = isset($line['packaging_option_id']) && $line['packaging_option_id'] !== null && $line['packaging_option_id'] !== ''
                ? (int) $line['packaging_option_id']
                : null;

            if (isset($needResolve[$i])) {
                $item = $itemsById[$itemId] ?? null;
                if ($item === null) {
                    continue;
                }
                $resolved = $this->optionResolver->resolve($item, $optionId);
                $out[] = [
                    'item_id' => $itemId,
                    'quantity' => $qty,
                    'packaging_fee' => $resolved['packaging_fee'],
                    'packaging_fee_mode' => $resolved['packaging_fee_mode'],
                    'packaging_option_id' => $resolved['packaging_option_id'],
                ];

                continue;
            }

            $out[] = [
                'item_id' => $itemId,
                'quantity' => $qty,
                'packaging_fee' => max(0.0, (float) $line['packaging_fee']),
                'packaging_fee_mode' => $this->optionResolver->normalizeMode(
                    $line['packaging_fee_mode'] ?? PackagingOptionResolver::MODE_PER_UNIT,
                ),
                'packaging_option_id' => $optionId,
            ];
        }

        return $out;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function jsonSetting(string $key): ?array
    {
        $raw = SiteSetting::get($key, null);
        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_array($raw)) {
            return $raw;
        }

        $decoded = json_decode((string) $raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function boolSetting(string $key, bool $default): bool
    {
        $v = SiteSetting::get($key, $default ? '1' : '0');

        return filter_var($v, FILTER_VALIDATE_BOOLEAN);
    }

    private function stringSetting(string $key, string $default): string
    {
        $v = SiteSetting::get($key, $default);

        return is_string($v) ? $v : (string) $v;
    }
}
