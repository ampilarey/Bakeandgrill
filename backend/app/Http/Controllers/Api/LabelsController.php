<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Labels\BoxLabel;
use App\Domains\Labels\LabelIngredients;
use App\Domains\Labels\LabelSettings;
use App\Domains\Labels\StickerLayouts;
use App\Domains\Labels\StickerSheet;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Labels\LabelSheetController;
use App\Models\Item;
use App\Models\KitchenProductionItem;
use App\Models\LabelPrint;
use App\Models\Media;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use InvalidArgumentException;

/**
 * Label Hub (owner, 2026-10-04; docs/LABEL_HUB_PLAN.md): what each item prints
 * on a pack sticker, and the item settings behind it.
 */
class LabelsController extends Controller
{
    public function __construct(
        private readonly LabelIngredients $ingredients,
        private readonly StickerSheet $stickers,
    ) {}

    /** Label stock the hub offers, for its size picker. */
    public function layouts(): JsonResponse
    {
        return response()->json(['data' => collect(StickerLayouts::LAYOUTS)->map(fn ($l, $key) => [
            'key' => $key,
            'label' => $l['label'],
            'hint' => $l['hint'],
            'per_page' => $l['cols'] * $l['rows'],
            'w' => $l['w'],
            'h' => $l['h'],
            'compact' => $key !== 'single-custom' && min($l['w'] / StickerLayouts::DESIGN_W, $l['h'] / StickerLayouts::DESIGN_H) < StickerLayouts::FULL_MIN_SCALE,
        ])->values()]);
    }

    /**
     * Signed links to a sheet of pack stickers, after checking the request
     * (dates, sizes, counts) and writing the print log.
     */
    public function stickersUrl(Request $request): JsonResponse
    {
        $request->validate([
            'items' => 'required|array|min:1|max:60',
            'items.*.id' => 'required|integer|exists:items,id',
            'items.*.copies' => 'required|integer|min:1|max:' . StickerSheet::MAX_STICKERS,
            'lang' => 'sometimes|in:en,dv',
            'layout' => ['sometimes', Rule::in(array_keys(StickerLayouts::LAYOUTS))],
            'w' => 'nullable|numeric',
            'h' => 'nullable|numeric',
            'fill' => 'sometimes|boolean',
            'mfg' => 'nullable|date_format:Y-m-d',
            'exp' => 'nullable|date_format:Y-m-d',
            'batch' => 'nullable|string|max:30',
            'qty' => 'nullable|integer|min:1|max:9999',
            'pi' => 'nullable|integer|exists:kitchen_production_items,id',
            'preview' => 'sometimes|boolean',
        ]);
        try {
            $req = StickerSheet::normalise($request->all());
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $summary = $this->stickers->summary($req);
        $query = [
            'items' => StickerSheet::itemsParam($req['items']),
            'lang' => $req['lang'],
            'layout' => $req['layout'],
            'w' => $req['w'],
            'h' => $req['h'],
            'fill' => $req['fill'] ? 1 : null,
            'mfg' => $req['mfg'],
            'exp' => $req['exp'],
            'batch' => $req['batch'],
            'qty' => $req['qty'],
            'pi' => $req['pi'],
        ];

        // A preview in the item editor prints nothing, so it is not logged.
        if (!$request->boolean('preview')) {
            foreach ($summary['products'] as $p) {
                LabelPrint::create([
                    'kind' => $req['lang'] === 'dv' ? 'sticker_dv' : 'sticker_en',
                    'layout' => $req['layout'],
                    'label_w_mm' => $req['w'],
                    'label_h_mm' => $req['h'],
                    'item_id' => $p['id'],
                    'kitchen_production_item_id' => $req['pi'],
                    'copies' => $p['copies'],
                    'mfg_date' => $p['mfg'],
                    'exp_date' => $p['exp'],
                    'batch_code' => $req['batch'] !== '' ? $req['batch'] : null,
                    'pack_qty' => $req['qty'] !== '' ? (int) $req['qty'] : null,
                    'printed_by' => $request->user()?->id,
                    'output' => 'print',
                ]);
            }
        }

        return response()->json([
            'url' => LabelSheetController::link('labels.stickers', $query + ($request->boolean('preview') ? ['preview' => 1] : ['print' => 1])),
            'view_url' => LabelSheetController::link('labels.stickers', $query),
            'pdf_url' => LabelSheetController::link('labels.stickers.pdf', $query),
            'expires_in_minutes' => LabelSheetController::LINK_MINUTES,
            'summary' => $summary,
        ]);
    }

    /** Signed links to a box label, after checking it and writing the print log. */
    public function boxUrl(Request $request): JsonResponse
    {
        $rules = [
            'delivery' => 'nullable|integer|exists:trade_deliveries,id',
            'lines' => 'sometimes|array|max:16',
            'lines.*.id' => 'required|integer|exists:items,id',
            'lines.*.qty' => 'nullable|integer|min:0|max:99999',
            'lines.*.article' => 'nullable|string|max:' . BoxLabel::ARTICLE_MAX,
            'articles' => 'sometimes|boolean',
        ];
        foreach (BoxLabel::FIELDS as $key) {
            $rules[$key] = 'nullable|string|max:' . ($key === 'customer' ? 40 : 60);
        }
        $data = $request->validate($rules);
        try {
            $req = BoxLabel::normalise($data);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $query = array_merge(
            array_filter($req['fields'], fn ($v) => $v !== ''),
            [
                'delivery' => $req['delivery'],
                'lines' => implode(',', array_map(fn ($l) => $l['id'] . ':' . $l['qty'], $req['lines'])),
                'arts' => BoxLabel::encodeArticles(array_column($req['lines'], 'article')),
                'articles' => $req['articles'] ? null : 0,
            ],
        );
        LabelPrint::create([
            'kind' => 'box_label',
            'layout' => 'a4',
            'trade_delivery_id' => $req['delivery'],
            'copies' => 1,
            'details' => ['fields' => array_filter($req['fields'], fn ($v) => $v !== ''), 'lines' => array_map(fn ($l) => array_filter($l, fn ($v) => $v !== ''), $req['lines'])],
            'printed_by' => $request->user()?->id,
            'output' => 'print',
        ]);

        return response()->json([
            'url' => LabelSheetController::link('labels.box', $query + ['print' => 1]),
            'view_url' => LabelSheetController::link('labels.box', $query),
            'pdf_url' => LabelSheetController::link('labels.box.pdf', $query),
            'expires_in_minutes' => LabelSheetController::LINK_MINUTES,
        ]);
    }

    /**
     * What a wholesale delivery fills in on a box label, for the panel to
     * show and change before printing: the shop's saved box label, the date
     * and the quantities sent.
     */
    public function deliveryBoxLabel(TradeDelivery $delivery): JsonResponse
    {
        $prefill = BoxLabel::fromDelivery($delivery);

        return response()->json(['data' => [
            'delivery' => $delivery->id,
            'delivery_number' => $delivery->delivery_number,
            'trade_account_id' => $delivery->trade_account_id,
            'saved' => $prefill['saved'],
            'fields' => $prefill['fields'],
            'lines' => $this->namedLines($prefill['lines']),
        ]]);
    }

    /** Shops for the box label's "Shop" list (Labels users need not see Wholesale). */
    public function shops(): JsonResponse
    {
        $rows = TradeAccount::query()->where('is_active', true)->orderBy('shop_name')->get(['id', 'shop_name', 'box_label']);

        return response()->json(['data' => $rows->map(fn (TradeAccount $a) => [
            'id' => $a->id,
            'shop_name' => $a->shop_name,
            'saved' => is_array($a->box_label) && $a->box_label !== [],
        ])->values()]);
    }

    /** A shop's box label, all in one place: who, how it travels, and its items with their article names. */
    public function shopBoxLabel(TradeAccount $tradeAccount): JsonResponse
    {
        $prefill = BoxLabel::fromAccount($tradeAccount);

        return response()->json(['data' => [
            'trade_account_id' => $tradeAccount->id,
            'saved' => $prefill['saved'],
            'fields' => $prefill['fields'],
            'lines' => $this->namedLines($prefill['lines']),
        ]]);
    }

    /** Keep the label as this shop's box label for next time. */
    public function saveShopBoxLabel(Request $request, TradeAccount $tradeAccount): JsonResponse
    {
        $rules = [
            'items' => 'present|array|max:16',
            'items.*.id' => 'required|integer|exists:items,id',
            'items.*.article' => 'nullable|string|max:' . BoxLabel::ARTICLE_MAX,
        ];
        foreach (BoxLabel::SHOP_FIELDS as $key) {
            $rules[$key] = 'nullable|string|max:' . ($key === 'customer' ? 40 : 60);
        }
        $data = $request->validate($rules);
        BoxLabel::saveForAccount($tradeAccount, $data, $data['items']);

        return $this->shopBoxLabel($tradeAccount->refresh());
    }

    /**
     * @param list<array{id: int, qty: int, article: string}> $lines
     * @return list<array<string, mixed>>
     */
    private function namedLines(array $lines): array
    {
        $names = Item::query()->whereIn('id', array_column($lines, 'id'))->pluck('name', 'id');

        return array_values(array_map(fn ($l) => $l + ['name' => (string) $names[$l['id']], 'default_article' => BoxLabel::defaultArticle((string) $names[$l['id']])], array_filter($lines, fn ($l) => isset($names[$l['id']]))));
    }

    /** What a production line fills in on its stickers: item, batch, expiry and quantity. */
    public function productionStickers(KitchenProductionItem $productionItem): JsonResponse
    {
        $item = $productionItem->item_id ? Item::query()->find($productionItem->item_id) : null;

        return response()->json(['data' => [
            'pi' => $productionItem->id,
            'item' => $item ? ['id' => $item->id, 'name' => $item->name, 'label_enabled' => (bool) $item->label_enabled, 'label_shelf_life_days' => $item->label_shelf_life_days] : null,
            'batch' => (string) ($productionItem->batch_code ?: $productionItem->batch?->batch_no ?: ''),
            'exp' => $productionItem->expires_at?->toDateString(),
            'mfg' => ($productionItem->batch?->submitted_at ?? $productionItem->created_at)?->toDateString(),
            'qty' => (int) round((float) $productionItem->produced_qty),
        ]]);
    }

    /** The print log, newest first. */
    public function prints(Request $request): JsonResponse
    {
        $rows = LabelPrint::query()
            ->with(['item:id,name', 'printer:id,name', 'delivery:id,delivery_number'])
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($request->filled('item_id'), fn ($q) => $q->where('item_id', $request->integer('item_id')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->string('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('created_at', '<=', $request->string('to')))
            ->orderByDesc('id')
            ->paginate(min(100, max(10, $request->integer('per_page', 30))));

        return response()->json($rows->through(fn (LabelPrint $p) => [
            'id' => $p->id,
            'kind' => $p->kind,
            'layout' => $p->layout,
            'item' => $p->item?->name,
            'delivery' => $p->delivery?->delivery_number,
            'copies' => $p->copies,
            'mfg_date' => $p->mfg_date?->toDateString(),
            'exp_date' => $p->exp_date?->toDateString(),
            'batch_code' => $p->batch_code,
            'pack_qty' => $p->pack_qty,
            'details' => $p->details,
            'printed_by' => $p->printer?->name,
            'created_at' => $p->created_at?->toIso8601String(),
        ]));
    }

    public function settings(): JsonResponse
    {
        return response()->json(['data' => LabelSettings::all(), 'defaults' => LabelSettings::DEFAULTS]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $rules = [];
        foreach (array_keys(LabelSettings::DEFAULTS) as $key) {
            $rules[$key] = str_starts_with($key, 'label_precut_') ? 'sometimes|nullable|numeric|between:-20,20' : 'sometimes|nullable|string|max:200';
        }
        LabelSettings::save($request->validate($rules));

        return response()->json(['data' => LabelSettings::all()]);
    }

    /**
     * Items for the hub: the ones switched on for labels first, then the rest
     * of the active menu so any item can be switched on from here.
     */
    public function products(Request $request): JsonResponse
    {
        $items = Item::query()
            ->where('is_active', true)
            ->when(!$request->boolean('all'), fn ($q) => $q->where('label_enabled', true))
            ->with(['recipe:id,item_id'])
            ->orderByDesc('label_enabled')
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $items->map(fn (Item $item) => $this->present($item))->values()]);
    }

    public function show(Item $item): JsonResponse
    {
        return response()->json(['data' => $this->present($item)]);
    }

    public function updateItem(Request $request, Item $item): JsonResponse
    {
        $data = $request->validate([
            'label_enabled' => 'sometimes|boolean',
            'label_ingredients_source' => ['sometimes', Rule::in(LabelIngredients::SOURCES)],
            'label_ingredients' => 'sometimes|nullable|string|max:500',
            'label_ingredients_dv' => 'sometimes|nullable|string|max:500',
            'label_shelf_life_days' => 'sometimes|nullable|integer|min:1|max:730',
            'label_storage' => ['sometimes', Rule::in(['frozen', 'chilled', 'ambient'])],
            'label_pack_qty' => 'sometimes|nullable|integer|min:1|max:999',
            'label_title_media_id' => 'sometimes|nullable|integer|exists:media_assets,id',
            'label_photo_media_id' => 'sometimes|nullable|integer|exists:media_assets,id',
        ]);
        foreach (['label_title_media_id', 'label_photo_media_id'] as $key) {
            if (!empty($data[$key]) && Media::query()->whereKey($data[$key])->value('media_type') !== 'image') {
                return response()->json(['message' => 'Pick an image for the label.', 'errors' => [$key => ['Pick an image.']]], 422);
            }
        }

        $item->fill($data)->save();

        return response()->json(['data' => $this->present($item->refresh())]);
    }

    /** @return array<string, mixed> */
    private function present(Item $item): array
    {
        $lines = $this->ingredients->forItem($item);
        $media = Media::query()->whereIn('id', array_filter([$item->label_title_media_id, $item->label_photo_media_id]))->get()->keyBy('id');

        return [
            'id' => $item->id,
            'name' => $item->name,
            'name_dv' => $item->name_dv,
            'label_enabled' => (bool) $item->label_enabled,
            'label_ingredients_source' => $item->label_ingredients_source ?: 'auto',
            'label_ingredients' => $item->label_ingredients,
            'label_ingredients_dv' => $item->label_ingredients_dv,
            'label_shelf_life_days' => $item->label_shelf_life_days,
            'label_storage' => $item->label_storage ?: 'frozen',
            'label_pack_qty' => $item->label_pack_qty,
            'label_title_media_id' => $item->label_title_media_id,
            'label_title_url' => $media->get($item->label_title_media_id)?->url,
            'label_photo_media_id' => $item->label_photo_media_id,
            'label_photo_url' => $media->get($item->label_photo_media_id)?->url,
            'cutout_url' => $item->cutout_url,
            'allergens' => $item->allergens ?? [],
            'has_recipe' => $item->relationLoaded('recipe') ? $item->recipe !== null : $item->recipe()->exists(),
            // What would print today, and where it comes from.
            'ingredients' => $lines,
        ];
    }
}
