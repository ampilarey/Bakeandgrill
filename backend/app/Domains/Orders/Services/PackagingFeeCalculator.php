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

    /**
     * Per-item packaging fee × quantity for non-dine-in orders.
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
     * @param  list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null}>  $lines
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
     * @param  list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null}>  $lines
     * @return array{
     *   packaging_fee_laar: int,
     *   packaging_fee_label: string,
     *   small_order_fee_laar: int,
     *   small_order_fee_label: string,
     * }
     */
    public function previewCheckoutFees(string $orderType, int $discountedSubtotalLaar, array $lines = []): array
    {
        return [
            'packaging_fee_laar' => $this->previewPackagingForOrderType($orderType, $lines),
            'packaging_fee_label' => $this->stringSetting('packaging_fee_label', 'Packaging fee'),
            'small_order_fee_laar' => $this->previewSmallOrderForOrderType($orderType, $discountedSubtotalLaar),
            'small_order_fee_label' => 'Small order fee',
        ];
    }

    public function orderTypeEligible(string $orderType): bool
    {
        return in_array($orderType, ['takeaway', 'online_pickup', 'delivery'], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function currentSettings(): array
    {
        return [
            'packaging_label' => $this->stringSetting('packaging_fee_label', 'Packaging fee'),
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
     * @param  list<array{item_id?: int, quantity?: float|int|string, packaging_fee?: float|int|string|null}>  $lines
     */
    public function sumPackagingForOrderType(string $orderType, array $lines): int
    {
        if (!$this->orderTypeEligible($orderType) || $lines === []) {
            return 0;
        }

        $feesByItemId = $this->resolvePackagingFeesMvr($lines);
        $totalLaar = 0;

        foreach ($lines as $line) {
            $itemId = (int) ($line['item_id'] ?? 0);
            if ($itemId <= 0) {
                continue;
            }

            $qty = max(0, (int) round((float) ($line['quantity'] ?? 0)));
            if ($qty <= 0) {
                continue;
            }

            $feeMvr = $feesByItemId[$itemId] ?? 0.0;
            if ($feeMvr <= 0) {
                continue;
            }

            $feeLaar = (int) round($feeMvr * 100);
            $totalLaar += $feeLaar * $qty;
        }

        return max(0, $totalLaar);
    }

    /**
     * @return list<array{item_id: int, quantity: float}>
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
            $lines[] = [
                'item_id' => $itemId,
                'quantity' => (float) ($orderItem->quantity ?? 0),
            ];
        }

        return $lines;
    }

    /**
     * @param  list<array{item_id?: int, packaging_fee?: float|int|string|null}>  $lines
     * @return array<int, float> item_id => packaging_fee MVR
     */
    private function resolvePackagingFeesMvr(array $lines): array
    {
        $fees = [];
        $missingIds = [];

        foreach ($lines as $line) {
            $itemId = (int) ($line['item_id'] ?? 0);
            if ($itemId <= 0 || array_key_exists($itemId, $fees)) {
                continue;
            }

            if (array_key_exists('packaging_fee', $line) && $line['packaging_fee'] !== null && $line['packaging_fee'] !== '') {
                $fees[$itemId] = max(0.0, (float) $line['packaging_fee']);

                continue;
            }

            $missingIds[] = $itemId;
        }

        if ($missingIds !== []) {
            $fromDb = Item::query()
                ->whereIn('id', array_values(array_unique($missingIds)))
                ->pluck('packaging_fee', 'id');

            foreach ($missingIds as $id) {
                $fees[$id] = max(0.0, (float) ($fromDb[$id] ?? 0));
            }
        }

        return $fees;
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
