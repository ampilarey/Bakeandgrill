<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Public website URL for TV brand cards and contact surfaces.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_settings')->insertOrIgnore([
            'key' => 'business_website',
            'value' => 'https://bakeandgrill.mv',
            'type' => 'text',
            'group' => 'Contact',
            'label' => 'Business Website',
            'description' => 'Public website URL shown on the TV brand card and contact surfaces. Include https://.',
            'is_public' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('site_settings')
            ->where('key', 'business_website')
            ->where(function ($q) {
                $q->whereNull('value')->orWhere('value', '');
            })
            ->update([
                'value' => 'https://bakeandgrill.mv',
                'updated_at' => now(),
            ]);

        Cache::forget('site_setting.business_website');
    }

    public function down(): void
    {
        DB::table('site_settings')->where('key', 'business_website')->delete();
        Cache::forget('site_setting.business_website');
    }
};
