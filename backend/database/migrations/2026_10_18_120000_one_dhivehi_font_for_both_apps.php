<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Dhivehi font is one setting for both apps (ContentWriter::ONE_SWITCH, 2026-10-18).
 * The order app already reads the website's pick; this copies it into the order app's
 * row too, so the order app's hub shows the font that is really in use.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings') || !Schema::hasColumn('site_settings', 'scope')) {
            return;
        }

        $locale = Schema::hasColumn('site_settings', 'locale');
        $website = DB::table('site_settings')
            ->where('key', 'dhivehi_font')
            ->where('scope', 'website')
            ->when($locale, fn ($q) => $q->where('locale', 'en'))
            ->value('value');
        if ($website === null) {
            return;
        }

        SiteSetting::set('dhivehi_font', (string) $website, 'order_app', 'en');
        SiteSetting::bust();
    }

    public function down(): void
    {
        // Nothing to undo: both rows hold the same pick.
    }
};
