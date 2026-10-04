<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Labels\LabelIngredients;
use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Label Hub (owner, 2026-10-04; docs/LABEL_HUB_PLAN.md): what each item prints
 * on a pack sticker, and the item settings behind it.
 */
class LabelsController extends Controller
{
    public function __construct(private readonly LabelIngredients $ingredients) {}

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
