<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('loyalty_ledger', 'expires_at')) {
            Schema::table('loyalty_ledger', function (Blueprint $table): void {
                $table->timestamp('expires_at')->nullable()->after('occurred_at');
                $table->boolean('expiry_processed')->default(false)->after('expires_at');
            });
        }

        $settings = [
            ['loyalty_enabled', '1', 'boolean', 'Loyalty', 'Program enabled', 'Turn loyalty earn/redeem on or off'],
            ['loyalty_earn_rate', '1', 'text', 'Loyalty', 'Earn rate (points per MVR food)', 'Points earned per MVR 1 of food (excludes delivery fee unless enabled below)'],
            ['loyalty_redeem_rate', '100', 'text', 'Loyalty', 'Redeem rate (points per MVR 1)', 'How many points equal MVR 1 discount'],
            ['loyalty_min_redeem', '100', 'text', 'Loyalty', 'Minimum redeem (points)', 'Minimum points per redemption'],
            ['loyalty_max_redeem', '10000', 'text', 'Loyalty', 'Maximum redeem (points)', 'Maximum points per single order'],
            ['loyalty_max_redeem_percent', '50', 'text', 'Loyalty', 'Max redeem (% of order)', 'Maximum order subtotal payable with points'],
            ['loyalty_hold_ttl', '30', 'text', 'Loyalty', 'Hold TTL (minutes)', 'Minutes to reserve points during checkout'],
            ['loyalty_tiers_enabled', '0', 'boolean', 'Loyalty', 'Tier multipliers enabled', 'Apply earn multipliers by lifetime tier'],
            ['loyalty_points_expiry_days', '0', 'text', 'Loyalty', 'Points expiry (days)', '0 = never expire; earned points expire after this many days'],
            ['loyalty_earn_on_delivery_fee', '0', 'boolean', 'Loyalty', 'Earn on delivery fee', 'Include delivery fee in earn calculation'],
            ['loyalty_program_starts_at', '', 'text', 'Loyalty', 'Program starts', 'Optional ISO datetime; blank = no start limit'],
            ['loyalty_program_ends_at', '', 'text', 'Loyalty', 'Program ends', 'Optional ISO datetime; blank = no end limit'],
            ['loyalty_customer_message', '', 'textarea', 'Loyalty', 'Customer message', 'Optional note shown on account/checkout loyalty sections'],
        ];

        foreach ($settings as [$key, $value, $type, $group, $label, $description]) {
            DB::table('site_settings')->updateOrInsert(
                ['key' => $key],
                [
                    'value' => $value,
                    'type' => $type,
                    'group' => $group,
                    'label' => $label,
                    'description' => $description,
                    'is_public' => false,
                    'updated_at' => now(),
                    'created_at' => now(),
                ],
            );
        }

        if (Schema::hasTable('loyalty_tiers') && DB::table('loyalty_tiers')->count() === 0) {
            $now = now();
            DB::table('loyalty_tiers')->insert([
                ['name' => 'Bronze', 'slug' => 'bronze', 'min_lifetime_points' => 0, 'earn_multiplier' => 1.0, 'sort_order' => 0, 'created_at' => $now, 'updated_at' => $now],
                ['name' => 'Silver', 'slug' => 'silver', 'min_lifetime_points' => 1000, 'earn_multiplier' => 1.5, 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
                ['name' => 'Gold', 'slug' => 'gold', 'min_lifetime_points' => 5000, 'earn_multiplier' => 2.0, 'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
                ['name' => 'Platinum', 'slug' => 'platinum', 'min_lifetime_points' => 15000, 'earn_multiplier' => 3.0, 'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('loyalty_ledger', 'expires_at')) {
            Schema::table('loyalty_ledger', function (Blueprint $table): void {
                $table->dropColumn(['expires_at', 'expiry_processed']);
            });
        }

        DB::table('site_settings')->where('group', 'Loyalty')->delete();
    }
};
