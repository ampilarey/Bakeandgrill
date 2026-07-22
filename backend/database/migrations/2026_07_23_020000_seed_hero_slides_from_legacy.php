<?php

declare(strict_types=1);

use App\Domains\Content\HeroSlides;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seed hero_slides JSON array from hero_slide_1/2/3 per scope+locale.
 * Additive — does not drop legacy keys.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $hasLocale = Schema::hasColumn('site_settings', 'locale');
        $scopes = ['shared', 'website', 'order_app'];
        $locales = $hasLocale
            ? DB::table('site_settings')->distinct()->pluck('locale')->filter()->values()->all()
            : ['en'];
        if ($locales === []) {
            $locales = ['en'];
        }

        foreach ($scopes as $scope) {
            foreach ($locales as $locale) {
                $existing = $this->getScoped('hero_slides', $scope, (string) $locale, $hasLocale);
                if ($existing !== null && $existing !== '' && $existing !== '[]') {
                    continue;
                }

                $legacy = [];
                for ($i = 1; $i <= 3; $i++) {
                    $legacy[$i] = $this->getScoped("hero_slide_{$i}", $scope, (string) $locale, $hasLocale);
                }

                if (count(array_filter($legacy, static fn ($v) => $v !== null && $v !== '')) === 0) {
                    continue;
                }

                $json = HeroSlides::fromLegacy($legacy);
                $this->upsert('hero_slides', $scope, (string) $locale, $json, $hasLocale);
            }
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        DB::table('site_settings')->where('key', 'hero_slides')->delete();
        SiteSetting::bust();
    }

    private function getScoped(string $key, string $scope, string $locale, bool $hasLocale): ?string
    {
        $q = DB::table('site_settings')->where('key', $key)->where('scope', $scope);
        if ($hasLocale) {
            $q->where('locale', $locale);
        }
        $val = $q->value('value');

        return $val === null ? null : (string) $val;
    }

    private function upsert(string $key, string $scope, string $locale, string $value, bool $hasLocale): void
    {
        $attrs = [
            'key' => $key,
            'scope' => $scope,
            'value' => $value,
            'type' => 'json',
            'group' => 'Hero',
            'label' => 'Hero Slides',
            'is_public' => true,
            'updated_at' => now(),
        ];
        if ($hasLocale) {
            $attrs['locale'] = $locale;
        }

        $match = ['key' => $key, 'scope' => $scope];
        if ($hasLocale) {
            $match['locale'] = $locale;
        }

        $exists = DB::table('site_settings')->where($match)->exists();
        if ($exists) {
            DB::table('site_settings')->where($match)->update([
                'value' => $value,
                'updated_at' => now(),
            ]);
        } else {
            $attrs['created_at'] = now();
            DB::table('site_settings')->insert($attrs);
        }
    }
};
