<?php

declare(strict_types=1);

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Turn off the site-wide announcement banner (editorial remove).
 * Content Hub → Announcement can re-enable later without redeploy.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        foreach (['website', 'order_app'] as $scope) {
            SiteSetting::set('announcement_enabled', 'false', $scope);
        }

        SiteSetting::bust();
        ContentResolver::bust();
    }

    public function down(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        foreach (['website', 'order_app'] as $scope) {
            SiteSetting::set('announcement_enabled', 'true', $scope);
        }

        SiteSetting::bust();
        ContentResolver::bust();
    }
};
