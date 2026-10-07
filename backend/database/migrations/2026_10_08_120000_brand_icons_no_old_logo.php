<?php

declare(strict_types=1);

use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-07: "Have found that in some places it use old logo and
 * branding can u check all? … Pwa logo."
 *
 * The site moved to the light logo on 2026-09-30, but a saved favicon, logo
 * or link-preview image could still name one of the old files: the black
 * square (/logo.png until today, /brand/logo-dark.png as a favicon) or the
 * first flame drawing (/logo.svg). Those values move to the new files; an
 * image uploaded in Business Details → Branding is left as it is.
 */
return new class extends Migration
{
    /** Old shipped files, by URL path. */
    private const OLD = ['/logo.png', '/logo.svg', '/favicon.ico', '/brand/logo-dark.png'];

    private const REPLACE = [
        'favicon' => '/favicon-32.png',
        'logo' => '/brand/logo-light.png',
        'og_image' => '/brand/og-default.png',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        $changed = false;
        foreach (SiteSetting::query()->whereIn('key', array_keys(self::REPLACE))->get() as $row) {
            $value = trim((string) $row->value);
            if ($value === '') {
                continue;
            }
            $path = (string) (parse_url($value, PHP_URL_PATH) ?: '');
            if (!in_array($path, self::OLD, true)) {
                continue;
            }
            // The dark logo file is now the light-lettered one, a fine logo;
            // only a favicon or preview naming it moves.
            if ($row->key === 'logo' && $path === '/brand/logo-dark.png') {
                continue;
            }
            $row->value = self::REPLACE[$row->key];
            $row->save();
            $changed = true;
        }

        if ($changed) {
            SiteSetting::bust();
            if (class_exists(ContentResolver::class)) {
                ContentResolver::bust();
            }
        }
    }

    public function down(): void
    {
        // The old values named files that now hold the new artwork; nothing to restore.
    }
};
