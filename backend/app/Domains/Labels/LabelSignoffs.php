<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use App\Models\LabelSignoff;

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

    public function __construct(private readonly StickerSheet $stickers, private readonly LabelTypes $types, private readonly Nutrition $nutrition) {}

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

    public static function latest(string $kind, int $id): ?LabelSignoff
    {
        return LabelSignoff::query()->with('signer:id,name')->where('kind', $kind)->where('product_id', $id)->orderByDesc('id')->first();
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
        $last = self::latest(self::kindOf($product), (int) $product->id);
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
     * @param array<string, Item|CustomLabel> $products keyed as StickerSheet::products()
     * @return array{ids: array<string, ?int>, refused: list<string>}
     */
    public function forPrint(array $products): array
    {
        $ids = [];
        $refused = [];
        foreach ($products as $key => $product) {
            if (!$product instanceof Item && !$product instanceof CustomLabel) {
                continue;
            }
            $last = self::latest(self::kindOf($product), (int) $product->id);
            $ok = $last !== null && $last->hash === self::hash($this->lines($product));
            $ids[$key] = $ok ? $last->id : null;
            if (!$ok && self::locked()) {
                $refused[] = (string) $product->name;
            }
        }

        return ['ids' => $ids, 'refused' => $refused];
    }
}
