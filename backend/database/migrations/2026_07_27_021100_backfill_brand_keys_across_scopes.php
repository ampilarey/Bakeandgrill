<?php

declare(strict_types=1);

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reconcile divergent brand rows so website/order_app/shared match.
 * Prefer first non-empty of website → shared → order_app (mirrors resolver priority).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('site_settings') || ! SiteSetting::hasScopeColumn()) {
            return;
        }

        $keys = ContentRegistry::BRAND_SYNCED_KEYS;
        $hasLocale = SiteSetting::hasLocaleColumn();

        $locales = ['en'];
        if ($hasLocale) {
            $found = DB::table('site_settings')
                ->whereIn('key', $keys)
                ->distinct()
                ->pluck('locale')
                ->filter(static fn ($l) => is_string($l) && $l !== '')
                ->values()
                ->all();
            if ($found !== []) {
                $locales = array_values(array_unique(array_merge(['en'], $found)));
            }
        }

        foreach ($keys as $key) {
            foreach ($locales as $locale) {
                $source = $this->firstNonEmpty($key, $locale, $hasLocale);
                if ($source === null || $source === '') {
                    continue;
                }

                foreach (['shared', 'website', 'order_app'] as $scope) {
                    SiteSetting::set($key, $source, $scope, $locale);
                }
            }
        }

        SiteSetting::bust();
        ContentResolver::bust();
    }

    public function down(): void
    {
        // Non-destructive backfill — nothing to reverse.
    }

    private function firstNonEmpty(string $key, string $locale, bool $hasLocale): ?string
    {
        foreach (['website', 'shared', 'order_app'] as $scope) {
            $query = DB::table('site_settings')
                ->where('key', $key)
                ->where('scope', $scope);
            if ($hasLocale) {
                $query->where('locale', $locale);
            }
            $value = $query->value('value');
            if (is_string($value) && trim($value) !== '') {
                return $value;
            }
        }

        return null;
    }
};
