<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Catalog\Support\CutoutBackdrop;
use App\Models\Item;
use App\Services\CutoutImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * The cut-out thumbnail slot on an item (owner, 2026-10-01, after the ZUS
 * screenshots): one see-through picture for the small cards, and the
 * item's own say over the circle behind it. The gallery and the main photo
 * are untouched; an opened item still shows those.
 */
class ItemCutoutController extends Controller
{
    public function __construct(
        private readonly CutoutImageProcessor $processor,
        private readonly CutoutBackdrop $backdrops,
    ) {}

    public function show(int $itemId): JsonResponse
    {
        return response()->json($this->payload(Item::findOrFail($itemId)));
    }

    public function store(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $request->validate([
            'cutout' => ['required', 'file', 'mimes:png,webp', 'max:8192'],
        ], [
            'cutout.mimes' => 'A cut-out must be a PNG or WebP with the background removed.',
        ]);

        try {
            $stored = $this->processor->store($request->file('cutout'));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->processor->forget($item->cutout_url, $item->cutout_webp_url);
        $item->forceFill([
            'cutout_url' => '/storage/' . ltrim($stored['path'], '/'),
            'cutout_webp_url' => $stored['webp_path'] ? '/storage/' . ltrim($stored['webp_path'], '/') : null,
        ])->save();

        return response()->json($this->payload($item->fresh()), 201);
    }

    /**
     * The item's own backdrop. Null (or a body with nothing set) means
     * "use the category's", which is what the resolver falls back to.
     */
    public function updateBackdrop(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $request->validate([
            'backdrop' => ['present', 'nullable', 'array'],
            'backdrop.color' => ['nullable', 'string', 'max:9'],
            'backdrop.strength' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $item->forceFill(['cutout_backdrop' => CutoutBackdrop::normalize($request->input('backdrop'))])->save();

        return response()->json($this->payload($item->fresh()));
    }

    public function destroy(int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $this->processor->forget($item->cutout_url, $item->cutout_webp_url);
        $item->forceFill(['cutout_url' => null, 'cutout_webp_url' => null])->save();

        return response()->json($this->payload($item->fresh()));
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Item $item): array
    {
        $this->backdrops->forget();

        return [
            'cutout_url' => $item->cutout_url,
            'cutout_webp_url' => $item->cutout_webp_url,
            // What this item sets itself (null when it inherits everything).
            'backdrop' => CutoutBackdrop::normalize($item->cutout_backdrop),
            // What its card actually draws, and which level decided it.
            'effective' => $this->backdrops->resolve($item),
        ];
    }
}
