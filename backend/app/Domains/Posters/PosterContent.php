<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Gst\Services\GstSettingsService;
use App\Models\Category;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\RestaurantTable;
use App\Services\OpeningHoursService;
use App\Support\OpeningHoursText;
use Throwable;

/**
 * Turns a poster's purpose, slots and bindings into the words and pictures
 * the layout draws (docs/POSTER_PLAN.md § 4.4). A typed slot wins over the
 * live value, except the GST line, which can be moved but not removed.
 */
final class PosterContent
{
    /**
     * @param array<string, mixed> $poster
     * @return array<string, mixed>
     */
    public static function resolve(array $poster, ?int $tableId = null): array
    {
        $purpose = PosterPurposes::get((string) ($poster['template_key'] ?? '')) ?? [];
        $slots = is_array($poster['slots'] ?? null) ? $poster['slots'] : [];
        $bindings = is_array($poster['bindings'] ?? null) ? $poster['bindings'] : [];
        if ($tableId !== null) {
            $bindings['table_id'] = $tableId;
        }

        $item = self::item(isset($bindings['item_id']) ? (int) $bindings['item_id'] : null);
        $promo = self::promotion(isset($bindings['promotion_id']) ? (int) $bindings['promotion_id'] : null);
        $category = self::category(isset($bindings['category_id']) ? (int) $bindings['category_id'] : null);
        $table = self::table(isset($bindings['table_id']) ? (int) $bindings['table_id'] : null);

        $problems = [];
        $warnings = [];
        if ($item !== null && !$item->is_active) {
            $problems[] = 'The dish is hidden.';
        }
        if ($promo !== null && $promo->expires_at !== null) {
            if ($promo->expires_at->isPast()) {
                $problems[] = 'The offer has ended.';
            } elseif ($promo->expires_at->lte(now()->addDays(2))) {
                $warnings[] = 'The offer ends within 2 days.';
            }
        }

        $price = self::itemPrice($item);
        $offer = self::offerText($promo);
        [$gst, $gstDv] = self::gst();

        $headline = self::slot($slots, 'headline', (string) ($purpose['slots']['headline'] ?? ''));
        if ($headline === '' && $item !== null) {
            $headline = (string) $item->name;
        }
        if ($headline === '' && $category !== null) {
            $headline = (string) $category->name;
        }
        $headlineDv = self::slot($slots, 'headline_dv', (string) ($purpose['slots']['headline_dv'] ?? ''));
        if ($headlineDv === '' && $item !== null && is_string($item->name_dv) && $item->name_dv !== '') {
            $headlineDv = $item->name_dv;
        }

        $printedPrice = self::slot($slots, 'price', '');
        if ($printedPrice === '') {
            $printedPrice = $offer['price'] !== '' ? $offer['price'] : ($price['text'] ?? '');
        }

        $content = [
            'eyebrow' => self::slot($slots, 'eyebrow', (string) ($purpose['slots']['eyebrow'] ?? '')),
            'headline' => $headline,
            'headline_dv' => $headlineDv,
            'subhead' => self::slot($slots, 'subhead', $offer['period'] !== '' ? $offer['period'] : (string) ($purpose['slots']['subhead'] ?? '')),
            'subhead_dv' => self::slot($slots, 'subhead_dv', ''),
            'body' => self::slot($slots, 'body', (string) ($purpose['slots']['body'] ?? '')),
            'body_dv' => self::slot($slots, 'body_dv', (string) ($purpose['slots']['body_dv'] ?? '')),
            'badge' => self::slot($slots, 'badge', (string) ($purpose['slots']['badge'] ?? '')),
            'price' => $printedPrice,
            'old_price' => self::slot($slots, 'old_price', ''),
            'period' => $offer['period'],
            'gst' => $gst,
            'gst_dv' => $gstDv,
            'qr_url' => $table !== null ? $table->qrUrl() : rtrim((string) config('app.url'), '/') . '/menu',
            'photo' => self::photoFile($item),
            'photo_url' => $item?->image_url,
            'rows' => self::rows($poster, $category),
            'hours' => self::hours(),
            'price_live' => $price['text'] ?? '',
            'problems' => $problems,
            'warnings' => $warnings,
            'take_down_on' => $promo?->expires_at?->toDateString(),
        ];

        if (($poster['template_key'] ?? '') === 'holiday_hours') {
            $content['body'] = self::slot($slots, 'body', self::closureNote());
        }

        return $content;
    }

    /** @param array<string, mixed> $slots */
    private static function slot(array $slots, string $key, string $fallback): string
    {
        $value = $slots[$key] ?? null;

        return is_string($value) && trim($value) !== '' ? trim($value) : $fallback;
    }

    private static function item(?int $id): ?Item
    {
        if ($id === null || $id < 1) {
            return null;
        }
        try {
            return Item::query()->find($id);
        } catch (Throwable) {
            return null;
        }
    }

    private static function promotion(?int $id): ?Promotion
    {
        if ($id === null || $id < 1) {
            return null;
        }
        try {
            return Promotion::query()->find($id);
        } catch (Throwable) {
            return null;
        }
    }

    private static function category(?int $id): ?Category
    {
        if ($id === null || $id < 1) {
            return null;
        }
        try {
            return Category::query()->find($id);
        } catch (Throwable) {
            return null;
        }
    }

    private static function table(?int $id): ?RestaurantTable
    {
        if ($id === null || $id < 1) {
            return null;
        }
        try {
            return RestaurantTable::query()->find($id);
        } catch (Throwable) {
            return null;
        }
    }

    /** @return array{text: string}|array{} */
    private static function itemPrice(?Item $item): array
    {
        if ($item === null) {
            return [];
        }
        $info = $item->displayPriceInfo();
        $text = ($info['from'] ? 'From ' : '') . 'MVR ' . number_format((float) $info['price'], 2);

        return ['text' => $text];
    }

    /** @return array{price: string, period: string} */
    private static function offerText(?Promotion $promo): array
    {
        if ($promo === null) {
            return ['price' => '', 'period' => ''];
        }
        $price = match ($promo->type) {
            'percentage' => ((int) $promo->discount_value) . '% off',
            'fixed' => 'MVR ' . number_format(((int) $promo->discount_value) / 100, 2) . ' off',
            default => (string) $promo->name,
        };
        $period = '';
        if (is_string($promo->starts_time) && $promo->starts_time !== '' && is_string($promo->ends_time) && $promo->ends_time !== '') {
            $period = substr($promo->starts_time, 0, 5) . ' – ' . substr($promo->ends_time, 0, 5);
        }
        if ($promo->code) {
            $period = trim($period . ($period !== '' ? ' · ' : '') . 'Code ' . $promo->code);
        }

        return ['price' => $price, 'period' => $period];
    }

    /** @return array{0: string, 1: string} */
    private static function gst(): array
    {
        $line = 'Prices include GST';
        $dv = 'އަގުތަކުގައި ޖީއެސްޓީ ހިމެނޭ';
        try {
            $svc = app(GstSettingsService::class);
            if (!$svc->taxInclusive()) {
                $pct = rtrim(rtrim(number_format($svc->defaultTaxRatePercent(), 2), '0'), '.');
                $line = "GST {$pct}% is added";
                $dv = "ޖީއެސްޓީ {$pct}% އިތުރުވާނެ";
            }
        } catch (Throwable) {
            // The inclusive wording stands when settings cannot be read.
        }

        return [$line, $dv];
    }

    private static function photoFile(?Item $item): ?string
    {
        $url = $item?->image_url;
        if (!is_string($url) || $url === '') {
            return null;
        }
        $path = parse_url($url, PHP_URL_PATH);
        $path = is_string($path) ? $path : $url;
        $relative = ltrim($path, '/');
        $storage = ltrim((string) preg_replace('#^storage/#', '', $relative), '/');
        foreach ([public_path($relative), storage_path('app/public/' . $storage)] as $file) {
            if (is_file($file)) {
                return $file;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $poster
     * @return list<array{name: string, name_dv: string, price: string}>
     */
    private static function rows(array $poster, ?Category $category): array
    {
        $key = (string) ($poster['template_key'] ?? '');
        try {
            $query = Item::query()->where('is_active', true)->where('hide_from_bestsellers', false);
            if ($category !== null && in_array($key, ['category', 'mini_menu'], true)) {
                $query->where('category_id', $category->id);
            } elseif ($key === 'best_sellers') {
                $ids = self::bestSellerIds();
                if ($ids !== []) {
                    $query->whereIn('id', $ids);
                }
            } elseif (!in_array($key, ['category', 'mini_menu', 'best_sellers'], true)) {
                return [];
            }

            return $query->orderBy('name')->limit($key === 'mini_menu' ? 6 : 8)->get()
                ->map(function (Item $item): array {
                    $info = $item->displayPriceInfo();

                    return [
                        'name' => (string) $item->name,
                        'name_dv' => is_string($item->name_dv) ? $item->name_dv : '',
                        'price' => 'MVR ' . number_format((float) $info['price'], 2),
                    ];
                })->all();
        } catch (Throwable) {
            return [];
        }
    }

    /** @return list<int> */
    private static function bestSellerIds(): array
    {
        try {
            return \App\Models\OrderItem::query()
                ->selectRaw('item_id, SUM(quantity) as qty')
                ->where('created_at', '>=', now()->subDays(30))
                ->whereNotNull('item_id')
                ->groupBy('item_id')
                ->orderByDesc('qty')
                ->limit(8)
                ->pluck('item_id')
                ->map(static fn ($id): int => (int) $id)
                ->all();
        } catch (Throwable) {
            return [];
        }
    }

    /** @return list<array{day: string, time: string}> */
    private static function hours(): array
    {
        $names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        try {
            $hours = app(OpeningHoursService::class)->getHoursForDisplay();
        } catch (Throwable) {
            return [];
        }
        $rows = [];
        foreach ($names as $i => $name) {
            $day = $hours[$i] ?? $hours[(string) $i] ?? null;
            $time = 'Closed';
            if (is_array($day) && !($day['closed'] ?? false)) {
                $time = OpeningHoursText::range($day) ?? 'Closed';
            }
            $rows[] = ['day' => $name, 'time' => $time];
        }

        return $rows;
    }

    private static function closureNote(): string
    {
        try {
            $closures = app(OpeningHoursService::class)->closures();
        } catch (Throwable) {
            return '';
        }
        $lines = [];
        foreach ($closures as $date => $reason) {
            $lines[] = $date . (is_string($reason) && $reason !== '' ? ' — ' . $reason : ' — closed');
            if (count($lines) >= 4) {
                break;
            }
        }

        return $lines === [] ? 'Closed on the days written below.' : implode("\n", $lines);
    }
}
