<?php

declare(strict_types=1);

use App\Domains\Content\Blocks\BlockDeviceSettings;
use App\Domains\Content\ContentResolver;
use App\Models\PageBlock;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Enable a red (alert) site-wide announcement banner on Website + Order App.
 * Copy is editable later in Content Hub → Announcement.
 */
return new class extends Migration
{
    private const TEXT = 'Welcome — online ordering is live. Delivery, pickup, and dine-in.';

    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }

        $values = [
            'announcement_enabled' => 'true',
            'announcement_style' => 'alert',
            'announcement_text' => self::TEXT,
            'announcement_url' => '/order/',
        ];
        $meta = [
            'announcement_enabled' => ['type' => 'boolean', 'group' => 'Everywhere', 'label' => 'Show Announcement Banner'],
            'announcement_style' => ['type' => 'text', 'group' => 'Everywhere', 'label' => 'Announcement — Style'],
            'announcement_text' => ['type' => 'textarea', 'group' => 'Everywhere', 'label' => 'Announcement — Text'],
            'announcement_url' => ['type' => 'text', 'group' => 'Everywhere', 'label' => 'Announcement — Link URL (optional)'],
        ];

        foreach (['website', 'order_app'] as $scope) {
            foreach ($values as $key => $value) {
                SiteSetting::set($key, $value, $scope);
                if (SiteSetting::hasScopeColumn()) {
                    SiteSetting::query()
                        ->where('key', $key)
                        ->where('scope', $scope)
                        ->when(SiteSetting::hasLocaleColumn(), fn ($q) => $q->where('locale', 'en'))
                        ->update(array_merge($meta[$key], ['is_public' => true]));
                } else {
                    SiteSetting::query()
                        ->where('key', $key)
                        ->update(array_merge($meta[$key], ['is_public' => true]));
                }
            }
        }

        if (Schema::hasTable('page_blocks')) {
            $defaults = BlockDeviceSettings::announcementDefaults();
            foreach ([PageBlock::APP_WEBSITE, PageBlock::APP_ORDER] as $app) {
                $existing = PageBlock::query()
                    ->where('app', $app)
                    ->where('page', PageBlock::PAGE_HOME)
                    ->where('block_type', 'announcement')
                    ->first();

                if ($existing) {
                    $existing->is_enabled = true;
                    $settings = is_array($existing->settings) ? $existing->settings : [];
                    $existing->settings = array_merge($defaults, $settings, [
                        'show_desktop' => true,
                        'show_mobile' => true,
                        'placement_desktop' => 'header',
                        'placement_mobile' => 'header',
                    ]);
                    $existing->save();
                } else {
                    $maxPos = (int) PageBlock::query()
                        ->where('app', $app)
                        ->where('page', PageBlock::PAGE_HOME)
                        ->max('position');

                    PageBlock::query()->create([
                        'app' => $app,
                        'page' => PageBlock::PAGE_HOME,
                        'block_type' => 'announcement',
                        'position' => max(0, $maxPos + 1),
                        'is_enabled' => true,
                        'content_mode' => PageBlock::MODE_OWN,
                        'settings' => $defaults,
                    ]);
                }
            }
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
            if (SiteSetting::hasScopeColumn()) {
                DB::table('site_settings')
                    ->whereIn('key', ['announcement_enabled', 'announcement_style', 'announcement_text', 'announcement_url'])
                    ->where('scope', $scope)
                    ->where('locale', 'en')
                    ->delete();
            }
        }

        SiteSetting::bust();
        ContentResolver::bust();
    }
};
