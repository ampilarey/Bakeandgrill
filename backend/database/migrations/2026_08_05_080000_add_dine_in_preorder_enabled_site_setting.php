<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Master switch for prepaid dine-in ("Eat here" at online checkout).
 * Default OFF so the feature ships dark until the owner enables it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $row = [
            'value' => '0',
            'type' => 'boolean',
            'group' => 'Online Ordering',
            'label' => 'Dine-in pre-order',
            'description' => 'Let customers order and pay online for dine-in, with a reserved table and arrival time.',
            'is_public' => true,
            'updated_at' => now(),
            'created_at' => now(),
        ];

        $attrs = ['key' => 'dine_in_preorder_enabled'];
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

        $query = DB::table('site_settings')->where('key', 'dine_in_preorder_enabled');
        if (Schema::hasColumn('site_settings', 'scope')) {
            $query->where('scope', 'shared');
        }
        if (Schema::hasColumn('site_settings', 'locale')) {
            $query->where('locale', 'en');
        }
        $query->delete();
    }
};
