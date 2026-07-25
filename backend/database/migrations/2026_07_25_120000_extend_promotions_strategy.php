<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Discount strategy levers: budget cap, first-order, free-delivery flags,
 * plus margin-floor SiteSettings. New promo types use metadata JSON.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('promotions')) {
            Schema::table('promotions', function (Blueprint $table): void {
                if (!Schema::hasColumn('promotions', 'budget_laar')) {
                    $table->unsignedBigInteger('budget_laar')->nullable()->after('redemptions_count');
                }
                if (!Schema::hasColumn('promotions', 'spent_laar')) {
                    $table->unsignedBigInteger('spent_laar')->default(0)->after('budget_laar');
                }
                if (!Schema::hasColumn('promotions', 'first_order_only')) {
                    $table->boolean('first_order_only')->default(false)->after('auto_apply');
                }
                if (!Schema::hasColumn('promotions', 'waive_delivery')) {
                    $table->boolean('waive_delivery')->default(false)->after('first_order_only');
                }
            });
        }

        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $now = now();
        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        $settings = [
            [
                'key' => 'discount_margin_floor_enabled',
                'value' => '0',
                'type' => 'boolean',
                'group' => 'Promotions',
                'label' => 'Enforce discount margin floor',
                'description' => 'When on, item/category discounts cannot push unit price below cost × (1 + floor %). Off by default.',
                'is_public' => false,
            ],
            [
                'key' => 'discount_margin_floor_pct',
                'value' => '0',
                'type' => 'text',
                'group' => 'Promotions',
                'label' => 'Discount margin floor %',
                'description' => 'Minimum margin above cost after discounts (0 = never below cost).',
                'is_public' => false,
            ],
        ];

        foreach ($settings as $setting) {
            $query = DB::table('site_settings')->where('key', $setting['key']);
            if ($hasScope) {
                $query->where('scope', 'shared');
            }
            if ($hasLocale) {
                $query->where('locale', 'en');
            }
            if ($query->exists()) {
                continue;
            }

            $row = array_merge($setting, [
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            if ($hasScope) {
                $row['scope'] = 'shared';
            }
            if ($hasLocale) {
                $row['locale'] = 'en';
            }
            DB::table('site_settings')->insert($row);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('promotions')) {
            Schema::table('promotions', function (Blueprint $table): void {
                foreach (['budget_laar', 'spent_laar', 'first_order_only', 'waive_delivery'] as $col) {
                    if (Schema::hasColumn('promotions', $col)) {
                        $table->dropColumn($col);
                    }
                }
            });
        }

        if (Schema::hasTable('site_settings')) {
            DB::table('site_settings')->whereIn('key', [
                'discount_margin_floor_enabled',
                'discount_margin_floor_pct',
            ])->delete();
        }
    }
};
