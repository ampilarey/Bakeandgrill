<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds the core business contact fields into site_settings so the admin
 * panel is the authoritative source rather than config/business.php.
 *
 * Uses updateOrInsert so the row is created if missing.
 * Only overwrites the *value* when the current DB value is an empty string,
 * so any admin-edited value is preserved.
 */
return new class extends Migration
{
    public function up(): void
    {
        $defaults = [
            [
                'key' => 'business_phone',
                'value' => config('business.phone', '+960 912 0011'),
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Business Phone Number',
                'description' => 'Displayed on the Contact page, Hours page footer, and Refund policy. Include country code (e.g. +960 912 0011).',
                'is_public' => true,
            ],
            [
                'key' => 'business_email',
                'value' => config('business.email', 'hello@bakeandgrill.mv'),
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Business Email Address',
                'description' => 'Displayed on the Contact page and Refund policy.',
                'is_public' => true,
            ],
            [
                'key' => 'business_address',
                'value' => config('business.address.full', 'Kalaafaanu Hingun, Malé, Maldives'),
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Business Address (full)',
                'description' => 'Full address shown on the Contact page, Refund policy, and Terms corporate box.',
                'is_public' => true,
            ],
        ];

        foreach ($defaults as $row) {
            // Create the row if it does not exist yet.
            DB::table('site_settings')->insertOrIgnore([
                'key' => $row['key'],
                'value' => $row['value'],
                'type' => $row['type'],
                'group' => $row['group'],
                'label' => $row['label'],
                'description' => $row['description'],
                'is_public' => $row['is_public'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // If the row existed but had an empty value, fill it in.
            DB::table('site_settings')
                ->where('key', $row['key'])
                ->where(function ($q) {
                    $q->whereNull('value')->orWhere('value', '');
                })
                ->update([
                    'value' => $row['value'],
                    'updated_at' => now(),
                ]);
        }

        // Bust the cache for these three keys so the next page load is fresh.
        Illuminate\Support\Facades\Cache::forget('site_setting.business_phone');
        Illuminate\Support\Facades\Cache::forget('site_setting.business_email');
        Illuminate\Support\Facades\Cache::forget('site_setting.business_address');
    }

    public function down(): void
    {
        // This migration only seeds data — rolling back just clears the values
        // so they fall through to config() fallbacks again.
        DB::table('site_settings')
            ->whereIn('key', ['business_phone', 'business_email', 'business_address'])
            ->update(['value' => '', 'updated_at' => now()]);
    }
};
