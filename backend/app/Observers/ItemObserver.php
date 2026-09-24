<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Social\Services\BackInStockAutoPoster;
use App\Models\Item;
use App\Support\MediaFileCleaner;
use Illuminate\Support\Facades\Log;

/**
 * On item soft-delete: remove owned main-image files and delete gallery
 * photo rows so {@see ItemPhotoObserver} cleans their files too.
 *
 * SoftDeletes does not fire FK cascadeOnDelete, so photos must be
 * deleted explicitly here (files cannot be restored after cleanup).
 */
class ItemObserver
{
    /**
     * Sold out / back in stock (owner's shortlist, 2026-09-24): the social
     * automation watches availability flips. It must never break the save
     * that caused it, so anything it throws is logged and swallowed.
     */
    public function updated(Item $item): void
    {
        if (!$item->wasChanged('is_available')) {
            return;
        }
        try {
            app(BackInStockAutoPoster::class)->itemChanged($item);
        } catch (\Throwable $e) {
            Log::warning('social: back-in-stock hook failed', ['item_id' => $item->id, 'error' => $e->getMessage()]);
        }
    }

    public function deleting(Item $item): void
    {
        $mainUrls = array_filter([
            $item->image_url,
            $item->image_original_url,
            $item->getAttribute('thumb_url'),
        ], static fn ($u) => is_string($u) && $u !== '');

        foreach ($mainUrls as $url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $url,
                keepUrls: [],
                exceptItemId: (int) $item->id,
            );
        }

        // Soft-delete does not cascade; delete photos so their observers run.
        foreach ($item->photos()->get() as $photo) {
            $photo->delete();
        }
    }
}
