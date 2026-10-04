<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\SiteSetting;

/**
 * The wording on labels the owner can change without a deploy, with the
 * wording of the original stickers (docs/LABEL_HUB_PLAN.md §4.3) as defaults.
 * Contact details are not here: they come from Business Details, the same as
 * the receipts and the complaint poster.
 */
final class LabelSettings
{
    /** @var array<string, string> */
    public const DEFAULTS = [
        'label_header_line' => 'FROZEN HEDHIKA',
        'label_header_line_dv' => 'ފްރޯޒަން ހެދިކާ',
        'label_brand_line_dv' => 'ބޭކް އެންޑް ގްރިލް',
        'label_storage_frozen' => 'KEEP FROZEN AT -18°C OR BELOW  •  DO NOT REFREEZE ONCE THAWED',
        'label_storage_frozen_dv' => '-18°C ނުވަތަ އެއަށްވުރެ ފިނިކޮށް ބަހައްޓަވާ  •  ފިނި ފިލުމަށްފަހު އަލުން ފްރީޒް ނުކުރައްވާ',
        'label_storage_chilled' => 'KEEP REFRIGERATED AT 0–4°C  •  CONSUME WITHIN 2 DAYS OF OPENING',
        'label_storage_chilled_dv' => '0–4°C ގައި ފިނިކޮށް ބަހައްޓަވާ  •  ހުޅުވުމަށްފަހު 2 ދުވަހުގެ ތެރޭގައި ބޭނުންކުރައްވާ',
        'label_storage_ambient' => 'STORE IN A COOL, DRY PLACE',
        'label_storage_ambient_dv' => 'ފިނި، ހިކި ތަނެއްގައި ބަހައްޓަވާ',
        'label_contact_ways' => 'CALL  ·  WHATSAPP  ·  VIBER',
        'label_contact_ways_dv' => 'ގުޅުއްވާ  •  ވަޓްސްއެޕް  •  ވައިބަރ',
        'label_landmark_dv' => 'ހ. ސަހަރާ ކައިރި',
        'label_address_dv' => 'ކަލާފާނު ހިނގުން، މާލެ',
        'label_box_strip' => 'KEEP FROZEN AT -18°C  •  FOOD ITEMS  •  HANDLE WITH CARE  •  THIS SIDE UP',
        'label_box_heading' => 'FROZEN SHORT EATS · HEDHIKA',
        'label_precut_top' => '0',
        'label_precut_left' => '0',
        'label_precut_gutter' => '0',
    ];

    public static function get(string $key): string
    {
        $value = SiteSetting::get($key, null);
        $value = is_string($value) ? trim($value) : (is_numeric($value) ? (string) $value : '');

        return $value !== '' ? $value : (self::DEFAULTS[$key] ?? '');
    }

    /** @return array<string, string> */
    public static function all(): array
    {
        $out = [];
        foreach (array_keys(self::DEFAULTS) as $key) {
            $out[$key] = self::get($key);
        }

        return $out;
    }

    /** @param array<string, mixed> $values */
    public static function save(array $values): void
    {
        foreach ($values as $key => $value) {
            if (!array_key_exists($key, self::DEFAULTS)) {
                continue;
            }
            $value = trim((string) $value);
            // Saving the default (or nothing) clears the override.
            SiteSetting::set($key, $value === self::DEFAULTS[$key] ? '' : $value);
        }
    }

    public static function storageLine(string $storage, bool $dhivehi): string
    {
        $storage = in_array($storage, ['frozen', 'chilled', 'ambient'], true) ? $storage : 'frozen';

        return self::get('label_storage_' . $storage . ($dhivehi ? '_dv' : ''));
    }

    /** @return array{top: float, left: float, gutter: float} */
    public static function precut(): array
    {
        $num = fn (string $k) => max(-20.0, min(20.0, (float) self::get($k)));

        return ['top' => $num('label_precut_top'), 'left' => $num('label_precut_left'), 'gutter' => max(0.0, $num('label_precut_gutter'))];
    }

    /**
     * Contact details for the footer, from Business Details.
     *
     * @return array{phone: string, website: string, address: string, landmark: string, tagline: string, name: string}
     */
    public static function contact(): array
    {
        $site = trim((string) content('business_website', ''));
        if ($site === '') {
            $site = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
        }
        $site = (string) preg_replace('#^https?://(www\.)?#i', '', rtrim($site, '/'));
        $address = implode(', ', array_filter([
            trim((string) content('business_address_line1', '')),
            trim((string) content('business_address_city', '')),
        ], fn (string $s) => $s !== ''));
        if ($address === '') {
            $address = trim((string) content('business_address', ''));
        }

        return [
            'phone' => trim((string) content('business_phone', '')),
            'website' => $site,
            'address' => $address,
            'landmark' => trim((string) content('business_landmark', '')),
            'tagline' => trim((string) content('site_tagline', '')) ?: 'Fresh Baked, Fire Grilled',
            'name' => trim((string) content('site_name', '')) ?: 'Bake & Grill',
        ];
    }
}
