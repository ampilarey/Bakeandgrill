<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Labels\AllergenIcons;
use App\Domains\Labels\BatchLink;
use App\Domains\Labels\LabelSettings;
use App\Domains\Labels\LabelTypes;
use App\Domains\Labels\Reprint;
use App\Domains\Labels\StickerSheet;
use App\Models\Item;
use App\Models\LabelPrint;
use App\Support\ComplaintBoxLink;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Response;

/**
 * The pack's public page (2026-10-12): the batch QR on a sticker opens it.
 * What the sticker says, readable on a phone: dates with whether the pack
 * is still good, batch, pack size, storage, ingredients with the allergens,
 * how to use it, and a way to tell us about a problem with that very pack.
 * Nothing about who printed it or how many.
 */
class LabelBatchPageController extends Controller
{
    public function __construct(private readonly StickerSheet $stickers, private readonly LabelTypes $types) {}

    public function show(string $code): View|Response
    {
        $code = mb_strtoupper(trim($code));
        $print = BatchLink::valid($code) && $code !== BatchLink::PREVIEW
            ? LabelPrint::query()->with(['item.labelType.brand', 'customLabel.labelType.brand', 'customLabel.brand'])->where('code', $code)->first()
            : null;
        $site = (string) content('site_name', 'Bake & Grill');
        $shared = [
            'code' => $code,
            'siteName' => $site,
            'complainUrl' => ComplaintBoxLink::url('label', 'Pack ' . $code),
            'menuUrl' => url('/menu'),
        ];
        if ($print === null) {
            return response()->view('labels.batch', $shared + ['pack' => null], 404);
        }
        if ($print->kind === 'box_label') {
            return view('labels.box-page', $shared + ['box' => $this->box($print), 'complainUrl' => ComplaintBoxLink::url('label', 'Box ' . $code)]);
        }

        $product = $print->item ?? $print->customLabel;
        $today = CarbonImmutable::today();
        $exp = $print->exp_date?->toDateString();
        $left = $exp !== null ? (int) $today->diffInDays(CarbonImmutable::parse($exp), false) : null;
        $pack = [
            'name' => (string) ($product?->name ?? 'A pack from ' . $site),
            'name_dv' => trim((string) ($product?->name_dv ?? '')),
            'gone' => $product === null,
            'mfg' => LabelSettings::formatDate($print->mfg_date?->toDateString()),
            'exp' => LabelSettings::formatDate($exp),
            'days_left' => $left,
            'status' => Reprint::status($left),
            'batch' => (string) ($print->batch_code ?? ''),
            'qty' => $print->pack_qty,
            'unit' => $product !== null && trim((string) $product->label_pack_unit) !== '' ? mb_strtoupper(trim((string) $product->label_pack_unit)) : 'PCS',
            'printed' => LabelSettings::formatDate($print->created_at?->toDateString()),
        ];
        if ($product !== null) {
            $w = $this->types->forItem($product);
            $lines = $this->stickers->ingredientLines($product);
            $allergens = StickerSheet::allergens($product);
            $spicy = $product instanceof Item && in_array((string) $product->spice_level, AllergenIcons::SPICY_LEVELS, true);
            $pack += [
                'brand' => (string) ($w['brand']['name'] ?? $site),
                'heading' => $w['heading'],
                'heading_dv' => $w['heading_dv'],
                'storage_en' => $w['storage_en'],
                'storage_dv' => $w['storage_dv'],
                'use_within' => $w['use_within'],
                'how_to_use' => $w['how_to_use'],
                'how_to_use_dv' => $w['how_to_use_dv'],
                'note' => $w['note'],
                'ingredients_en' => $lines['en'],
                'ingredients_dv' => $lines['dv'],
                'allergens' => $allergens,
                'icons' => array_map(fn (string $key) => ['key' => $key, 'caption' => AllergenIcons::caption($key), 'svg' => AllergenIcons::svg($key, 44)], AllergenIcons::keys($allergens, $spicy)),
                'net_weight' => trim((string) $product->label_net_weight),
            ];
        }

        return view('labels.batch', $shared + ['pack' => $pack]);
    }

    /**
     * A box label's page (owner, 2026-11-14: a code for every batch, "including box labels"): who the box is for,
     * when it travels and what it holds, as the label printed it. The contact's name and number stay off: the
     * page opens for anyone who scans the box.
     *
     * @return array<string, mixed>
     */
    private function box(LabelPrint $print): array
    {
        $fields = is_array($print->details['fields'] ?? null) ? $print->details['fields'] : [];
        $rows = is_array($print->details['lines'] ?? null) ? $print->details['lines'] : [];
        $names = Item::query()->whereIn('id', array_column($rows, 'id'))->pluck('name', 'id');
        $lines = [];
        foreach ($rows as $row) {
            $name = (string) ($names[$row['id'] ?? 0] ?? '');
            if ($name !== '') {
                $lines[] = ['name' => $name, 'article' => (string) ($row['article'] ?? ''), 'qty' => (int) ($row['qty'] ?? 0)];
            }
        }
        $get = fn (string $key): string => trim((string) ($fields[$key] ?? ''));

        return [
            'customer' => $get('customer'),
            'boat' => trim($get('boat') . ' ' . $get('boat2')),
            'pickup' => trim($get('pickup') . ' ' . $get('pickup2')),
            'when' => trim($get('when') . ' ' . $get('when2')),
            'po' => $get('po'),
            'box' => $get('box'),
            'of' => $get('of'),
            'storage' => LabelSettings::boxStrip(LabelSettings::storage($get('storage'))),
            'lines' => $lines,
            'total' => array_sum(array_column($lines, 'qty')),
            'printed' => LabelSettings::formatDate($print->created_at?->toDateString()),
        ];
    }
}
