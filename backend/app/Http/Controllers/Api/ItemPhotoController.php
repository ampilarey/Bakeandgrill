<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Item;
use App\Models\ItemPhoto;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Storage;

class ItemPhotoController extends Controller
{
    // ── Public: list photos ───────────────────────────────────────────────────

    public function index(int $itemId): JsonResponse
    {
        $item   = Item::findOrFail($itemId);
        $photos = $item->photos()->get();

        return response()->json(['photos' => $photos]);
    }

    // ── Admin: upload photo ───────────────────────────────────────────────────

    public function store(Request $request, int $itemId): JsonResponse
    {
        $item = Item::findOrFail($itemId);

        $validated = $request->validate([
            'photo'      => ['required', 'file', 'mimes:jpeg,jpg,png,webp', 'max:5120'],
            'alt_text'   => ['nullable', 'string', 'max:200'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        $path = $request->file('photo')->store("item-photos/{$itemId}", 'public');
        $url  = Storage::url($path);

        if ($validated['is_primary'] ?? false) {
            // Demote all others
            $item->photos()->update(['is_primary' => false]);
        }

        $maxOrder = $item->photos()->max('sort_order') ?? 0;

        $photo = ItemPhoto::create([
            'item_id'    => $item->id,
            'url'        => $url,
            'alt_text'   => $validated['alt_text'] ?? null,
            'sort_order' => $maxOrder + 1,
            'is_primary' => (bool) ($validated['is_primary'] ?? false),
        ]);

        return response()->json(['photo' => $photo], 201);
    }

    // ── Admin: update alt/sort/primary ────────────────────────────────────────

    public function update(Request $request, int $itemId, int $photoId): JsonResponse
    {
        $photo     = ItemPhoto::where('item_id', $itemId)->findOrFail($photoId);
        $validated = $request->validate([
            'alt_text'   => ['nullable', 'string', 'max:200'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        if (!empty($validated['is_primary'])) {
            ItemPhoto::where('item_id', $itemId)->update(['is_primary' => false]);
        }

        $photo->update($validated);

        return response()->json(['photo' => $photo->fresh()]);
    }

    // ── Admin: delete ─────────────────────────────────────────────────────────

    public function destroy(int $itemId, int $photoId): JsonResponse
    {
        $photo = ItemPhoto::where('item_id', $itemId)->findOrFail($photoId);

        // Delete from storage
        $relativePath = ltrim(str_replace(Storage::url(''), '', $photo->url), '/');
        Storage::disk('public')->delete($relativePath);

        $photo->delete();

        return response()->json(['message' => 'Photo deleted.']);
    }
}
