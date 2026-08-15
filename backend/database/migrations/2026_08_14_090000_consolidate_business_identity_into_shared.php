<?php

declare(strict_types=1);

use App\Domains\Settings\OpsOwnedContent;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Owner decision 2026-08-14 — one business, one identity.
 *
 * Thirteen keys (brand images, tagline, social accounts, tracking IDs) moved
 * from per-app ownership to the shared Business Details record. After this,
 * ContentResolver reads them from `shared` for BOTH apps.
 *
 * Danger this migration exists to prevent: the resolver now reads `shared`
 * first, so any key whose shared row is empty would fall through to the
 * registry default — the logo would vanish from the live site. So where shared
 * is empty we backfill it, preferring the WEBSITE value (the one the owner has
 * been editing), then order_app, then any legacy unscoped row.
 *
 * App-scoped rows are LEFT IN PLACE, not deleted. They are simply no longer
 * read for these keys, which keeps this reversible: restoring the old
 * BUSINESS_DETAILS_KEYS list restores the old behaviour with the old values.
 */
return new class extends Migration
{
    /** Keys newly moved to the shared record by this change. */
    private const MOVED_KEYS = [
        'site_tagline',
        'logo',
        'logo_dark',
        'favicon',
        'og_image',
        'primary_color',
        'default_item_image',
        'show_social_links',
        'social_instagram',
        'social_facebook',
        'social_tiktok',
        'google_analytics_id',
        'google_tag_manager_id',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }
        if (! Schema::hasColumn('site_settings', 'scope') || ! Schema::hasColumn('site_settings', 'locale')) {
            return;
        }

        $now = now();

        foreach (self::MOVED_KEYS as $key) {
            // Guard: only act on keys this release actually took ownership of.
            if (! in_array($key, OpsOwnedContent::BUSINESS_DETAILS_KEYS, true)) {
                continue;
            }

            $shared = $this->rowValue($key, 'shared', 'en');
            if ($this->isPresent($shared)) {
                continue; // Shared already authoritative — never overwrite it.
            }

            $winner = $this->rowValue($key, 'website', 'en');
            if (! $this->isPresent($winner)) {
                $winner = $this->rowValue($key, 'order_app', 'en');
            }
            if (! $this->isPresent($winner)) {
                // Legacy unscoped row, if the scope column post-dates it.
                $winner = DB::table('site_settings')->where('key', $key)->value('value');
            }
            if (! $this->isPresent($winner)) {
                continue; // Nothing stored anywhere — registry default still applies.
            }

            $this->writeShared($key, (string) $winner, $now);
        }

        SiteSetting::bust();
        \App\Domains\Content\ContentResolver::bust();
    }

    public function down(): void
    {
        // No-op. App-scoped rows were never deleted; roll back by restoring the
        // previous OpsOwnedContent::BUSINESS_DETAILS_KEYS list.
    }

    private function isPresent(mixed $v): bool
    {
        return $v !== null && $v !== '';
    }

    private function rowValue(string $key, string $scope, string $locale): mixed
    {
        return DB::table('site_settings')
            ->where('key', $key)
            ->where('scope', $scope)
            ->where('locale', $locale)
            ->value('value');
    }

    private function writeShared(string $key, string $value, mixed $now): void
    {
        $existing = DB::table('site_settings')
            ->where('key', $key)
            ->where('scope', 'shared')
            ->where('locale', 'en')
            ->first();

        if ($existing) {
            DB::table('site_settings')
                ->where('id', $existing->id)
                ->update(['value' => $value, 'updated_at' => $now]);
            SiteSetting::forgetScoped($key, 'shared', 'en');

            return;
        }

        $template = DB::table('site_settings')->where('key', $key)->first();
        $block = \App\Domains\Content\ContentRegistry::block($key) ?? [];

        DB::table('site_settings')->insert([
            'key' => $key,
            'scope' => 'shared',
            'locale' => 'en',
            'value' => $value,
            'type' => $template->type ?? ($block['type'] ?? 'text'),
            'group' => $template->group ?? ($block['group'] ?? 'General'),
            'label' => $template->label ?? ($block['label'] ?? $key),
            'description' => $template->description ?? ($block['description'] ?? ''),
            'is_public' => (bool) ($template->is_public ?? ($block['public'] ?? false)),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        SiteSetting::forgetScoped($key, 'shared', 'en');
    }
};
