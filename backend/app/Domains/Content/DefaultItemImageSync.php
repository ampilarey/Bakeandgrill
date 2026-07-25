<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Schema;

/**
 * Keep default_item_image identical across shared / website / order_app
 * and bust ContentResolver forever-caches so the order app sees updates.
 */
final class DefaultItemImageSync
{
    public static function run(): void
    {
        if (!Schema::hasTable('site_settings')) {
            SiteSetting::bust();
            ContentResolver::bust();

            return;
        }

        if (!SiteSetting::hasScopeColumn()) {
            SiteSetting::bust();
            ContentResolver::bust();

            return;
        }

        $locales = SiteSetting::hasLocaleColumn() ? ['en', 'dv'] : ['en'];

        foreach ($locales as $locale) {
            $value = self::bestValue($locale);
            if ($value === '') {
                continue;
            }

            foreach (ContentRegistry::SCOPES as $scope) {
                SiteSetting::set('default_item_image', $value, $scope, $locale);
                $row = SiteSetting::query()
                    ->where('key', 'default_item_image')
                    ->where('scope', $scope);
                if (SiteSetting::hasLocaleColumn()) {
                    $row->where('locale', $locale);
                }
                $row->update([
                    'type' => 'image',
                    'group' => 'Branding',
                    'label' => 'Default item photo',
                    'description' => 'Shown for menu items that don\'t have their own photo.',
                    'is_public' => true,
                ]);
            }
        }

        SiteSetting::bust();
        ContentResolver::bust();
    }

    private static function bestValue(string $locale): string
    {
        foreach (['website', 'order_app', 'shared'] as $scope) {
            $candidate = SiteSetting::getScoped('default_item_image', $scope, $locale);
            if (is_string($candidate) && trim($candidate) !== '') {
                return $candidate;
            }
        }

        return '';
    }
}
