<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seed structured address fields for Business Details (shared scope).
 * Backfills from config('business.address.*') when shared rows are empty.
 * Never deletes or overwrites non-empty shared values.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $now = now();
        $seeds = [
            'business_address_line1' => [
                'value' => (string) config('business.address.line1', 'Kalaafaanu Hingun'),
                'type' => 'text',
                'group' => 'General',
                'label' => 'Address line 1',
                'description' => 'Street / road line for the shared business record.',
            ],
            'business_address_city' => [
                'value' => (string) config('business.address.city', 'Malé'),
                'type' => 'text',
                'group' => 'General',
                'label' => 'City / island',
                'description' => null,
            ],
            'business_address_country' => [
                'value' => (string) config('business.address.country', 'Maldives'),
                'type' => 'text',
                'group' => 'General',
                'label' => 'Country',
                'description' => null,
            ],
            'business_landmark' => [
                'value' => 'Near H. Sahara',
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Landmark / Direction Hint',
                'description' => null,
            ],
            'business_maps_url' => [
                'value' => 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives',
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Google Maps URL',
                'description' => null,
            ],
            'business_viber' => [
                'value' => (string) config('business.social.viber', 'viber://chat?number=9609120011'),
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Viber Link',
                'description' => null,
            ],
        ];

        foreach ($seeds as $key => $meta) {
            $existing = SiteSetting::getScoped($key, 'shared', 'en');
            if ($existing !== null && $existing !== '') {
                continue;
            }

            $payload = [
                'key' => $key,
                'value' => $meta['value'],
                'type' => $meta['type'],
                'group' => $meta['group'],
                'label' => $meta['label'],
                'description' => $meta['description'],
                'is_public' => true,
                'updated_at' => $now,
            ];

            $query = DB::table('site_settings')->where('key', $key);
            if (Schema::hasColumn('site_settings', 'scope')) {
                $query->where('scope', 'shared');
                $payload['scope'] = 'shared';
            }
            if (Schema::hasColumn('site_settings', 'locale')) {
                $query->where('locale', 'en');
                $payload['locale'] = 'en';
            }

            $row = $query->first();
            if ($row) {
                if (($row->value ?? '') === '' || $row->value === null) {
                    DB::table('site_settings')->where('id', $row->id)->update([
                        'value' => $meta['value'],
                        'updated_at' => $now,
                    ]);
                }
                continue;
            }

            $payload['created_at'] = $now;
            DB::table('site_settings')->insert($payload);
        }
    }

    public function down(): void
    {
        // Non-destructive: leave seeded rows in place.
    }
};
