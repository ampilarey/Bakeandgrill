<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\Item;
use App\Models\RecipeItem;
use App\Services\UnitConversionService;

/**
 * The ingredient line printed on a pack sticker.
 *
 * Owner, 2026-10-04: "add option to include manual ingredients if recipe is
 * not there in the item." Each item says where its line comes from:
 *
 *   auto    the recipe when the item has one, else the manual line
 *   recipe  the recipe (still the manual line when the recipe is empty)
 *   manual  the manual line, whatever the recipe says
 *
 * A recipe line lists the inventory items in it, heaviest first as food labels
 * do, without the ones the owner has unticked as not food (cling film, boxes).
 */
final class LabelIngredients
{
    public const SOURCES = ['auto', 'recipe', 'manual'];

    /** Grams (or millilitres) per unit for the units recipes are written in. */
    private const METRIC = [
        'g' => 1.0, 'gm' => 1.0, 'gram' => 1.0, 'grams' => 1.0, 'gr' => 1.0,
        'kg' => 1000.0, 'kgs' => 1000.0, 'kilo' => 1000.0,
        'mg' => 0.001,
        'ml' => 1.0, 'l' => 1000.0, 'ltr' => 1000.0, 'litre' => 1000.0, 'liter' => 1000.0,
    ];

    public function __construct(private readonly UnitConversionService $units) {}

    /**
     * @return array{en: string, dv: string, from: 'recipe'|'manual'|'none', recipe_en: string, recipe_dv: string}
     */
    public function forItem(Item $item): array
    {
        $source = in_array($item->label_ingredients_source, self::SOURCES, true) ? $item->label_ingredients_source : 'auto';
        $manualEn = trim((string) $item->label_ingredients);
        $manualDv = trim((string) $item->label_ingredients_dv);
        [$recipeEn, $recipeDv] = $source === 'manual' ? ['', ''] : $this->fromRecipe($item);

        if ($recipeEn !== '') {
            // A recipe has no Dhivehi names until the owner adds them; the
            // manual Dhivehi line stands in rather than printing nothing.
            return ['en' => $recipeEn, 'dv' => $recipeDv !== '' ? $recipeDv : $manualDv, 'from' => 'recipe', 'recipe_en' => $recipeEn, 'recipe_dv' => $recipeDv];
        }
        if ($manualEn !== '' || $manualDv !== '') {
            return ['en' => $manualEn, 'dv' => $manualDv, 'from' => 'manual', 'recipe_en' => $recipeEn, 'recipe_dv' => $recipeDv];
        }

        return ['en' => '', 'dv' => '', 'from' => 'none', 'recipe_en' => '', 'recipe_dv' => ''];
    }

    /** @return array{0: string, 1: string} */
    private function fromRecipe(Item $item): array
    {
        $recipe = $item->recipe()->with('recipeItems.inventoryItem')->first();
        if ($recipe === null) {
            return ['', ''];
        }

        $rows = $recipe->recipeItems->whereNull('variant_id');
        if ($rows->isEmpty()) {
            $variantId = $item->variants()->where('is_active', true)->orderBy('sort_order')->orderBy('id')->value('id');
            $rows = $variantId ? $recipe->recipeItems->where('variant_id', $variantId) : collect();
        }

        $byName = [];
        foreach ($rows as $row) {
            /** @var RecipeItem $row */
            $inv = $row->inventoryItem;
            if ($inv === null || $inv->is_label_ingredient === false) {
                continue;
            }
            $name = trim((string) $inv->name);
            if ($name === '') {
                continue;
            }
            $key = mb_strtolower($name);
            $byName[$key] ??= ['en' => $name, 'dv' => trim((string) ($inv->name_dv ?? '')), 'weight' => 0.0];
            $byName[$key]['weight'] += $this->weight((float) $row->quantity, (string) ($row->unit ?: $inv->unit));
        }

        uasort($byName, fn ($a, $b) => [$b['weight'], $a['en']] <=> [$a['weight'], $b['en']]);

        $en = implode(', ', array_column($byName, 'en'));
        $dvNames = array_filter(array_column($byName, 'dv'), fn ($s) => $s !== '');
        // Only a complete Dhivehi list is worth printing; a half one misleads.
        $dv = count($dvNames) === count($byName) ? implode('، ', $dvNames) : '';

        return [$this->sentence($en), $dv];
    }

    /** Grams where the unit allows; otherwise the raw quantity, for ordering only. */
    private function weight(float $qty, string $unit): float
    {
        $u = mb_strtolower(trim($unit));
        if (isset(self::METRIC[$u])) {
            return $qty * self::METRIC[$u];
        }
        $factor = $u !== '' ? $this->units->factor($u, 'g') : null;

        return $factor !== null ? $qty * $factor : $qty;
    }

    /** "Flour, salt, oil": first word capitalised, the rest as written. */
    private function sentence(string $line): string
    {
        if ($line === '') {
            return '';
        }
        $parts = explode(', ', $line);
        foreach ($parts as $i => $p) {
            $parts[$i] = $i === 0 ? mb_strtoupper(mb_substr($p, 0, 1)) . mb_substr($p, 1) : mb_strtolower($p);
        }

        return implode(', ', $parts);
    }
}
