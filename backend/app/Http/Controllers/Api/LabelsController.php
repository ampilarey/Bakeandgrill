<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Labels\BoxLabel;
use App\Domains\Labels\LabelIngredients;
use App\Domains\Labels\LabelMedia;
use App\Domains\Labels\LabelSettings;
use App\Domains\Labels\LabelTypes;
use App\Domains\Labels\StickerLayouts;
use App\Domains\Labels\StickerSheet;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Labels\LabelSheetController;
use App\Models\Item;
use App\Models\KitchenProductionItem;
use App\Models\LabelBrand;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use App\Models\LabelType;
use App\Models\Media;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
        private readonly LabelTypes $types,
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
            'shape' => $l['shape'] ?? 'rect',
            'compact' => ($l['shape'] ?? 'rect') === 'rect' && $key !== 'single-custom' && min($l['w'] / StickerLayouts::DESIGN_W, $l['h'] / StickerLayouts::DESIGN_H) < StickerLayouts::FULL_MIN_SCALE,
        ])->values()]);
    }

    public const STICKER_RULES = [
        'items' => 'required|array|min:1|max:60',
        'items.*.id' => 'required|integer|exists:items,id',
        'items.*.copies' => 'required|integer|min:1|max:' . StickerSheet::MAX_STICKERS,
        'lang' => 'sometimes|in:en,dv',
        'w' => 'nullable|numeric',
        'h' => 'nullable|numeric',
        'fill' => 'sometimes|boolean',
        'mfg' => 'nullable|date_format:Y-m-d',
        'exp' => 'nullable|date_format:Y-m-d',
        'batch' => 'nullable|string|max:30',
        'qty' => 'nullable|integer|min:1|max:9999',
        'pi' => 'nullable|integer|exists:kitchen_production_items,id',
        'type' => 'nullable|integer|exists:label_types,id',
        'rounded' => 'sometimes|boolean',
        'preview' => 'sometimes|boolean',
    ];

    /** The sticker request keys a saved label keeps. */
    private const STICKER_KEYS = ['items', 'lang', 'layout', 'w', 'h', 'fill', 'mfg', 'exp', 'batch', 'qty', 'pi', 'type', 'rounded'];

    /**
     * Signed links to a sheet of pack stickers, after checking the request
     * (dates, sizes, counts), writing the print log and saving the label
     * (v2 point 10) so it can be printed again or edited.
     */
    public function stickersUrl(Request $request): JsonResponse
    {
        $request->validate(self::STICKER_RULES + ['layout' => ['sometimes', Rule::in(array_keys(StickerLayouts::LAYOUTS))]]);
        try {
            $req = StickerSheet::normalise($request->all());
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $preview = $request->boolean('preview');
        $out = $this->stickerLinks($req, $request->user()?->id, $preview);
        if (!$preview) {
            $out['job'] = $this->rememberJob('stickers', array_intersect_key($request->all(), array_flip(self::STICKER_KEYS)), $out['summary'], $request->user()?->id);
        }

        return response()->json($out);
    }

    /**
     * The links for a normalised sticker request, and the print log entries
     * unless it is a preview (which prints nothing).
     *
     * @param array<string, mixed> $req from StickerSheet::normalise()
     * @return array<string, mixed>
     */
    private function stickerLinks(array $req, ?int $userId, bool $preview = false): array
    {
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
            'type' => $req['type'],
            'rounded' => $req['rounded'] ? 1 : null,
        ];

        if (!$preview) {
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
                    'printed_by' => $userId,
                    'output' => 'print',
                ]);
            }
        }

        return [
            'url' => LabelSheetController::link('labels.stickers', $query + ($preview ? ['preview' => 1] : ['print' => 1])),
            'view_url' => LabelSheetController::link('labels.stickers', $query),
            'pdf_url' => LabelSheetController::link('labels.stickers.pdf', $query),
            'expires_in_minutes' => LabelSheetController::LINK_MINUTES,
            'summary' => $summary,
        ];
    }

    /** @return array<string, mixed> */
    public static function boxRules(): array
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
            $rules[$key] = $key === 'storage' ? ['nullable', Rule::in(LabelSettings::STORAGES)] : 'nullable|string|max:' . BoxLabel::limit($key);
        }

        return $rules;
    }

    /** Signed links to a box label, after checking it, writing the print log and saving the label. */
    public function boxUrl(Request $request): JsonResponse
    {
        $data = $request->validate(self::boxRules());
        try {
            $req = BoxLabel::normalise($data);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $out = $this->boxLinks($req, $request->user()?->id);
        $out['job'] = $this->rememberJob('box', $data, $out['summary'], $request->user()?->id);

        return response()->json($out);
    }

    /**
     * @param array<string, mixed> $req from BoxLabel::normalise()
     * @return array<string, mixed>
     */
    private function boxLinks(array $req, ?int $userId): array
    {
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
            'printed_by' => $userId,
            'output' => 'print',
        ]);
        $names = Item::query()->whereIn('id', array_column($req['lines'], 'id'))->pluck('name', 'id');

        return [
            'url' => LabelSheetController::link('labels.box', $query + ['print' => 1]),
            'view_url' => LabelSheetController::link('labels.box', $query),
            'pdf_url' => LabelSheetController::link('labels.box.pdf', $query),
            'expires_in_minutes' => LabelSheetController::LINK_MINUTES,
            'summary' => [
                'label' => 'Box label',
                'customer' => $req['fields']['customer'],
                'when' => $req['fields']['when'],
                'lines' => array_values(array_map(fn ($l) => ['name' => (string) ($names[$l['id']] ?? ''), 'qty' => $l['qty']], $req['lines'])),
            ],
        ];
    }

    // ---- Saved labels (v2 point 10) ----

    /**
     * Keep a prepared print as a saved label. The same request prepared
     * again is the same label printed again, not a second copy.
     *
     * @param array<string, mixed> $request the request as sent (not normalised), so it can be edited
     * @param array<string, mixed> $summary
     * @return array{id: int, name: string}
     */
    private function rememberJob(string $kind, array $request, array $summary, ?int $userId): array
    {
        $hash = LabelJob::hashOf($kind, $request);
        $job = LabelJob::query()->where('request_hash', $hash)->first();
        if ($job === null) {
            $job = LabelJob::query()->create([
                'kind' => $kind,
                'name' => $this->jobName($kind, $summary),
                'request' => $request,
                'summary' => $summary,
                'request_hash' => $hash,
                'created_by' => $userId,
            ]);
        }
        $job->forceFill(['print_count' => $job->print_count + 1, 'last_printed_at' => now(), 'summary' => $summary])->save();

        return ['id' => $job->id, 'name' => $job->name];
    }

    /** @param array<string, mixed> $summary */
    private function jobName(string $kind, array $summary): string
    {
        if ($kind === 'box') {
            $who = trim((string) ($summary['customer'] ?? '')) ?: 'blank';

            return mb_substr('Box label · ' . $who . ' · ' . now()->format('j M'), 0, 80);
        }
        $parts = array_map(fn ($p) => $p['name'] . ' ×' . $p['copies'], array_slice($summary['products'] ?? [], 0, 3));
        $more = count($summary['products'] ?? []) - 3;
        $name = implode(', ', $parts) . ($more > 0 ? " +{$more}" : '') . ' · ' . ($summary['label'] ?? '') . ' · ' . now()->format('j M');

        return mb_substr($name, 0, 80);
    }

    public function jobs(Request $request): JsonResponse
    {
        $rows = LabelJob::query()
            ->with('creator:id,name')
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%' . $request->string('q') . '%'))
            ->orderByDesc('last_printed_at')
            ->paginate(min(100, max(10, $request->integer('per_page', 30))));

        return response()->json($rows->through(fn (LabelJob $j) => $this->presentJob($j)));
    }

    public function job(LabelJob $job): JsonResponse
    {
        return response()->json(['data' => $this->presentJob($job->load('creator:id,name')) + ['request' => $job->request]]);
    }

    public function updateJob(Request $request, LabelJob $job): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string|max:80']);
        $job->forceFill(['name' => trim($data['name'])])->save();

        return response()->json(['data' => $this->presentJob($job->load('creator:id,name'))]);
    }

    public function duplicateJob(LabelJob $job): JsonResponse
    {
        $copy = $job->replicate(['print_count', 'last_printed_at']);
        $copy->forceFill(['name' => mb_substr($job->name . ' (copy)', 0, 80), 'request_hash' => LabelJob::hashOf($job->kind, $job->request + ['copy' => $job->id . ':' . microtime(true)]), 'print_count' => 0, 'last_printed_at' => null, 'created_by' => request()->user()?->id])->save();

        return response()->json(['data' => $this->presentJob($copy->load('creator:id,name')) + ['request' => $copy->request]], 201);
    }

    public function destroyJob(LabelJob $job): JsonResponse
    {
        $job->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Print a saved label again. Stickers with dates filled are printed
     * with today's made-on date (and the expiry worked out from it) unless
     * the saved expiry is still ahead; a label is a new batch, not the old
     * one. Edit the label to print it with other dates.
     */
    public function printJob(Request $request, LabelJob $job): JsonResponse
    {
        $data = $job->request;
        if ($job->kind === 'stickers') {
            if (!empty($data['fill'])) {
                $data['mfg'] = Carbon::today()->toDateString();
                if (!empty($data['exp']) && Carbon::parse($data['exp'])->lessThan(Carbon::today())) {
                    $data['exp'] = null;
                }
            }
            try {
                $req = StickerSheet::normalise($data);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            $out = $this->stickerLinks($req, $request->user()?->id);
        } else {
            try {
                $req = BoxLabel::normalise($data);
            } catch (InvalidArgumentException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            $out = $this->boxLinks($req, $request->user()?->id);
        }
        $job->forceFill(['print_count' => $job->print_count + 1, 'last_printed_at' => now(), 'summary' => $out['summary']])->save();
        $out['job'] = ['id' => $job->id, 'name' => $job->name];

        return response()->json($out);
    }

    /** @return array<string, mixed> */
    private function presentJob(LabelJob $job): array
    {
        return [
            'id' => $job->id,
            'kind' => $job->kind,
            'name' => $job->name,
            'summary' => $job->summary,
            'print_count' => $job->print_count,
            'last_printed_at' => $job->last_printed_at?->toIso8601String(),
            'created_at' => $job->created_at?->toIso8601String(),
            'created_by' => $job->creator?->name,
        ];
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
            $rules[$key] = $key === 'storage' ? ['nullable', Rule::in(LabelSettings::STORAGES)] : 'nullable|string|max:' . BoxLabel::limit($key);
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
            ->with(['recipe:id,item_id', 'labelType.brand'])
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
            'label_storage' => ['sometimes', Rule::in(LabelSettings::STORAGES)],
            'label_type_id' => 'sometimes|nullable|integer|exists:label_types,id',
            'label_how_to_use' => 'sometimes|nullable|string|max:200',
            'label_how_to_use_dv' => 'sometimes|nullable|string|max:200',
            'label_pack_qty' => 'sometimes|nullable|integer|min:1|max:999',
            'label_heading' => 'sometimes|nullable|string|max:40',
            'label_heading_dv' => 'sometimes|nullable|string|max:40',
            'label_storage_line' => 'sometimes|nullable|string|max:160',
            'label_storage_line_dv' => 'sometimes|nullable|string|max:160',
            'label_note' => 'sometimes|nullable|string|max:120',
            'label_note_dv' => 'sometimes|nullable|string|max:120',
            'label_pack_unit' => 'sometimes|nullable|string|max:10',
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

    // ---- Label types and brands (v2 points 3 and 6) ----

    public function types(): JsonResponse
    {
        $rows = LabelType::query()->with('brand')->withCount('items')->orderBy('sort')->orderBy('id')->get();

        return response()->json(['data' => $rows->map(fn (LabelType $t) => LabelTypes::presentType($t))->values()]);
    }

    public function storeType(Request $request): JsonResponse
    {
        $type = new LabelType(['sort' => (int) LabelType::query()->max('sort') + 1]);
        $type->fill($this->typeData($request, $type))->save();

        return response()->json(['data' => LabelTypes::presentType($type->load('brand'))], 201);
    }

    public function updateType(Request $request, LabelType $type): JsonResponse
    {
        $type->fill($this->typeData($request, $type))->save();

        return response()->json(['data' => LabelTypes::presentType($type->load('brand'))]);
    }

    public function destroyType(LabelType $type): JsonResponse
    {
        if (LabelType::query()->count() <= 1) {
            return response()->json(['message' => 'Keep at least one label type.'], 422);
        }
        $n = $type->items()->count();
        if ($n > 0) {
            return response()->json(['message' => "{$n} " . ($n === 1 ? 'item uses' : 'items use') . ' this type. Move them to another type first.'], 422);
        }
        $type->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function typeData(Request $request, LabelType $type): array
    {
        $exists = $type->exists ? 'sometimes' : 'required';

        return $request->validate([
            'name' => "{$exists}|string|max:60",
            'heading' => "{$exists}|string|max:40",
            'heading_dv' => 'sometimes|nullable|string|max:40',
            'brand_id' => 'sometimes|nullable|integer|exists:label_brands,id',
            'storage' => ['sometimes', Rule::in(LabelType::STORAGES)],
            'storage_line' => 'sometimes|nullable|string|max:160',
            'storage_line_dv' => 'sometimes|nullable|string|max:160',
            'use_within' => 'sometimes|nullable|string|max:80',
            'use_within_dv' => 'sometimes|nullable|string|max:80',
            'mfg_label' => 'sometimes|nullable|string|max:20',
            'exp_label' => 'sometimes|nullable|string|max:20',
            'how_to_use' => 'sometimes|nullable|string|max:200',
            'how_to_use_dv' => 'sometimes|nullable|string|max:200',
            'note' => 'sometimes|nullable|string|max:120',
            'note_dv' => 'sometimes|nullable|string|max:120',
            'shelf_life_days' => 'sometimes|nullable|integer|min:1|max:730',
            'show_qr' => 'sometimes|boolean',
            'is_active' => 'sometimes|boolean',
            'sort' => 'sometimes|integer|min:0|max:999',
        ]);
    }

    public function brands(): JsonResponse
    {
        $rows = LabelBrand::query()->with('logo')->withCount('types')->orderBy('sort')->orderBy('id')->get();

        return response()->json(['data' => $rows->map(fn (LabelBrand $b) => LabelTypes::presentBrand($b))->values()]);
    }

    public function storeBrand(Request $request): JsonResponse
    {
        $brand = new LabelBrand(['sort' => (int) LabelBrand::query()->max('sort') + 1]);
        $brand->fill($this->brandData($request, $brand))->save();

        return response()->json(['data' => LabelTypes::presentBrand($brand->load('logo'))], 201);
    }

    public function updateBrand(Request $request, LabelBrand $brand): JsonResponse
    {
        $brand->fill($this->brandData($request, $brand))->save();

        return response()->json(['data' => LabelTypes::presentBrand($brand->load('logo'))]);
    }

    /** The logo as the PNG uploaded (LabelMedia); the library's own path would flatten it onto white. */
    public function brandLogo(Request $request, LabelBrand $brand): JsonResponse
    {
        $request->validate(['file' => 'required|file|max:4096']);
        try {
            $media = LabelMedia::storePng((string) file_get_contents($request->file('file')->getRealPath()), "{$brand->name} logo");
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage(), 'errors' => ['file' => [$e->getMessage()]]], 422);
        }
        $brand->forceFill(['logo_media_id' => $media->id])->save();

        return response()->json(['data' => LabelTypes::presentBrand($brand->load('logo'))]);
    }

    public function destroyBrand(LabelBrand $brand): JsonResponse
    {
        if ($brand->is_default) {
            return response()->json(['message' => 'The main brand cannot be removed.'], 422);
        }
        $n = $brand->types()->count();
        if ($n > 0) {
            return response()->json(['message' => "{$n} label " . ($n === 1 ? 'type uses' : 'types use') . ' this brand. Move them to another brand first.'], 422);
        }
        $brand->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array<string, mixed> */
    private function brandData(Request $request, LabelBrand $brand): array
    {
        return $request->validate([
            'name' => ($brand->exists ? 'sometimes' : 'required') . '|string|max:60',
            'name_dv' => 'sometimes|nullable|string|max:60',
            'tagline' => 'sometimes|nullable|string|max:80',
            'tagline_dv' => 'sometimes|nullable|string|max:80',
            'logo_media_id' => 'sometimes|nullable|integer|exists:media_assets,id',
            'sort' => 'sometimes|integer|min:0|max:999',
        ]);
    }

    /** @return array<string, mixed> */
    private function present(Item $item): array
    {
        $lines = $this->ingredients->forItem($item);
        // Defaults as the type gives them, so the item's own boxes stay empty.
        $bare = (clone $item)->forceFill(['label_heading' => null, 'label_heading_dv' => null, 'label_storage_line' => null, 'label_storage_line_dv' => null, 'label_note' => null, 'label_note_dv' => null, 'label_how_to_use' => null, 'label_how_to_use_dv' => null, 'label_shelf_life_days' => null]);
        $w = $this->types->forItem($bare);
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
            'label_heading' => $item->label_heading,
            'label_heading_dv' => $item->label_heading_dv,
            'label_storage_line' => $item->label_storage_line,
            'label_storage_line_dv' => $item->label_storage_line_dv,
            'label_note' => $item->label_note,
            'label_note_dv' => $item->label_note_dv,
            'label_pack_unit' => $item->label_pack_unit,
            'label_type_id' => $item->label_type_id,
            'label_type_name' => $item->label_type_id ? $item->labelType?->name : null,
            'label_how_to_use' => $item->label_how_to_use,
            'label_how_to_use_dv' => $item->label_how_to_use_dv,
            // What prints when the item's own wording is empty: its type's wording, else the defaults for its storage.
            'defaults' => [
                'heading' => $w['heading'],
                'heading_dv' => $w['heading_dv'],
                'storage_line' => $w['storage_en'],
                'storage_line_dv' => $w['storage_dv'],
                'how_to_use' => $w['how_to_use'],
                'how_to_use_dv' => $w['how_to_use_dv'],
                'note' => $w['note'],
                'note_dv' => $w['note_dv'],
                'shelf_life_days' => $w['shelf_life_days'],
                'brand' => $w['brand']['name'],
                'unit' => 'PCS',
            ],
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
