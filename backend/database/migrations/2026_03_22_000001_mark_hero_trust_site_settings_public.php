<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Expose homepage hero slides + trust strip to GET /api/site-settings/public
     * so the order app can mirror the main Blade marketing layout from CMS.
     */
    public function up(): void
    {
        DB::table('site_settings')
            ->whereIn('key', [
                'trust_items',
                'hero_slide_1',
                'hero_slide_2',
                'hero_slide_3',
            ])
            ->update(['is_public' => true]);

        SiteSetting::bust();
    }

    public function down(): void
    {
        DB::table('site_settings')
            ->whereIn('key', [
                'trust_items',
                'hero_slide_1',
                'hero_slide_2',
                'hero_slide_3',
            ])
            ->update(['is_public' => false]);

        SiteSetting::bust();
    }
};
