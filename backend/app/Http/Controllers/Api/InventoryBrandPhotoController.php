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

        /*
         * Owner, 2026-09-09: "i want to save more than one brand, and photo is
         * optional." The brand is the fact worth recording — it reaches the
         * buying screens as something to pick rather than spell — and the
         * picture is the useful extra, added now or whenever somebody is next
         * standing in front of the tin.
         */
        $validated = $request->validate([
            'brand' => ['required', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:160'],
            'photo' => ['nullable', 'file', 'image', 'max:5120', 'mimes:jpg,jpeg,png,webp'],
        ]);

        $brand = trim((string) $validated['brand']);
        $key = InventoryBrandPhoto::keyFor($brand);
        if ($key === '') {
            return response()->json([
                'message' => 'Give the brand a name.',
                'errors' => ['brand' => ['Give the brand a name.']],
            ], 422);
        }

        $file = $request->file('photo');
        $path = $file?->store("brand-photos/{$item->id}", 'public');

        $photo = DB::transaction(function () use ($item, $brand, $key, $path, $file, $validated, $request) {
            $existing = InventoryBrandPhoto::query()
                ->where('inventory_item_id', $item->id)
                ->where('brand_key', $key)
                ->lockForUpdate()
                ->first();

            $row = $existing ?? new InventoryBrandPhoto([
                'inventory_item_id' => $item->id,
                'brand_key' => $key,
            ]);

            // Only a new file replaces the old one. Saving a brand again to
            // correct its spelling must not take the picture down with it.
            $oldPath = $path === null ? null : $existing?->file_path;

            $fields = [
                'inventory_item_id' => $item->id,
                'brand' => $brand,
                'brand_key' => $key,
                'uploaded_by' => $request->user()?->id,
            ];
            if (array_key_exists('note', $validated)) {
                $fields['note'] = trim((string) $validated['note']) !== ''
                    ? trim((string) $validated['note'])
                    : null;
            }
            if ($path !== null && $file !== null) {
                $fields['file_path'] = $path;
                $fields['original_filename'] = $file->getClientOriginalName();
                $fields['mime_type'] = $file->getClientMimeType();
                $fields['size'] = $file->getSize();
            }
            $row->fill($fields);
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
            ['brand' => $brand, 'has_photo' => $photo->file_path !== null],
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
        // A brand that was written down but never photographed has no file.
        if ($path !== null) {
            Storage::disk('public')->delete($path);
        }

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
