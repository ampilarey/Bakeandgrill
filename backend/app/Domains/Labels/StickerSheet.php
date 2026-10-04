<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\Item;
use App\Models\KitchenProductionItem;
use App\Models\LabelType;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * A sheet (or a run of sheets) of pack stickers: which products, how many of
 * each, in which language, on which label stock, and what goes in the date,
 * batch and quantity boxes.
 *
 * The request travels in a signed URL (LabelLinks) from the Labels page, a
 * production batch or a wholesale delivery; normalise() is the one place its
 * rules live, for the API that issues the link and the page that draws it.
 */
final class StickerSheet
{
    public const MAX_STICKERS = 400;

    /** @var array<int, ?LabelType> */
    private array $asTypes = [];

    public function __construct(private readonly LabelIngredients $ingredients, private readonly LabelTypes $types) {}

    /** The label type a sheet is printed "as", when the request names one. */
    private function asType(array $req): ?LabelType
    {
        $id = (int) ($req['type'] ?? 0);
        if ($id <= 0) {
            return null;
        }

        return $this->asTypes[$id] ??= LabelType::query()->with('brand')->find($id);
    }

    /**
     * Check and tidy a request. Throws InvalidArgumentException with a message
     * fit to show the person printing.
     *
     * @param array<string, mixed> $in
     * @return array{items: list<array{id: int, copies: int}>, lang: 'en'|'dv', layout: string, w: ?float, h: ?float, fill: bool, mfg: ?string, exp: ?string, batch: string, qty: string, pi: ?int}
     */
    public static function normalise(array $in, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::today();
        $layout = (string) ($in['layout'] ?? 'a4-4');
        if (!isset(StickerLayouts::LAYOUTS[$layout])) {
            throw new InvalidArgumentException('Pick a label size.');
        }
        $w = isset($in['w']) && $in['w'] !== '' ? (float) $in['w'] : null;
        $h = isset($in['h']) && $in['h'] !== '' ? (float) $in['h'] : null;
        StickerLayouts::resolve($layout, $w, $h); // throws for a bad custom size

        $items = [];
        foreach (self::parseItems($in['items'] ?? []) as $row) {
            $items[] = $row;
        }
        if ($items === []) {
            throw new InvalidArgumentException('Pick at least one product.');
        }
        $total = array_sum(array_column($items, 'copies'));
        if ($total > self::MAX_STICKERS) {
            throw new InvalidArgumentException('That is ' . $total . ' stickers; print up to ' . self::MAX_STICKERS . ' at a time.');
        }

        $fill = filter_var($in['fill'] ?? false, FILTER_VALIDATE_BOOL);
        $mfg = self::date($in['mfg'] ?? null);
        $exp = self::date($in['exp'] ?? null);
        if ($fill) {
            $mfg ??= $today->toDateString();
            $m = CarbonImmutable::parse($mfg);
            if ($m->greaterThan($today->addDays(7))) {
                throw new InvalidArgumentException('The made-on date is more than a week away. Check the date.');
            }
            if ($exp !== null) {
                $e = CarbonImmutable::parse($exp);
                if ($e->lessThan($m)) {
                    throw new InvalidArgumentException('The expiry date is before the made-on date.');
                }
                if ($e->lessThan($today)) {
                    throw new InvalidArgumentException('The expiry date has already passed.');
                }
            }
        } else {
            $mfg = null;
            $exp = null;
        }

        $batch = mb_substr(trim((string) ($in['batch'] ?? '')), 0, 30);
        $qty = trim((string) ($in['qty'] ?? ''));
        if ($qty !== '' && (!ctype_digit($qty) || (int) $qty < 1 || (int) $qty > 9999)) {
            throw new InvalidArgumentException('The quantity is a number of pieces, 1 to 9999.');
        }

        return [
            'items' => $items,
            'lang' => ($in['lang'] ?? 'en') === 'dv' ? 'dv' : 'en',
            'layout' => $layout,
            'w' => $layout === 'single-custom' ? $w : null,
            'h' => $layout === 'single-custom' ? $h : null,
            'fill' => $fill,
            'mfg' => $mfg,
            'exp' => $exp,
            'batch' => $batch,
            'qty' => $qty,
            'pi' => isset($in['pi']) && $in['pi'] !== '' ? (int) $in['pi'] : null,
            // Print the whole sheet "as" a label type (v2 point 3); the items' own wording still wins.
            'type' => isset($in['type']) && $in['type'] !== '' ? (int) $in['type'] : null,
        ];
    }

    /**
     * Everything the sticker view needs.
     *
     * @param array<string, mixed> $req from normalise()
     * @return array<string, mixed>
     */
    public function build(array $req): array
    {
        $sheet = StickerLayouts::resolve($req['layout'], $req['w'], $req['h'], LabelSettings::precut());
        $dv = $req['lang'] === 'dv';
        $production = $req['pi'] ? KitchenProductionItem::query()->find($req['pi']) : null;

        /** @var Collection<int, Item> $items */
        $items = Item::query()->whereIn('id', array_column($req['items'], 'id'))->get()->keyBy('id');
        $common = $this->common();

        $stickers = [];
        $summary = [];
        foreach ($req['items'] as $row) {
            $item = $items->get($row['id']);
            if ($item === null) {
                continue;
            }
            $data = $this->stickerData($item, $req, $common, $production);
            $pieces = $sheet['design'] === 'full'
                ? StickerDesign::full($data, $dv)
                : StickerDesign::mini($data, $dv, $sheet['w'], $sheet['h']);
            for ($i = 0; $i < $row['copies']; $i++) {
                $stickers[] = $pieces;
            }
            $summary[] = ['id' => $item->id, 'name' => $item->name, 'copies' => $row['copies'], 'exp' => $data['exp_iso'], 'mfg' => $data['mfg_iso']];
        }

        return [
            'sheet' => $sheet,
            'pages' => array_chunk($stickers, $sheet['per_page']),
            'dv' => $dv,
            'summary' => $summary,
            'stickerCount' => count($stickers),
        ];
    }

    /**
     * What a request will print, without drawing it: per product the copies
     * and the dates that will go on it, and the sheet count.
     *
     * @param array<string, mixed> $req from normalise()
     * @return array{layout: string, label: string, design: string, stickers: int, pages: int, per_page: int, products: list<array{id: int, name: string, copies: int, mfg: ?string, exp: ?string, shelf_life_days: ?int, ingredients_from: string}>}
     */
    public function summary(array $req): array
    {
        $sheet = StickerLayouts::resolve($req['layout'], $req['w'], $req['h'], LabelSettings::precut());
        $production = $req['pi'] ? KitchenProductionItem::query()->find($req['pi']) : null;
        $items = Item::query()->whereIn('id', array_column($req['items'], 'id'))->get()->keyBy('id');
        $products = [];
        $total = 0;
        foreach ($req['items'] as $row) {
            $item = $items->get($row['id']);
            if ($item === null) {
                continue;
            }
            [$mfg, $exp] = $this->dates($item, $req, $production);
            $products[] = [
                'id' => $item->id,
                'name' => $item->name,
                'copies' => $row['copies'],
                'mfg' => $mfg,
                'exp' => $exp,
                'shelf_life_days' => $item->label_shelf_life_days,
                'ingredients_from' => $this->ingredients->forItem($item)['from'],
            ];
            $total += $row['copies'];
        }

        return [
            'layout' => $sheet['key'],
            'label' => $sheet['label'],
            'design' => $sheet['design'],
            'stickers' => $total,
            'pages' => (int) ceil($total / max(1, $sheet['per_page'])),
            'per_page' => $sheet['per_page'],
            'products' => $products,
        ];
    }

    /**
     * Made-on and expiry for one product: the expiry asked for, else the
     * production batch's own, else made-on plus the product's shelf life.
     *
     * @param array<string, mixed> $req
     * @return array{0: ?string, 1: ?string}
     */
    public function dates(Item $item, array $req, ?KitchenProductionItem $production = null): array
    {
        if (!$req['fill']) {
            return [null, null];
        }
        $mfg = $req['mfg'];
        if ($req['exp']) {
            return [$mfg, $req['exp']];
        }
        if ($production && $production->expires_at && (int) $production->item_id === (int) $item->id) {
            return [$mfg, CarbonImmutable::parse($production->expires_at)->toDateString()];
        }
        $life = $this->types->forItem($item, $this->asType($req))['shelf_life_days'];
        if ($life) {
            return [$mfg, CarbonImmutable::parse($mfg)->addDays((int) $life)->toDateString()];
        }

        return [$mfg, null];
    }

    /**
     * One product's sticker content.
     *
     * @param array<string, mixed> $req
     * @param array<string, mixed> $common
     * @return array<string, mixed>
     */
    public function stickerData(Item $item, array $req, array $common, ?KitchenProductionItem $production = null): array
    {
        $lines = $this->ingredients->forItem($item);
        $title = LabelImage::fromMedia($item->label_title_media_id, 900);
        $photo = LabelImage::fromMedia($item->label_photo_media_id, 900) ?? LabelImage::fromPublicUrl($item->cutout_url, 900);

        [$mfg, $exp] = $this->dates($item, $req, $production);
        $batch = $req['batch'];
        if ($batch === '' && $production && (int) $production->item_id === (int) $item->id) {
            $batch = (string) ($production->batch_code ?? '');
        }
        $qty = $req['qty'] !== '' ? $req['qty'] : ($item->label_pack_qty ? (string) $item->label_pack_qty : '');
        $w = $this->types->forItem($item, $this->asType($req));

        return $common + [
            'name' => (string) $item->name,
            'name_dv' => trim((string) $item->name_dv),
            'title_img' => $title,
            'title_ratio' => LabelImage::ratio($title),
            'photo' => $photo,
            'photo_ratio' => LabelImage::ratio($photo),
            'ingredients_en' => $lines['en'],
            'ingredients_dv' => $lines['dv'],
            'mfg' => $mfg ? CarbonImmutable::parse($mfg)->format('d / m / Y') : null,
            'exp' => $exp ? CarbonImmutable::parse($exp)->format('d / m / Y') : null,
            'mfg_iso' => $mfg,
            'exp_iso' => $exp,
            'batch' => $batch,
            'qty' => $qty,
            'unit' => trim((string) $item->label_pack_unit) !== '' ? mb_strtoupper(trim((string) $item->label_pack_unit)) : 'PCS',
            // Wording from the item, its label type, or the per-storage defaults (LabelTypes).
            'header_line' => $w['heading'],
            'header_line_dv' => $w['heading_dv'],
            'storage_en' => $w['storage_en'],
            'storage_dv' => $w['storage_dv'],
            'note' => $w['note'],
            'note_dv' => $w['note_dv'],
            'how_to_use' => $w['how_to_use'],
            'how_to_use_dv' => $w['how_to_use_dv'],
            'use_within' => $w['use_within'],
            'use_within_dv' => $w['use_within_dv'],
            'mfg_label' => $w['mfg_label'],
            'exp_label' => $w['exp_label'],
            'show_qr' => $w['show_qr'],
            'brand' => $w['brand'],
            'type_name' => $w['type_name'],
        ];
    }

    /** @return array<string, mixed> What every sticker on the sheet shares. */
    public function common(): array
    {
        $logo = LabelImage::fromPublic('brand/logo-light.png', 500);
        $mark = LabelImage::fromPublic('brand/logo-mark.png', 300);

        return [
            'logo' => $logo,
            'logo_ratio' => LabelImage::ratio($logo),
            'mark' => $mark,
            'mark_ratio' => LabelImage::ratio($mark),
            'contact' => LabelSettings::contact(),
            'brand_line_dv' => LabelSettings::get('label_brand_line_dv'),
            'ways' => LabelSettings::get('label_contact_ways'),
            'ways_dv' => LabelSettings::get('label_contact_ways_dv'),
            'address_dv' => LabelSettings::get('label_address_dv'),
            'landmark_dv' => LabelSettings::get('label_landmark_dv'),
        ];
    }

    /**
     * "12:8,15:4" or [{id, copies}] → [{id, copies}], merged per item.
     *
     * @return list<array{id: int, copies: int}>
     */
    public static function parseItems(mixed $raw): array
    {
        $rows = [];
        if (is_string($raw)) {
            foreach (array_filter(explode(',', $raw)) as $part) {
                [$id, $copies] = array_pad(explode(':', $part, 2), 2, '0');
                $rows[] = ['id' => (int) $id, 'copies' => (int) $copies];
            }
        } elseif (is_array($raw)) {
            foreach ($raw as $row) {
                if (is_array($row)) {
                    $rows[] = ['id' => (int) ($row['id'] ?? 0), 'copies' => (int) ($row['copies'] ?? 0)];
                }
            }
        }
        $merged = [];
        foreach ($rows as $row) {
            if ($row['id'] > 0 && $row['copies'] > 0) {
                $merged[$row['id']] = ($merged[$row['id']] ?? 0) + min($row['copies'], self::MAX_STICKERS);
            }
        }

        return array_map(fn ($id, $copies) => ['id' => (int) $id, 'copies' => $copies], array_keys($merged), $merged);
    }

    /**
     * The same, keeping a zero count (a box label line whose quantity is
     * written in by hand).
     *
     * @return list<array{id: int, copies: int}>
     */
    public static function parseItemsAllowZero(mixed $raw): array
    {
        $rows = [];
        if (is_string($raw)) {
            foreach (array_filter(explode(',', $raw)) as $part) {
                [$id, $n] = array_pad(explode(':', $part, 2), 2, '0');
                $rows[] = ['id' => (int) $id, 'copies' => max(0, (int) $n)];
            }
        } elseif (is_array($raw)) {
            foreach ($raw as $row) {
                if (is_array($row)) {
                    $rows[] = ['id' => (int) ($row['id'] ?? 0), 'copies' => max(0, (int) ($row['qty'] ?? $row['copies'] ?? 0))];
                }
            }
        }

        return array_values(array_filter($rows, fn ($r) => $r['id'] > 0));
    }

    /** @param list<array{id: int, copies: int}> $items */
    public static function itemsParam(array $items): string
    {
        return implode(',', array_map(fn ($r) => $r['id'] . ':' . $r['copies'], $items));
    }

    private static function date(mixed $value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            throw new InvalidArgumentException('Dates are written as YYYY-MM-DD.');
        }
        try {
            return CarbonImmutable::createFromFormat('!Y-m-d', $value)->toDateString();
        } catch (\Throwable) {
            throw new InvalidArgumentException('That is not a real date.');
        }
    }
}
