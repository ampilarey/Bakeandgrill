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
            'value' => '',
            'type' => 'image',
            'group' => 'Branding',
            'label' => 'Default item photo',
            'description' => 'Shown for menu items that don\'t have their own photo.',
            'is_public' => true,
            'updated_at' => now(),
            'created_at' => now(),
        ];

        $attrs = ['key' => 'default_item_image'];
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

        $query = DB::table('site_settings')->where('key', 'default_item_image');
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();
    }
};
