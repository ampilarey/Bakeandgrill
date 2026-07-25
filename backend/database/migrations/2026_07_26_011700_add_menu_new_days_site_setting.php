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

        $row = [
            'value' => '30',
            'type' => 'text',
            'group' => 'Branding',
            'label' => 'New items window (days)',
            'description' => 'Items created within this many days appear under “New items” on the dine-in menu.',
            'is_public' => true,
            'updated_at' => now(),
            'created_at' => now(),
        ];

        $attrs = ['key' => 'menu_new_days'];
        if (Schema::hasColumn('site_settings', 'scope')) {
            $attrs['scope'] = 'shared';
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $attrs['locale'] = 'en';
        }

        DB::table('site_settings')->updateOrInsert($attrs, array_merge($attrs, $row));
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $query = DB::table('site_settings')->where('key', 'menu_new_days');
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();
    }
};
