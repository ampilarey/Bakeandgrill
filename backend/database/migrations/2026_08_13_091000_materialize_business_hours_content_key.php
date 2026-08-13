<?php

declare(strict_types=1);

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Register-time materialization: copy shared business_hours into website and
 * order_app when those app rows are absent, so contact/maintenance pages keep
 * their hours after ContentResolver stops falling back to shared for
 * unregistered keys.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        foreach (['en', 'dv'] as $locale) {
            $shared = SiteSetting::getScoped('business_hours', 'shared', $locale);
            if ($shared === null || $shared === '') {
                if ($locale !== 'en') {
                    continue;
                }
                $shared = SiteSetting::getScoped('business_hours', 'shared', 'en');
            }
            if ($shared === null || $shared === '') {
                continue;
            }

            foreach (['website'] as $app) {
                $existing = SiteSetting::getScoped('business_hours', $app, $locale);
                if ($existing !== null && $existing !== '') {
                    continue;
                }
                SiteSetting::set('business_hours', (string) $shared, $app, $locale);
                $row = SiteSetting::query()
                    ->where('key', 'business_hours')
                    ->where('scope', $app);
                if (SiteSetting::hasLocaleColumn()) {
                    $row->where('locale', $locale);
                }
                $row->update([
                    'type' => 'json',
                    'group' => 'General',
                    'label' => 'Business Hours (display)',
                    'is_public' => true,
                ]);
            }
        }

        SiteSetting::bust();
        ContentResolver::bust();
    }

    public function down(): void
    {
        // Keep app copies — safe no-op.
    }
};
