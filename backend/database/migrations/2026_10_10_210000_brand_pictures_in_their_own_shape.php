<?php

declare(strict_types=1);

use App\Domains\Content\BrandImages;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Owner, 2026-10-10: "Fix" — the logo, dark logo, browser tab icon and link
 * preview came out of an upload cut to a 4:3 menu crop on white.
 *
 * A saved value naming one of those crops is redrawn in its own shape
 * (BrandImages), from the Media Library's full-size master when there is one.
 * A master made before today was flattened onto white, so a see-through logo
 * gets its whole shape back but not its see-through background: that needs
 * the PNG uploaded again. Blank values, the shipped files under /brand and
 * addresses on other sites are left as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('site_settings') || !Schema::hasTable('media_assets') || !function_exists('imagecreatetruecolor')) {
            return;
        }

        $brand = app(BrandImages::class);
        $changed = false;
        foreach (SiteSetting::query()->whereIn('key', BrandImages::keys())->get() as $row) {
            $value = trim((string) $row->value);
            if ($value === '') {
                continue;
            }
            try {
                $redrawn = $brand->normalize((string) $row->key, $value);
            } catch (Throwable) {
                continue;
            }
            if ($redrawn === $value) {
                continue;
            }
            $row->value = $redrawn;
            $row->save();
            SiteSetting::forgetScoped((string) $row->key, (string) ($row->scope ?? 'shared'), (string) ($row->locale ?? 'en'));
            $changed = true;
        }

        if ($changed) {
            SiteSetting::bust();
        }
    }

    public function down(): void
    {
        // The 4:3 crops are still on disk and in the Media Library; nothing to restore.
    }
};
