<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $now = now();
        $hasScope = Schema::hasColumn('site_settings', 'scope');
        $hasLocale = Schema::hasColumn('site_settings', 'locale');

        $row = [
            'key' => 'discount_stacking_policy',
            'value' => 'best_wins',
            'type' => 'text',
            'group' => 'Promotions',
            'label' => 'Discount stacking policy',
            'description' => 'best_wins (default) or stack — how specials and auto-promos combine.',
            'is_public' => false,
            'updated_at' => $now,
        ];
        if ($hasScope) {
            $row['scope'] = 'shared';
        }
        if ($hasLocale) {
            $row['locale'] = 'en';
        }

        $query = DB::table('site_settings')->where('key', 'discount_stacking_policy');
        if ($hasScope) {
            $query->where('scope', 'shared');
        }
        if ($hasLocale) {
            $query->where('locale', 'en');
        }

        if ($query->exists()) {
            return;
        }

        $row['created_at'] = $now;
        DB::table('site_settings')->insert($row);
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }
        DB::table('site_settings')->where('key', 'discount_stacking_policy')->delete();
    }
};
