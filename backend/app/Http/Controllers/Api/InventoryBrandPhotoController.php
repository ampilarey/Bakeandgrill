<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryBrandPhoto;
use App\Models\InventoryItem;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Pictures of the brands an ingredient gets bought as.
 *
 * Owner, 2026-09-09: "can i upload a pic of different brand of item to know
 * which brand is this". One photo per brand per item; uploading again for
 * the same brand replaces it, so the shop run always sees the current
 * packaging rather than a pile of near-identical tins.
 */
class InventoryBrandPhotoController extends Controller
{
    /** GET /inventory/{itemId}/brand-photos */
    public function index(int $itemId): JsonResponse
    {
        $item = InventoryItem::query()->findOrFail($itemId);

        $photos = InventoryBrandPhoto::query()
            ->where('inventory_item_id', $item->id)
            ->orderBy('brand')
            ->get()
            ->map(fn (InventoryBrandPhoto $p) => $p->toPayload())
            ->values();

        return response()->json(['item_id' => $item->id, 'photos' => $photos]);
    }

    /** POST /inventory/{itemId}/brand-photos */
    public function store(Request $request, int $itemId): JsonResponse
    {
        $item = InventoryItem::query()->findOrFail($itemId);

        $validated = $request->validate([
            'brand' => ['required', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:160'],
            'photo' => ['required', 'file', 'image', 'max:5120', 'mimes:jpg,jpeg,png,webp'],
        ]);

        $brand = trim((string) $validated['brand']);
        $key = InventoryBrandPhoto::keyFor($brand);
        if ($key === '') {
            return response()->json([
                'message' => 'Give the brand a name.',
                'errors' => ['brand' => ['Give the brand a name.']],
            ], 422);
        }

        $path = $request->file('photo')->store("brand-photos/{$item->id}", 'public');

        $photo = DB::transaction(function () use ($item, $brand, $key, $path, $validated, $request) {
            $existing = InventoryBrandPhoto::query()
                ->where('inventory_item_id', $item->id)
                ->where('brand_key', $key)
                ->lockForUpdate()
                ->first();

            // Replacing: the old file is no use to anybody once the row moves on.
            $oldPath = $existing?->file_path;

            $row = $existing ?? new InventoryBrandPhoto([
                'inventory_item_id' => $item->id,
                'brand_key' => $key,
            ]);
            $row->fill([
                'inventory_item_id' => $item->id,
                'brand' => $brand,
                'brand_key' => $key,
                'file_path' => $path,
                'original_filename' => $request->file('photo')->getClientOriginalName(),
                'mime_type' => $request->file('photo')->getClientMimeType(),
                'size' => $request->file('photo')->getSize(),
                'note' => isset($validated['note']) && trim((string) $validated['note']) !== ''
                    ? trim((string) $validated['note'])
                    : null,
                'uploaded_by' => $request->user()?->id,
            ]);
            $row->save();

            if ($oldPath !== null && $oldPath !== $path) {
                Storage::disk('public')->delete($oldPath);
            }

            return $row;
        });

        app(AuditLogService::class)->log(
            'inventory.brand_photo_saved',
            'InventoryBrandPhoto',
            $photo->id,
            [],
            ['brand' => $brand],
            ['inventory_item_id' => $item->id, 'item_name' => $item->name],
            $request,
        );

        return response()->json(['photo' => $photo->toPayload()], 201);
    }

    /** DELETE /inventory/{itemId}/brand-photos/{id} */
    public function destroy(Request $request, int $itemId, int $id): JsonResponse
    {
        $photo = InventoryBrandPhoto::query()
            ->where('inventory_item_id', $itemId)
            ->findOrFail($id);

        $brand = $photo->brand;
        $path = $photo->file_path;
        $photo->delete();
        Storage::disk('public')->delete($path);

        app(AuditLogService::class)->log(
            'inventory.brand_photo_removed',
            'InventoryBrandPhoto',
            $id,
            ['brand' => $brand],
            [],
            ['inventory_item_id' => $itemId],
            $request,
        );

        return response()->json(['deleted' => true]);
    }
}
