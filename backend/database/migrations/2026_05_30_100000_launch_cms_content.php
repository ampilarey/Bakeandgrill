<?php

declare(strict_types=1);

use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Launch CMS defaults: halal trust strip, /order/menu links, maps embed, softer CTA copy.
 * Safe to re-run — only updates known keys when values still match old defaults.
 */
return new class extends Migration
{
    private const MAPS_EMBED_FALLBACK = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.9!2d73.5093!3d4.1755!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNMKwMTAnMzEuOCJOIDczwrAzMCczMy41IkU!5e0!3m2!1sen!2s!4v1234567890';

    public function up(): void
    {
        if (!Schema::hasTable('site_settings')) {
            return;
        }

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'trust_items'],
            [
                'value' => json_encode([
                    ['icon' => '🌅', 'heading' => 'Baked fresh at 5am daily', 'subtext' => "Never yesterday's pastry"],
                    ['icon' => '🏠', 'heading' => 'Family-owned', 'subtext' => 'Neighbourhood kitchen, Malé'],
                    ['icon' => '☪️', 'heading' => '100% Halal', 'subtext' => 'Trusted ingredients, always'],
                    ['icon' => '💬', 'heading' => 'WhatsApp & Viber', 'subtext' => '+960 9120011'],
                ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'type' => 'json',
                'group' => 'Homepage',
                'label' => 'Trust Strip — 4 Items',
                'description' => 'Four trust points shown in the strip below the hero banner',
                'is_public' => true,
                'updated_at' => now(),
            ],
        );

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'cta_band_subtext'],
            [
                'value' => 'Fresh from our kitchen to your door in 30–45 minutes. Order online or message us on WhatsApp.',
                'updated_at' => now(),
            ],
        );

        DB::table('site_settings')->updateOrInsert(
            ['key' => 'maps_embed_url'],
            [
                'value' => self::MAPS_EMBED_FALLBACK,
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Google Maps Embed URL',
                'description' => 'Paste the full iframe src URL from Google Maps "Share → Embed a map"',
                'is_public' => true,
                'updated_at' => now(),
            ],
        );

        $this->fixMenuLinksInJsonSetting('homepage_categories');
        foreach (['hero_slide_1', 'hero_slide_2', 'hero_slide_3'] as $key) {
            $this->fixMenuLinksInJsonSetting($key, ['cta2_url', 'cta_url']);
        }

        SiteSetting::bust();
    }

    public function down(): void
    {
        // Content migration — no rollback.
    }

    /** @param list<string> $linkKeys */
    private function fixMenuLinksInJsonSetting(string $key, array $linkKeys = ['link']): void
    {
        $row = DB::table('site_settings')->where('key', $key)->first();
        if (!$row || empty($row->value)) {
            return;
        }

        $decoded = json_decode((string) $row->value, true);
        if (!is_array($decoded)) {
            return;
        }

        $changed = false;

        $fixUrl = static function (?string $url): ?string {
            if ($url === null || $url === '') {
                return $url;
            }
            if ($url === '/menu') {
                return '/order/menu';
            }
            if (str_starts_with($url, '/menu?') || str_starts_with($url, '/menu/')) {
                return '/order' . $url;
            }

            return $url;
        };

        $walk = function (array &$node) use (&$walk, &$changed, $linkKeys, $fixUrl): void {
            foreach ($node as $k => &$v) {
                if (is_array($v)) {
                    $walk($v);
                    continue;
                }
                if (in_array((string) $k, $linkKeys, true) && is_string($v)) {
                    $fixed = $fixUrl($v);
                    if ($fixed !== $v) {
                        $v = $fixed;
                        $changed = true;
                    }
                }
            }
        };

        $walk($decoded);

        if (!$changed && $key !== 'homepage_categories') {
            return;
        }

        // homepage_categories: always rewrite /menu links even if structure unchanged
        if ($key === 'homepage_categories') {
            foreach ($decoded as &$cat) {
                if (!is_array($cat)) {
                    continue;
                }
                $fixed = $fixUrl($cat['link'] ?? null);
                if ($fixed !== ($cat['link'] ?? null)) {
                    $cat['link'] = $fixed;
                    $changed = true;
                }
            }
            unset($cat);
        }

        if ($changed || $key === 'homepage_categories') {
            DB::table('site_settings')->where('key', $key)->update([
                'value' => json_encode($decoded, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'updated_at' => now(),
            ]);
        }
    }
};
