<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Support;

use App\Models\SiteSetting;

final class KitchenHandoverSettings
{
    public static function requirePosReceivingBeforeReady(): bool
    {
        // Default off — small cafés mark Ready from POS without a kitchen receive step.
        // Larger kitchens can re-enable this in Admin → Kitchen Production settings.
        return self::bool('kitchen_require_pos_receiving_before_ready', false);
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

    /**
     * Kitchen audit, 2026-09-26: a pickup booked for later today reaches the
     * kitchen screen this many minutes before its slot, and its clock starts
     * then. 5 to 240, default 30.
     */
    public static function scheduledPickupLeadMinutes(): int
    {
        $value = (int) SiteSetting::get('kitchen_scheduled_pickup_lead_minutes', '30');

        return max(5, min(240, $value > 0 ? $value : 30));
    }

    /**
     * There is no "production consumes recipe stock" switch any more. It was
     * shown, saved and read by nothing: whether a batch takes ingredients is
     * decided per recipe ("these ingredients leave stock when the kitchen
     * records making it"), which is the control that actually works.
     *
     * @return array<string, bool|int>
     */
    public static function all(): array
    {
        return [
            'kitchen_require_pos_receiving_before_ready' => self::requirePosReceivingBeforeReady(),
            'kitchen_receive_updates_prepared_stock' => self::receiveUpdatesPreparedStock(),
            'kitchen_manager_verification_for_prepared_stock' => self::managerVerificationForPreparedStock(),
            'kitchen_allow_staff_prepared_stock_batches' => self::allowStaffPreparedStockBatches(),
            'kitchen_photo_required_for_reject_waste' => self::photoRequiredForRejectWaste(),
            'kitchen_scheduled_pickup_lead_minutes' => self::scheduledPickupLeadMinutes(),
        ];
    }

    /** @param array<string, mixed> $input */
    public static function update(array $input): array
    {
        foreach (array_keys(self::all()) as $key) {
            if (!array_key_exists($key, $input)) {
                continue;
            }
            if ($key === 'kitchen_scheduled_pickup_lead_minutes') {
                SiteSetting::set($key, (string) max(5, min(240, (int) $input[$key])));

                continue;
            }
            SiteSetting::set($key, filter_var($input[$key], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false');
        }
        SiteSetting::bust();

        return self::all();
    }

    private static function bool(string $key, bool $default): bool
    {
        return SiteSetting::get($key, $default ? 'true' : 'false') === 'true';
    }
}
