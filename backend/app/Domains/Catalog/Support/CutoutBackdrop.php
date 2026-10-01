<?php

declare(strict_types=1);

namespace App\Domains\Catalog\Support;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Support\Facades\Schema;

/**
 * The circle a cut-out thumbnail sits on.
 *
 * Owner, 2026-10-01: "pls add option to control backdrop for all, for a
 * specific category, or sub category, and if i want separately for each
 * item." So a backdrop is a colour and a strength, and each can be set at
 * four levels. The most specific one that says something wins, field by
 * field: an item that only sets a colour still takes its category's
 * strength, and a category that sets nothing passes its parent's through.
 *
 *   default   Business Details → Menu (menu_cutout_backdrop_*)
 *   parent    the top-level category, when the item's category is a subcategory
 *   category  the item's own category
 *   item      the item
 *
 * Stored on items.cutout_backdrop and categories.cutout_backdrop as
 * {"color": "#RRGGBB"|null, "strength": 0..100|null}; a row with nothing set
 * is stored as null. Strength is the circle's opacity in percent, so 0 hides
 * the circle and 100 paints it solid.
 */
final class CutoutBackdrop
{
    public const DEFAULT_COLOR = '#F3EAE1';

    public const DEFAULT_STRENGTH = 100;

    public const COLOR_KEY = 'menu_cutout_backdrop_color';

    public const STRENGTH_KEY = 'menu_cutout_backdrop_strength';

    /** @var array<int, array{parent_id: ?int, backdrop: ?array{color: ?string, strength: ?int}}>|null */
    private ?array $categories = null;

    /** @var array{color: string, strength: int}|null */
    private ?array $default = null;

    /**
     * Validate and tidy a stored or submitted backdrop. Anything that is not
     * a colour or a percentage is dropped; nothing left means null.
     *
     * @return array{color: ?string, strength: ?int}|null
     */
    public static function normalize(mixed $raw): ?array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : null;
        }
        if (!is_array($raw)) {
            return null;
        }

        $color = self::normalizeColor($raw['color'] ?? null);
        $strength = self::normalizeStrength($raw['strength'] ?? null);

        if ($color === null && $strength === null) {
            return null;
        }

        return ['color' => $color, 'strength' => $strength];
    }

    public static function normalizeColor(mixed $raw): ?string
    {
        if (!is_string($raw)) {
            return null;
        }
        $value = trim($raw);
        if (preg_match('/^#([0-9a-fA-F]{3})$/', $value, $m) === 1) {
            return '#' . strtoupper($m[1][0] . $m[1][0] . $m[1][1] . $m[1][1] . $m[1][2] . $m[1][2]);
        }

        return preg_match('/^#[0-9a-fA-F]{6}$/', $value) === 1 ? strtoupper($value) : null;
    }

    public static function normalizeStrength(mixed $raw): ?int
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (!is_numeric($raw)) {
            return null;
        }

        return max(0, min(100, (int) round((float) $raw)));
    }

    /**
     * The backdrop this item's card draws, and which level decided it.
     *
     * @return array{color: string, strength: int, source: 'default'|'parent'|'category'|'item'}
     */
    public function resolve(Item $item): array
    {
        $resolved = $this->default() + ['source' => 'default'];

        $categoryId = $item->category_id !== null ? (int) $item->category_id : null;
        $chain = [];
        if ($categoryId !== null) {
            $category = $this->categories()[$categoryId] ?? null;
            if ($category !== null) {
                $parentId = $category['parent_id'];
                if ($parentId !== null && isset($this->categories()[$parentId])) {
                    $chain[] = ['parent', $this->categories()[$parentId]['backdrop']];
                }
                $chain[] = ['category', $category['backdrop']];
            }
        }
        $chain[] = ['item', self::normalize($item->cutout_backdrop)];

        foreach ($chain as [$source, $override]) {
            if ($override === null) {
                continue;
            }
            foreach (['color', 'strength'] as $field) {
                if ($override[$field] !== null) {
                    $resolved[$field] = $override[$field];
                    $resolved['source'] = $source;
                }
            }
        }

        return $resolved;
    }

    /**
     * The site-wide default from Business Details.
     *
     * @return array{color: string, strength: int}
     */
    public function default(): array
    {
        if ($this->default === null) {
            $color = null;
            $strength = null;
            if (function_exists('content')) {
                $color = self::normalizeColor(content(self::COLOR_KEY, ''));
                $strength = self::normalizeStrength(content(self::STRENGTH_KEY, ''));
            }
            $this->default = [
                'color' => $color ?? self::DEFAULT_COLOR,
                'strength' => $strength ?? self::DEFAULT_STRENGTH,
            ];
        }

        return $this->default;
    }

    /** Forget what was read, for a request that changes a category or the default. */
    public function forget(): void
    {
        $this->categories = null;
        $this->default = null;
    }

    /**
     * Every category's parent and backdrop, read once. The table is small and
     * a menu page resolves hundreds of items.
     *
     * @return array<int, array{parent_id: ?int, backdrop: ?array{color: ?string, strength: ?int}}>
     */
    private function categories(): array
    {
        if ($this->categories === null) {
            $this->categories = [];
            if (Schema::hasColumn('categories', 'cutout_backdrop')) {
                foreach (Category::query()->get(['id', 'parent_id', 'cutout_backdrop']) as $category) {
                    $this->categories[(int) $category->id] = [
                        'parent_id' => $category->parent_id !== null ? (int) $category->parent_id : null,
                        'backdrop' => self::normalize($category->cutout_backdrop),
                    ];
                }
            }
        }

        return $this->categories;
    }
}
