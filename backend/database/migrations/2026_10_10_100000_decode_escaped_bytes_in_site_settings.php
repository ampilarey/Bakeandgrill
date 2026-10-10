<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * UI audit, 2026-10-10: the website's Hours page showed "Contact page
 * \xe2\x86\x92" and a button "\xf0\x9f\x9b\x92 Order Online Now"; the page's
 * browser-tab title and search description had the same codes.
 *
 * 2026_04_10_add_final_cms_settings wrote those four wordings in
 * single-quoted PHP strings, where \xe2 is four characters, not a byte. Each
 * run of such codes that spells valid UTF-8 is turned back into the
 * characters it stands for ("→", "–", "é"; the cart emoji is then dropped
 * with its space, since the button draws its own icon now). Anything else is
 * left exactly as it is. Runs on every stored wording, every scope and
 * language, so a copy saved elsewhere is mended too.
 *
 * Each wording is cached forever under its own key (SiteSetting::getScoped),
 * so every row mended here has its key forgotten too; without that the site
 * keeps showing the codes until somebody clears the cache by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        $columns = ['id', 'key', 'value'];
        if (SiteSetting::hasScopeColumn()) {
            $columns[] = 'scope';
        }
        if (SiteSetting::hasLocaleColumn()) {
            $columns[] = 'locale';
        }

        $changed = false;

        DB::table('site_settings')->select($columns)->orderBy('id')
            ->chunkById(500, function ($rows) use (&$changed) {
                foreach ($rows as $row) {
                    $value = $row->value;
                    if (! is_string($value) || ! str_contains($value, '\\x')) {
                        continue;
                    }
                    $fixed = self::decode($value);
                    if ($row->key === 'hours_order_btn_label') {
                        $fixed = trim(str_replace("\u{1F6D2}", '', $fixed));
                    }
                    if ($fixed !== $value) {
                        DB::table('site_settings')->where('id', $row->id)->update(['value' => $fixed]);
                        SiteSetting::forgetScoped(
                            (string) $row->key,
                            (string) ($row->scope ?? 'shared'),
                            (string) ($row->locale ?? 'en'),
                        );
                        $changed = true;
                    }
                }
            });

        if ($changed) {
            SiteSetting::bust();
        }
    }

    public function down(): void
    {
        // Nothing to undo: the codes were never meant to be stored.
    }

    /** Turn each run of literal \xHH codes that spells valid UTF-8 into those characters. */
    public static function decode(string $value): string
    {
        return (string) preg_replace_callback('/(?:\\\\x[0-9a-fA-F]{2})+/', function (array $m): string {
            $bytes = preg_replace_callback('/\\\\x([0-9a-fA-F]{2})/', fn (array $b) => chr((int) hexdec($b[1])), $m[0]);

            return is_string($bytes) && mb_check_encoding($bytes, 'UTF-8') ? $bytes : $m[0];
        }, $value);
    }
};
