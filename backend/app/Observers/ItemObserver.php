<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Item;
use App\Support\MediaFileCleaner;

/**
 * On item soft-delete: remove owned main-image files and delete gallery
 * photo rows so {@see ItemPhotoObserver} cleans their files too.
 *
 * SoftDeletes does not fire FK cascadeOnDelete, so photos must be
 * deleted explicitly here (files cannot be restored after cleanup).
 */
class ItemObserver
{
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
