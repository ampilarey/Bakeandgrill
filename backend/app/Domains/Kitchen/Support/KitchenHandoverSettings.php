<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Support;

use App\Models\SiteSetting;

final class KitchenHandoverSettings
{
    public static function requirePosReceivingBeforeReady(): bool
    {
        return self::bool('kitchen_require_pos_receiving_before_ready', true);
    }

    public static function receiveUpdatesPreparedStock(): bool
    {
        return self::bool('kitchen_receive_updates_prepared_stock', true);
    }

    public static function managerVerificationForPreparedStock(): bool
    {
        return self::bool('kitchen_manager_verification_for_prepared_stock', false);
    }

    public static function allowStaffPreparedStockBatches(): bool
    {
        return self::bool('kitchen_allow_staff_prepared_stock_batches', true);
    }

    public static function photoRequiredForRejectWaste(): bool
    {
        return self::bool('kitchen_photo_required_for_reject_waste', false);
    }

    public static function productionConsumesRecipeStock(): bool
    {
        return self::bool('kitchen_production_consumes_recipe_stock', false);
    }

    /** @return array<string, bool> */
    public static function all(): array
    {
        return [
            'kitchen_require_pos_receiving_before_ready' => self::requirePosReceivingBeforeReady(),
            'kitchen_receive_updates_prepared_stock' => self::receiveUpdatesPreparedStock(),
            'kitchen_manager_verification_for_prepared_stock' => self::managerVerificationForPreparedStock(),
            'kitchen_allow_staff_prepared_stock_batches' => self::allowStaffPreparedStockBatches(),
            'kitchen_photo_required_for_reject_waste' => self::photoRequiredForRejectWaste(),
            'kitchen_production_consumes_recipe_stock' => self::productionConsumesRecipeStock(),
        ];
    }

    /** @param array<string, mixed> $input */
    public static function update(array $input): array
    {
        foreach (array_keys(self::all()) as $key) {
            if (array_key_exists($key, $input)) {
                SiteSetting::set($key, filter_var($input[$key], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false');
            }
        }
        SiteSetting::bust();

        return self::all();
    }

    private static function bool(string $key, bool $default): bool
    {
        return SiteSetting::get($key, $default ? 'true' : 'false') === 'true';
    }
}
