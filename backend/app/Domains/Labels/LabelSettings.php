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
    public const STORAGES = ['frozen', 'chilled', 'ambient'];

    public const DEFAULTS = [
        // Sticker heading per storage (an item can carry its own instead).
        'label_header_line' => 'FROZEN HEDHIKA',
        'label_header_line_dv' => 'ފްރޯޒަން ހެދިކާ',
        'label_header_line_chilled' => 'CHILLED HEDHIKA',
        'label_header_line_chilled_dv' => 'ފިނިކުރި ހެދިކާ',
        'label_header_line_ambient' => 'FRESH HEDHIKA',
        'label_header_line_ambient_dv' => 'ތާޒާ ހެދިކާ',
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
        // Box label per storage: heading under the name, the badge (two
        // lines) and the handling strip. A shop's label can override the
        // heading and strip.
        'label_box_heading' => 'FROZEN SHORT EATS · HEDHIKA',
        'label_box_heading_chilled' => 'CHILLED SHORT EATS · HEDHIKA',
        'label_box_heading_ambient' => 'FRESH SHORT EATS · HEDHIKA',
        'label_box_badge_frozen' => 'KEEP FROZEN',
        'label_box_badge_frozen_2' => '-18°C',
        'label_box_badge_chilled' => 'KEEP CHILLED',
        'label_box_badge_chilled_2' => '0–4°C',
        'label_box_badge_ambient' => 'KEEP COOL',
        'label_box_badge_ambient_2' => '& DRY',
        'label_box_strip' => 'KEEP FROZEN AT -18°C  •  FOOD ITEMS  •  HANDLE WITH CARE  •  THIS SIDE UP',
        'label_box_strip_chilled' => 'KEEP REFRIGERATED AT 0–4°C  •  FOOD ITEMS  •  HANDLE WITH CARE  •  THIS SIDE UP',
        'label_box_strip_ambient' => 'FOOD ITEMS  •  KEEP COOL AND DRY  •  HANDLE WITH CARE  •  THIS SIDE UP',
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

    public static function storage(string $storage): string
    {
        return in_array($storage, self::STORAGES, true) ? $storage : 'frozen';
    }

    public static function storageLine(string $storage, bool $dhivehi): string
    {
        return self::get('label_storage_' . self::storage($storage) . ($dhivehi ? '_dv' : ''));
    }

    /** The sticker heading for a storage type ("FROZEN HEDHIKA"); the frozen keys kept their old names. */
    public static function headingLine(string $storage, bool $dhivehi): string
    {
        $storage = self::storage($storage);

        return self::get('label_header_line' . ($storage === 'frozen' ? '' : '_' . $storage) . ($dhivehi ? '_dv' : ''));
    }

    public static function boxHeading(string $storage): string
    {
        $storage = self::storage($storage);

        return self::get('label_box_heading' . ($storage === 'frozen' ? '' : '_' . $storage));
    }

    public static function boxStrip(string $storage): string
    {
        $storage = self::storage($storage);

        return self::get('label_box_strip' . ($storage === 'frozen' ? '' : '_' . $storage));
    }

    /** @return array{0: string, 1: string} The badge's small and big lines. */
    public static function boxBadge(string $storage): array
    {
        $storage = self::storage($storage);

        return [self::get('label_box_badge_' . $storage), self::get('label_box_badge_' . $storage . '_2')];
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
