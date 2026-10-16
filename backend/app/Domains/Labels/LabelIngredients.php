<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use App\Models\LabelGlossaryEntry;
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
 *
 * The Dhivehi line (2026-10-12) comes from the inventory item's Dhivehi
 * name, else the ingredient glossary (LabelGlossaryEntry), for a recipe and
 * for a typed English list alike; only a complete Dhivehi list prints, since
 * a half one misleads. `dv_from` says which it was.
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
     * @return array{en: string, dv: string, from: 'recipe'|'manual'|'none', dv_from: 'typed'|'inventory'|'glossary'|'', recipe_en: string, recipe_dv: string}
     */
    public function forItem(Item $item): array
    {
        $source = in_array($item->label_ingredients_source, self::SOURCES, true) ? $item->label_ingredients_source : 'auto';
        $manualEn = trim((string) $item->label_ingredients);
        $manualDv = trim((string) $item->label_ingredients_dv);
        [$recipeEn, $recipeDv, $recipeDvFrom] = $source === 'manual' ? ['', '', ''] : $this->fromRecipe($item);

        if ($recipeEn !== '') {
            // A recipe with no Dhivehi name on an item and none in the
            // glossary: the manual Dhivehi line stands in rather than nothing.
            $dv = $recipeDv;
            $dvFrom = $recipeDvFrom;
            if ($dv === '' && $manualDv !== '') {
                $dv = $manualDv;
                $dvFrom = 'typed';
            }

            return ['en' => $recipeEn, 'dv' => $dv, 'from' => 'recipe', 'dv_from' => $dv !== '' ? $dvFrom : '', 'recipe_en' => $recipeEn, 'recipe_dv' => $recipeDv];
        }
        if ($manualEn !== '' || $manualDv !== '') {
            $dv = $manualDv;
            $dvFrom = $manualDv !== '' ? 'typed' : '';
            if ($dv === '' && $manualEn !== '') {
                $dv = self::translate($manualEn)['dv'];
                $dvFrom = $dv !== '' ? 'glossary' : '';
            }

            return ['en' => $manualEn, 'dv' => $dv, 'from' => 'manual', 'dv_from' => $dvFrom, 'recipe_en' => $recipeEn, 'recipe_dv' => $recipeDv];
        }

        return ['en' => '', 'dv' => '', 'from' => 'none', 'dv_from' => '', 'recipe_en' => '', 'recipe_dv' => ''];
    }

    /**
     * A typed English list through the glossary: "Flour, salt, eggs" →
     * "ފުށް، ލޮނު، ބިސް". Every part must be known, or the Dhivehi stays empty
     * and `missing` says which words the glossary needs.
     *
     * @return array{dv: string, missing: list<string>, parts: list<string>}
     */
    public static function translate(string $en): array
    {
        $parts = self::parts($en);
        $map = LabelGlossaryEntry::map();
        $dv = [];
        $missing = [];
        foreach ($parts as $part) {
            $found = LabelGlossaryEntry::lookup($part, $map);
            if ($found === null) {
                $missing[] = $part;
            } else {
                $dv[] = $found;
            }
        }

        return ['dv' => $missing === [] && $dv !== [] ? implode('، ', $dv) : '', 'missing' => $missing, 'parts' => $parts];
    }

    /**
     * "Flour, salt and oil, egg (free range)" → ["flour", "salt", "oil", "egg"]:
     * split on commas and "and", lower-case, a bracketed aside dropped.
     *
     * @return list<string>
     */
    public static function parts(string $en): array
    {
        $out = [];
        foreach (preg_split('/\s*[,،;]\s*|\s+and\s+/u', $en) ?: [] as $part) {
            $part = LabelGlossaryEntry::key((string) preg_replace('/\s*\([^)]*\)/u', '', (string) $part));
            if ($part !== '' && !in_array($part, $out, true)) {
                $out[] = $part;
            }
        }

        return $out;
    }

    /**
     * Ingredient words printed on labels that have no Dhivehi yet, with the
     * products using them: what the glossary card asks the owner to fill in.
     *
     * @return list<array{word: string, products: list<string>}>
     */
    public function missingWords(): array
    {
        $map = LabelGlossaryEntry::map();
        $seen = [];
        $note = function (array $words, string $product) use (&$seen, $map): void {
            foreach ($words as $w) {
                if (LabelGlossaryEntry::lookup($w, $map) !== null) {
                    continue;
                }
                $seen[$w] ??= [];
                if (!in_array($product, $seen[$w], true)) {
                    $seen[$w][] = $product;
                }
            }
        };
        foreach (Item::query()->where('label_enabled', true)->where('is_active', true)->orderBy('name')->get() as $item) {
            $lines = $this->forItem($item);
            if ($lines['dv'] !== '' || $lines['en'] === '') {
                continue;
            }
            $words = $lines['from'] === 'recipe'
                ? array_map(fn (array $r) => LabelGlossaryEntry::key($r['en']), array_filter($this->recipeRows($item), fn (array $r) => $r['dv'] === ''))
                : self::parts($lines['en']);
            $note(array_values($words), (string) $item->name);
        }
        foreach (CustomLabel::query()->orderBy('name')->get() as $custom) {
            $en = trim((string) $custom->label_ingredients);
            if ($en === '' || trim((string) $custom->label_ingredients_dv) !== '') {
                continue;
            }
            $note(self::parts($en), (string) $custom->name);
        }
        $out = [];
        foreach ($seen as $word => $products) {
            $out[] = ['word' => (string) $word, 'products' => $products];
        }
        usort($out, fn (array $a, array $b) => [count($b['products']), $a['word']] <=> [count($a['products']), $b['word']]);

        return $out;
    }

    /**
     * The recipe's food ingredients with their weight in grams (null when
     * the unit cannot be turned into grams), for the nutrition panel.
     *
     * @return list<array{inventory_id: int, en: string, dv: string, grams: ?float}>
     */
    /** The size a sticker is for, set by StickerSheet::forSize() on a copy of the item. */
    public static function sizeOf(Item $item): ?\App\Models\Variant
    {
        return $item->relationLoaded('labelSize') ? $item->getRelation('labelSize') : null;
    }

    /**
     * Where a sized sticker's recipe came from: 'own' when the size has rows
     * of its own, 'shared' when it fell back to the item's unsized rows, null
     * when no size is picked or there is no recipe.
     */
    public function sizeRecipe(Item $item): ?string
    {
        $size = self::sizeOf($item);
        if ($size === null) {
            return null;
        }
        $recipe = $item->recipe()->with('recipeItems')->first();
        if ($recipe === null || $recipe->recipeItems->isEmpty()) {
            return null;
        }

        return $recipe->recipeItems->where('variant_id', $size->id)->isNotEmpty() ? 'own' : 'shared';
    }

    public function recipeIngredients(Item $item): array
    {
        return array_map(fn (array $r) => ['inventory_id' => $r['inventory_id'], 'en' => $r['en'], 'dv' => $r['dv'], 'grams' => $r['grams']], $this->recipeRows($item));
    }

    /** @return array{0: string, 1: string, 2: string} the English line, the Dhivehi line, where the Dhivehi came from */
    private function fromRecipe(Item $item): array
    {
        $rows = $this->recipeRows($item);
        if ($rows === []) {
            return ['', '', ''];
        }
        $map = LabelGlossaryEntry::map();
        $glossary = false;
        foreach ($rows as $i => $row) {
            if ($row['dv'] === '') {
                $found = LabelGlossaryEntry::lookup($row['en'], $map);
                if ($found !== null) {
                    $rows[$i]['dv'] = $found;
                    $glossary = true;
                }
            }
        }
        $en = implode(', ', array_column($rows, 'en'));
        $dvNames = array_filter(array_column($rows, 'dv'), fn ($s) => $s !== '');
        // Only a complete Dhivehi list is worth printing; a half one misleads.
        $complete = count($dvNames) === count($rows);

        return [$this->sentence($en), $complete ? implode('، ', $dvNames) : '', $complete ? ($glossary ? 'glossary' : 'inventory') : ''];
    }

    /**
     * The recipe's food ingredients, heaviest first, with the Dhivehi name
     * the inventory item carries (empty when it has none).
     *
     * @return list<array{inventory_id: int, en: string, dv: string, weight: float, grams: ?float}>
     */
    private function recipeRows(Item $item): array
    {
        $recipe = $item->recipe()->with('recipeItems.inventoryItem')->first();
        if ($recipe === null) {
            return [];
        }

        // The size this sticker is for (label audit, 2026-10-16): its own
        // rows, else the unsized ones (sizeRecipe() says which).
        $size = self::sizeOf($item);
        if ($size !== null) {
            $own = $recipe->recipeItems->where('variant_id', $size->id);
            $rows = $own->isNotEmpty() ? $own : $recipe->recipeItems->whereNull('variant_id');
        } else {
            $rows = $recipe->recipeItems->whereNull('variant_id');
        }
        if ($rows->isEmpty() && $size === null) {
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
            $byName[$key] ??= ['inventory_id' => (int) $inv->id, 'en' => $name, 'dv' => trim((string) ($inv->name_dv ?? '')), 'weight' => 0.0, 'grams' => 0.0];
            $grams = $this->grams((float) $row->quantity, (string) ($row->unit ?: $inv->unit));
            // Grams for the order and the nutrition panel; a unit that is not
            // a weight keeps the raw quantity for the order and no grams.
            $byName[$key]['weight'] += $grams ?? (float) $row->quantity;
            $byName[$key]['grams'] = $grams === null || $byName[$key]['grams'] === null ? null : $byName[$key]['grams'] + $grams;
        }

        uasort($byName, fn ($a, $b) => [$b['weight'], $a['en']] <=> [$a['weight'], $b['en']]);

        return array_values($byName);
    }

    /** Grams (or millilitres) where the unit allows, else null. */
    private function grams(float $qty, string $unit): ?float
    {
        $u = mb_strtolower(trim($unit));
        if (isset(self::METRIC[$u])) {
            return $qty * self::METRIC[$u];
        }
        $factor = $u !== '' ? $this->units->factor($u, 'g') : null;

        return $factor !== null ? $qty * $factor : null;
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
