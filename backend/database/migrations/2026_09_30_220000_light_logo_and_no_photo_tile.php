<?php

declare(strict_types=1);

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-09-30: "Now black background is little difficult" ... "I think
 * this is nice. Can u make the changes through the website".
 *
 * The website and the order app show the light logo (flame, brown lettering,
 * no black square), and a menu item with no photo shows a cream tile with the
 * logo instead of the black disc. Both files ship with the site under
 * public/brand. The favicon and the social preview image are left as they
 * are; all of it can be changed again in Business Details → Branding.
 */
return new class extends Migration
{
    private const LOGO = '/brand/logo-light.png';

    private const LOGO_DARK = '/brand/logo-dark.png';

    private const NO_PHOTO = '/brand/default-item-image.png';

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $locales = SiteSetting::hasLocaleColumn() ? ['en', 'dv'] : ['en'];
        $scoped = SiteSetting::hasScopeColumn();

        foreach ($locales as $locale) {
            // The logo is a Business Details field: both apps read the shared
            // record. Dark surfaces (signage, dark mode) take logo_dark, which
            // used to be empty and fell back to the black logo; it now names
            // the black one so those screens do not change.
            foreach ($scoped ? ['shared', 'website', 'order_app'] : ['shared'] as $scope) {
                SiteSetting::set('logo', self::LOGO, $scope, $locale);
                $this->describe('logo', $scope, $locale, 'Logo', 'Shown in the header of the website and the order app, and on documents.');
                SiteSetting::set('logo_dark', self::LOGO_DARK, $scope, $locale);
                $this->describe('logo_dark', $scope, $locale, 'Logo for dark backgrounds', 'Signage and dark mode; falls back to the logo if empty.');
            }
            foreach ($scoped ? ['shared', 'website', 'order_app'] : ['shared'] as $scope) {
                SiteSetting::set('default_item_image', self::NO_PHOTO, $scope, $locale);
                $this->describe('default_item_image', $scope, $locale, 'Default item photo', 'Shown for menu items that don\'t have their own photo.');
            }
        }

        SiteSetting::bust();
        if (class_exists(ContentResolver::class)) {
            ContentResolver::bust();
        }
    }

    public function down(): void
    {
        // The previous values are not kept; set the logo again in Branding.
    }

    private function describe(string $key, string $scope, string $locale, string $label, string $description): void
    {
        $row = SiteSetting::query()->where('key', $key);
        if (SiteSetting::hasScopeColumn()) {
            $row->where('scope', $scope);
        }
        if (SiteSetting::hasLocaleColumn()) {
            $row->where('locale', $locale);
        }
        $row->update(['type' => 'image', 'group' => 'Branding', 'label' => $label, 'description' => $description, 'is_public' => true]);
    }
};
