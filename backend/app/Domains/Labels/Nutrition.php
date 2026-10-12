<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\InventoryItem;
use App\Models\Item;

/**
 * The nutrition panel (2026-10-12): per 100 g of the finished product,
 * worked out from the recipe. Each inventory ingredient carries its
 * values per 100 g (Labels → Settings → Nutrition); the recipe's grams of
 * each give the totals, and the totals over the recipe's weight give the
 * panel. The panel prints only when every food ingredient in the recipe
 * has values and a weight in grams, since a part-panel misleads; the
 * settings card says what is missing. A custom label types its own line.
 */
final class Nutrition
{
    /** The values an ingredient carries per 100 g, with the words the card shows. */
    public const FIELDS = [
        'kcal' => 'Energy (kcal)',
        'fat' => 'Fat (g)',
        'sat_fat' => 'of which saturates (g)',
        'carbs' => 'Carbohydrate (g)',
        'sugars' => 'of which sugars (g)',
        'protein' => 'Protein (g)',
        'salt' => 'Salt (g)',
    ];

    /** The columns the sticker's panel shows, in order. */
    public const PANEL = ['kcal' => 'ENERGY', 'fat' => 'FAT', 'carbs' => 'CARBS', 'protein' => 'PROTEIN', 'salt' => 'SALT'];

    public function __construct(private readonly LabelIngredients $ingredients) {}

    /**
     * The panel for a menu item from its recipe.
     *
     * @return array{complete: bool, per100: array<string, float>, grams: float, missing: list<string>, unweighed: list<string>, rows: list<array{en: string, grams: ?float, has: bool}>}
     */
    public function forItem(Item $item): array
    {
        $rows = $this->ingredients->recipeIngredients($item);
        if ($rows === []) {
            return ['complete' => false, 'per100' => [], 'grams' => 0.0, 'missing' => [], 'unweighed' => [], 'rows' => []];
        }
        $values = InventoryItem::query()->whereIn('id', array_column($rows, 'inventory_id'))->pluck('nutrition', 'id');
        $totals = array_fill_keys(array_keys(self::FIELDS), 0.0);
        $grams = 0.0;
        $missing = [];
        $unweighed = [];
        $out = [];
        foreach ($rows as $row) {
            $n = self::clean(is_array($values[$row['inventory_id']] ?? null) ? $values[$row['inventory_id']] : (is_string($values[$row['inventory_id']] ?? null) ? (array) json_decode($values[$row['inventory_id']], true) : []));
            $has = $n !== null;
            $out[] = ['en' => $row['en'], 'grams' => $row['grams'], 'has' => $has];
            if ($row['grams'] === null) {
                $unweighed[] = $row['en'];
                continue;
            }
            if (!$has) {
                $missing[] = $row['en'];
                continue;
            }
            $grams += $row['grams'];
            foreach ($totals as $key => $v) {
                $totals[$key] = $v + ($n[$key] ?? 0.0) * $row['grams'] / 100;
            }
        }
        $complete = $missing === [] && $unweighed === [] && $grams > 0;
        $per100 = [];
        if ($complete) {
            foreach ($totals as $key => $v) {
                $per100[$key] = round($v / $grams * 100, $key === 'kcal' ? 0 : 1);
            }
        }

        return ['complete' => $complete, 'per100' => $per100, 'grams' => round($grams, 1), 'missing' => $missing, 'unweighed' => $unweighed, 'rows' => $out];
    }

    /**
     * What a sticker prints for a product: the recipe's panel as rows for
     * the full design (`rows`, five columns) and the wrap label (`all`,
     * every value), or a custom label's typed line; null for nothing. `per`
     * is "g" or "ml" (a drink's values are per 100 ml).
     *
     * @return ?array{rows: list<array{0: string, 1: string}>, all: list<array{0: string, 1: string}>, line: string, per: string}
     */
    public function forSticker(Item|CustomLabel $product): ?array
    {
        $per = self::per($product);
        if ($product instanceof CustomLabel) {
            $line = trim((string) $product->label_nutrition);

            return $line !== '' ? ['rows' => [], 'all' => [], 'line' => $line, 'per' => $per] : null;
        }
        if (!$product->label_show_nutrition) {
            return null;
        }
        $panel = $this->forItem($product);
        if (!$panel['complete']) {
            return null;
        }

        return ['rows' => self::rows($panel['per100']), 'all' => self::all($panel['per100']), 'line' => self::line($panel['per100']), 'per' => $per];
    }

    /** "g", or "ml" when the product says its values are per 100 ml (a drink). */
    public static function per(Item|CustomLabel $product): string
    {
        return $product->label_nutrition_per === 'ml' ? 'ml' : 'g';
    }

    /** @return list<array{0: string, 1: string}> every value as a row: Energy → "296 kcal", Fat → "1.1 g", of which saturates → "0.3 g" … */
    public static function all(array $per100): array
    {
        $rows = [];
        foreach (self::FIELDS as $key => $label) {
            $name = (string) preg_replace('/\s*\((kcal|g)\)$/', '', $label);
            $rows[] = [$name, $key === 'kcal' ? number_format((float) ($per100[$key] ?? 0), 0) . ' kcal' : number_format((float) ($per100[$key] ?? 0), 1) . ' g'];
        }

        return $rows;
    }

    /**
     * Typed values → numbers per 100 g, or null when none is set. A value
     * below zero or above what 100 g can hold is refused by the caller.
     *
     * @param array<string, mixed> $in
     * @return ?array<string, float>
     */
    public static function clean(array $in): ?array
    {
        $out = [];
        foreach (array_keys(self::FIELDS) as $key) {
            $v = $in[$key] ?? null;
            if ($v === null || $v === '') {
                continue;
            }
            if (!is_numeric($v)) {
                return null;
            }
            $out[$key] = round((float) $v, 2);
        }
        if (!isset($out['kcal'])) {
            return null;
        }

        return $out + array_fill_keys(array_keys(self::FIELDS), 0.0);
    }

    /** @return list<array{0: string, 1: string}> the panel's columns: ENERGY → "250 kcal", FAT → "12.0 g" … */
    public static function rows(array $per100): array
    {
        $rows = [];
        foreach (self::PANEL as $key => $label) {
            $rows[] = [$label, $key === 'kcal' ? number_format((float) ($per100[$key] ?? 0), 0) . ' kcal' : number_format((float) ($per100[$key] ?? 0), 1) . ' g'];
        }

        return $rows;
    }

    /** "Energy 250 kcal · Fat 12.0 g (saturates 4.1 g) · Carbs 30.0 g (sugars 2.0 g) · Protein 8.0 g · Salt 1.2 g". */
    public static function line(array $per100): string
    {
        $g = fn (string $k): string => number_format((float) ($per100[$k] ?? 0), 1) . ' g';

        return 'Energy ' . number_format((float) ($per100['kcal'] ?? 0), 0) . ' kcal · Fat ' . $g('fat') . ' (saturates ' . $g('sat_fat') . ') · Carbs ' . $g('carbs') . ' (sugars ' . $g('sugars') . ') · Protein ' . $g('protein') . ' · Salt ' . $g('salt');
    }
}
