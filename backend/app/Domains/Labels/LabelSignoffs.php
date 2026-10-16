<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use App\Models\LabelSignoff;
use App\Models\Variant;

/**
 * The wording lock (round 17 of the usability work, owner, 2026-10-13: "a
 * wording lock with sign-off for legal lines, plus the print log already
 * kept"). A product's legal lines are what a sticker says that the law
 * cares about: the name, ingredients in both languages, the allergens, the
 * storage line in both languages, the use-within line, the net weight and
 * the nutrition. Someone with Manage label settings signs them off as they
 * stand; any change to them afterwards shows as changed since the sign-off.
 * With the lock on (Labels → Settings, `label_wording_lock`) a product prints
 * only while its lines are the ones signed off; previews always draw. Every
 * print records the sign-off it printed under, beside the print log.
 */
final class LabelSignoffs
{
    public const LOCK_KEY = 'label_wording_lock';

    /** The legal lines in the order the sign-off sheet shows them, with their names. */
    public const LINES = [
        'name' => 'Name',
        'size' => 'Size',
        'name_dv' => 'Name (Dhivehi)',
        'ingredients' => 'Ingredients',
        'ingredients_dv' => 'Ingredients (Dhivehi)',
        'allergens' => 'Allergens',
        'storage' => 'Storage line',
        'storage_dv' => 'Storage line (Dhivehi)',
        'use_within' => 'After opening',
        'net_weight' => 'Net weight',
        'nutrition' => 'Nutrition',
    ];

    public function __construct(private readonly StickerSheet $stickers, private readonly LabelTypes $types, private readonly Nutrition $nutrition, private readonly LabelIngredients $ingredients) {}

    /**
     * The size a product is signed off as (label audit, 2026-10-16): a sized
     * copy (StickerSheet::forSize) whose lines differ from the item's, as a
     * size with a recipe of its own does, is signed off apart; a size that
     * prints the item's very lines stands under the item's sign-off.
     */
    public function sizeOf(Item|CustomLabel $product): ?Variant
    {
        if (!$product instanceof Item) {
            return null;
        }
        $size = LabelIngredients::sizeOf($product);
        if ($size === null) {
            return null;
        }
        if ($this->ingredients->sizeRecipe($product) === 'own') {
            return $size;
        }
        $plain = clone $product;
        $plain->unsetRelation('labelSize');

        return $this->baseLines($product) === $this->baseLines($plain) ? null : $size;
    }

    /** "Juice (Large)" for a size signed off apart, else the name. */
    public function nameOf(Item|CustomLabel $product): string
    {
        $size = $this->sizeOf($product);

        return (string) $product->name . ($size !== null ? ' (' . $size->name . ')' : '');
    }

    public static function locked(): bool
    {
        return LabelSettings::on(self::LOCK_KEY);
    }

    public static function kindOf(Item|CustomLabel $product): string
    {
        return $product instanceof CustomLabel ? 'custom' : 'item';
    }

    /**
     * The product's legal lines as a sticker prints them now.
     *
     * @return array<string, string>
     */
    public function lines(Item|CustomLabel $product): array
    {
        $lines = $this->baseLines($product);
        $size = $this->sizeOf($product);
        if ($size === null) {
            return $lines;
        }

        // A size signed off apart signs its name with its lines; the item's own lines carry no size, so their sign-offs stand.
        return array_slice($lines, 0, 1, true) + ['size' => trim((string) $size->name)] + array_slice($lines, 1, null, true);
    }

    /**
     * The legal lines without the size's name.
     *
     * @return array<string, string>
     */
    private function baseLines(Item|CustomLabel $product): array
    {
        $w = $this->types->forItem($product);
        $ing = $this->stickers->ingredientLines($product);
        $n = $this->nutrition->forSticker($product);
        $out = [
            'name' => trim((string) $product->name),
            'name_dv' => trim((string) ($product->name_dv ?? '')),
            'ingredients' => trim((string) $ing['en']),
            'ingredients_dv' => trim((string) $ing['dv']),
            'allergens' => implode(', ', StickerSheet::allergens($product)),
            'storage' => trim((string) $w['storage_en']),
            'storage_dv' => trim((string) $w['storage_dv']),
            'use_within' => trim((string) $w['use_within']),
            'net_weight' => trim((string) ($product->label_net_weight ?? '')),
            'nutrition' => $n === null ? '' : ($n['rows'] !== [] ? 'Per 100 ' . $n['per'] . ': ' . $n['line'] : $n['line']),
        ];
        // The per-serving column prints too, so its size and values are signed
        // with the rest (label audit, 2026-10-16: a new serving size changed
        // the sticker without the wording showing Changed). Added only when a
        // serving is set, so labels without one keep their sign-off.
        if ($n !== null && isset($n['serving'], $n['serv_line'])) {
            $out['nutrition'] .= ' · Per serving (' . Nutrition::servingWords((float) $n['serving'], $n['per']) . '): ' . $n['serv_line'];
        }

        return $out;
    }

    /** @param array<string, string> $lines */
    public static function hash(array $lines): string
    {
        return hash('sha256', (string) json_encode($lines, JSON_UNESCAPED_UNICODE));
    }

    public static function latest(string $kind, int $id, ?int $sizeId = null): ?LabelSignoff
    {
        $q = LabelSignoff::query()->with('signer:id,name')->where('kind', $kind)->where('product_id', $id);
        $sizeId === null ? $q->whereNull('size_id') : $q->where('size_id', $sizeId);

        return $q->orderByDesc('id')->first();
    }

    /**
     * Where a product stands: never signed off, signed off as it is, or
     * changed since; with the lines now and, when changed, which ones.
     *
     * @return array<string, mixed>
     */
    public function status(Item|CustomLabel $product): array
    {
        $lines = $this->lines($product);
        $hash = self::hash($lines);
        $size = $this->sizeOf($product);
        $last = self::latest(self::kindOf($product), (int) $product->id, $size?->id);
        $state = $last === null ? 'none' : ($last->hash === $hash ? 'signed' : 'changed');
        $changed = [];
        if ($state === 'changed') {
            foreach ($lines as $k => $v) {
                if ((string) ($last->lines[$k] ?? '') !== $v) {
                    $changed[] = $k;
                }
            }
        }

        return [
            'kind' => self::kindOf($product),
            'id' => (int) $product->id,
            'name' => (string) $product->name,
            'size' => $size !== null ? ['id' => (int) $size->id, 'name' => (string) $size->name] : null,
            'state' => $state,
            'lines' => $lines,
            'changed' => $changed,
            'signed' => $last === null ? null : [
                'id' => $last->id,
                'by' => $last->signer?->name,
                'at' => $last->created_at?->toIso8601String(),
                'note' => $last->note,
                'lines' => $last->lines,
            ],
            'locked' => self::locked(),
            'printable' => !self::locked() || $state === 'signed',
        ];
    }

    /** Sign off a product's lines as they stand now. */
    public function signOff(Item|CustomLabel $product, ?int $userId, ?string $note): LabelSignoff
    {
        $lines = $this->lines($product);

        return LabelSignoff::query()->create([
            'kind' => self::kindOf($product),
            'product_id' => (int) $product->id,
            'size_id' => $this->sizeOf($product)?->id,
            'hash' => self::hash($lines),
            'lines' => $lines,
            'note' => $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 200) : null,
            'signed_by' => $userId,
        ]);
    }

    /**
     * The sign-off each product of a print prints under, or the reason the
     * lock refuses it. Keyed by the summary's product key.
     *
     * @param array<string, Item|CustomLabel> $products keyed as StickerSheet::printProducts() (the product key and size)
     * @return array{ids: array<string, ?int>, refused: list<string>, refused_products: list<array{key: string, kind: string, id: int, name: string}>}
     */
    public function forPrint(array $products): array
    {
        $ids = [];
        $refused = [];
        $refusedProducts = [];
        foreach ($products as $key => $product) {
            if (!$product instanceof Item && !$product instanceof CustomLabel) {
                continue;
            }
            $size = $this->sizeOf($product);
            $last = self::latest(self::kindOf($product), (int) $product->id, $size?->id);
            $ok = $last !== null && $last->hash === self::hash($this->lines($product));
            $ids[$key] = $ok ? $last->id : null;
            if (!$ok && self::locked()) {
                $refused[] = $this->nameOf($product);
                $refusedProducts[] = ['key' => (string) $key, 'kind' => self::kindOf($product), 'id' => (int) $product->id, 'name' => $this->nameOf($product), 'size' => $size?->id];
            }
        }

        return ['ids' => $ids, 'refused' => $refused, 'refused_products' => $refusedProducts];
    }

    /**
     * What a refused print says, the same words before Prepare (a preview,
     * label audit Batch B) and on the refusal itself.
     *
     * @param list<string> $names
     */
    public static function refusalMessage(array $names): string
    {
        return 'The wording is locked: ' . implode(', ', $names) . (count($names) === 1 ? ' has' : ' have') . ' legal lines not signed off as they stand. Sign them off on the label first, or turn the lock off under Labels → Settings.';
    }
}
