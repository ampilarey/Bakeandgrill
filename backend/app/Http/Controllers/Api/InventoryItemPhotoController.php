<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * The picture of an ingredient itself — not of a brand it is bought as.
 *
 * Owner, 2026-09-18: "is there any option to add inventory item photo - not
 * brand". One photo per item; uploading again replaces it. Same disk and
 * limits as the brand photos, so nothing new has to be true of the server.
 */
class InventoryItemPhotoController extends Controller
{
    /** POST /inventory/{itemId}/photo */
    public function store(Request $request, int $itemId): JsonResponse
    {
        $item = InventoryItem::query()->findOrFail($itemId);

        $request->validate([
            'photo' => ['required', 'file', 'image', 'max:5120', 'mimes:jpg,jpeg,png,webp'],
        ]);

        $file = $request->file('photo');
        $path = $file->store("inventory-photos/{$item->id}", 'public');
        $old = $item->photo_path;

        $item->photo_path = $path;
        $item->save();

        if ($old !== null && $old !== $path) {
            Storage::disk('public')->delete($old);
        }

        app(AuditLogService::class)->log(
            'inventory.photo_saved',
            'InventoryItem',
            $item->id,
            ['photo_path' => $old],
            ['photo_path' => $path],
            ['item_name' => $item->name],
            $request,
        );

        return response()->json(['item_id' => $item->id, 'photo_url' => $item->photo_url], 201);
    }

    /** DELETE /inventory/{itemId}/photo */
    public function destroy(Request $request, int $itemId): JsonResponse
    {
        $item = InventoryItem::query()->findOrFail($itemId);
        $old = $item->photo_path;

        if ($old !== null) {
            $item->photo_path = null;
            $item->save();
            Storage::disk('public')->delete($old);

            app(AuditLogService::class)->log(
                'inventory.photo_removed',
                'InventoryItem',
                $item->id,
                ['photo_path' => $old],
                ['photo_path' => null],
                ['item_name' => $item->name],
                $request,
            );
        }

        return response()->json(['item_id' => $item->id, 'photo_url' => null]);
    }
}
