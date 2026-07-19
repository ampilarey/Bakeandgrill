<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Models\Item;
use App\Models\ItemPackagingOption;

/**
 * Server-side packaging option → fee resolution. Clients may send option IDs only.
 *
 * @phpstan-type ResolvedPackaging array{
 *   packaging_option_id: int|null,
 *   packaging_fee: float,
 *   packaging_fee_mode: string,
 *   packaging_option_name: string|null,
 * }
 */
final class PackagingOptionResolver
{
    public const MODE_PER_UNIT = 'per_unit';

    public const MODE_PER_LINE = 'per_line';

    /**
     * @return ResolvedPackaging
     */
    public function resolve(Item $item, ?int $packagingOptionId): array
    {
        $mode = $this->normalizeMode($item->packaging_fee_mode ?? self::MODE_PER_UNIT);
        $item->loadMissing(['packagingOptions' => fn ($q) => $q->orderBy('sort_order')->orderBy('id')]);

        if ($packagingOptionId !== null) {
            $option = $item->packagingOptions->first(
                fn (ItemPackagingOption $o) => (int) $o->id === $packagingOptionId && $o->is_active,
            );
            if ($option === null) {
                abort(422, 'Invalid or inactive packaging option for this item.');
            }

            return [
                'packaging_option_id' => (int) $option->id,
                'packaging_fee' => max(0.0, min(PackagingFeeCalculator::MAX_FIXED_MVR, (float) $option->fee)),
                'packaging_fee_mode' => $mode,
                'packaging_option_name' => (string) $option->name,
            ];
        }

        $active = $item->packagingOptions->where('is_active', true)->values();
        if ($active->isNotEmpty()) {
            $option = $active->firstWhere('is_default', true) ?? $active->first();

            return [
                'packaging_option_id' => (int) $option->id,
                'packaging_fee' => max(0.0, min(PackagingFeeCalculator::MAX_FIXED_MVR, (float) $option->fee)),
                'packaging_fee_mode' => $mode,
                'packaging_option_name' => (string) $option->name,
            ];
        }

        return [
            'packaging_option_id' => null,
            'packaging_fee' => max(0.0, min(PackagingFeeCalculator::MAX_FIXED_MVR, (float) ($item->packaging_fee ?? 0))),
            'packaging_fee_mode' => $mode,
            'packaging_option_name' => null,
        ];
    }

    public function normalizeMode(mixed $mode): string
    {
        return $mode === self::MODE_PER_LINE ? self::MODE_PER_LINE : self::MODE_PER_UNIT;
    }

    /**
     * @param  list<array<string, mixed>>  $options
     * @return list<array{name: string, name_dv: ?string, fee: float, is_default: bool, is_active: bool, sort_order: int, id?: int}>
     */
    public function normalizeOptionsPayload(array $options): array
    {
        $out = [];
        foreach (array_values($options) as $i => $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = trim((string) ($row['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $out[] = [
                'id' => isset($row['id']) ? (int) $row['id'] : null,
                'name' => mb_substr($name, 0, 80),
                'name_dv' => isset($row['name_dv']) && $row['name_dv'] !== ''
                    ? mb_substr(trim((string) $row['name_dv']), 0, 80)
                    : null,
                'fee' => max(0.0, min(PackagingFeeCalculator::MAX_FIXED_MVR, (float) ($row['fee'] ?? 0))),
                'is_default' => (bool) ($row['is_default'] ?? false),
                'is_active' => array_key_exists('is_active', $row) ? (bool) $row['is_active'] : true,
                'sort_order' => (int) ($row['sort_order'] ?? $i),
            ];
        }

        if ($out === []) {
            return [];
        }

        $active = array_values(array_filter($out, fn ($o) => $o['is_active']));
        $defaultCount = count(array_filter($active, fn ($o) => $o['is_default']));
        if ($defaultCount === 0 && $active !== []) {
            foreach ($out as $i => $row) {
                if ($row['is_active']) {
                    $out[$i]['is_default'] = true;
                    break;
                }
            }
        } elseif ($defaultCount > 1) {
            $seen = false;
            foreach ($out as $i => $row) {
                if (!$row['is_active'] || !$row['is_default']) {
                    continue;
                }
                if ($seen) {
                    $out[$i]['is_default'] = false;
                }
                $seen = true;
            }
        }

        return $out;
    }
}
