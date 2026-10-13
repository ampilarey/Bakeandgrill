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
            ? LabelPrint::query()->stickers()->with(['item.labelType.brand', 'customLabel.labelType.brand', 'customLabel.brand'])->where('code', $code)->first()
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
}
