<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Public-counter display settings move from standalone SiteSetting toggles
 * (Settings → Public Stats) into the Customer Surface Builder: a
 * "public_stats" home block per surface, whose settings carry the
 * per-counter checkboxes. Surfaces that had the counters enabled get a
 * block appended to their home layout so nothing the owner turned on
 * disappears; the old keys are removed either way.
 */
return new class extends Migration
{
    private const COUNTER_KEYS = ['orders', 'wholesale', 'catering', 'customers', 'visitors'];

    private const SURFACE_APPS = ['web' => 'website', 'order' => 'order_app'];

    public function up(): void
    {
        $flag = function (string $key): bool {
            $value = DB::table('site_settings')->where('key', $key)->value('value');

            return filter_var($value ?? '0', FILTER_VALIDATE_BOOLEAN);
        };

        foreach (self::SURFACE_APPS as $surface => $app) {
            if (!$flag("public_stats_{$surface}_enabled")) {
                continue;
            }

            $exists = DB::table('page_blocks')
                ->where('app', $app)
                ->where('page', 'home')
                ->where('block_type', 'public_stats')
                ->exists();
            if ($exists) {
                continue;
            }

            $settings = [
                'show_desktop' => true,
                'show_mobile' => true,
                'placement_desktop' => 'home',
                'placement_mobile' => 'home',
            ];
            foreach (self::COUNTER_KEYS as $key) {
                $settings["show_{$key}"] = $flag("public_stats_{$surface}_show_{$key}");
            }

            $maxPosition = (int) DB::table('page_blocks')
                ->where('app', $app)
                ->where('page', 'home')
                ->max('position');

            DB::table('page_blocks')->insert([
                'app' => $app,
                'page' => 'home',
                'block_type' => 'public_stats',
                'position' => $maxPosition + 1,
                'is_enabled' => true,
                'content_mode' => 'own',
                'settings' => json_encode($settings),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('site_settings')->where('key', 'like', 'public\_stats\_%')->delete();
    }

    public function down(): void
    {
        // The old SiteSetting toggles are gone for good; the block rows are
        // the live configuration and rolling back must not delete them.
    }
};
