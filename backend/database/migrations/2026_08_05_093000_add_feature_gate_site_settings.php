<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Kill switches for online ordering features. Defaults preserve current
 * behaviour: tomorrow / reservations / gift cards stay ON (they were live),
 * dine-in pre-order already has its own row (default off).
 */
return new class extends Migration
{
    private const ROWS = [
        'order_for_tomorrow_enabled' => ['1', 'Order for tomorrow', 'Master switch for collect-tomorrow ordering.'],
        'reservations_enabled' => ['1', 'Table reservations', 'Master switch for accepting new online table bookings.'],
        'gift_card_purchase_enabled' => ['1', 'Gift card purchase', 'Master switch for online gift card sales.'],
    ];

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        foreach (self::ROWS as $key => [$value, $label, $description]) {
            $row = [
                'value' => $value,
                'type' => 'boolean',
                'group' => 'Online Ordering',
                'label' => $label,
                'description' => $description,
                'is_public' => true,
                'updated_at' => now(),
                'created_at' => now(),
            ];

            $attrs = ['key' => $key];
            if (Schema::hasColumn('site_settings', 'scope')) {
                $attrs['scope'] = 'shared';
            }
            if (Schema::hasColumn('site_settings', 'locale')) {
                $attrs['locale'] = 'en';
            }

            DB::table('site_settings')->updateOrInsert($attrs, array_merge($attrs, $row));
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        foreach (array_keys(self::ROWS) as $key) {
            $query = DB::table('site_settings')->where('key', $key);
            if (Schema::hasColumn('site_settings', 'scope')) {
                $query->where('scope', 'shared');
            }
            if (Schema::hasColumn('site_settings', 'locale')) {
                $query->where('locale', 'en');
            }
            $query->delete();
        }
    }
};
