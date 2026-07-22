<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Item;
use App\Models\ItemPhoto;
use App\Services\MenuImageProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ItemPhotoController extends Controller
{
    private const MAX_SIZE_KB = 10240;

    public function __construct(
        private readonly MenuImageProcessor $processor,
    ) {}

    public function index(int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);
        $photos = $item->photos()->get();

        return response()->json(['photos' => $photos]);
    }

    public function store(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);

        $validated = $request->validate([
            'photo' => ['required', 'file', 'mimes:jpeg,jpg,png,webp', 'max:' . self::MAX_SIZE_KB],
            'original' => ['sometimes', 'file', 'mimes:jpeg,jpg,png,webp', 'max:' . self::MAX_SIZE_KB],
            'alt_text' => ['nullable', 'string', 'max:200'],
            'is_primary' => ['sometimes', 'boolean'],
            // When re-cropping, keep the existing master without re-uploading it.
            'original_url' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        try {
            $path = $this->processor->storeProcessed(
                $request->file('photo'),
                "item-photos/{$itemId}",
            );
            $originalUrl = null;
            if ($request->hasFile('original')) {
                $origPath = $this->processor->storeMaster(
                    $request->file('original'),
                    "item-photos/{$itemId}/masters",
                );
                $originalUrl = '/storage/' . ltrim($origPath, '/');
            } elseif (!empty($validated['original_url'])) {
                $originalUrl = $validated['original_url'];
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $url = '/storage/' . ltrim($path, '/');

        if ($validated['is_primary'] ?? false) {
            $item->photos()->update(['is_primary' => false]);
        }

        $maxOrder = $item->photos()->max('sort_order') ?? 0;

        $photo = ItemPhoto::create([
            'item_id' => $item->id,
            'url' => $url,
            'original_url' => $originalUrl,
            'alt_text' => $validated['alt_text'] ?? null,
            'sort_order' => $maxOrder + 1,
            'is_primary' => (bool) ($validated['is_primary'] ?? false),
        ]);

        return response()->json(['photo' => $photo], 201);
    }

    public function update(Request $request, int $itemId, int $photoId): JsonResponse
    {
        $photo = ItemPhoto::where('item_id', $itemId)->findOrFail($photoId);
        $validated = $request->validate([
            'alt_text' => ['nullable', 'string', 'max:200'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_primary' => ['sometimes', 'boolean'],
            // Allow clearing before destroy so a reused master file is not deleted.
            'original_url' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        if (!empty($validated['is_primary'])) {
            ItemPhoto::where('item_id', $itemId)->update(['is_primary' => false]);
        }

        $photo->update($validated);

        return response()->json(['photo' => $photo->fresh()]);
    }

    public function destroy(int $itemId, int $photoId): JsonResponse
    {
        $photo = ItemPhoto::where('item_id', $itemId)->findOrFail($photoId);
        // Disk cleanup is handled by ItemPhotoObserver via MediaFileCleaner.
        $photo->delete();

        return response()->json(['message' => 'Photo deleted.']);
    }
}
