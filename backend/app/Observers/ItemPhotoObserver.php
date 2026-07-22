<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\ItemPhoto;
use App\Support\MediaFileCleaner;

/**
 * Removes owned disk files when a gallery photo row is deleted,
 * unless another item/photo still references the same path.
 */
class ItemPhotoObserver
{
    public function deleting(ItemPhoto $photo): void
    {
        $urls = array_filter([
            $photo->url,
            $photo->original_url,
            $photo->getAttribute('thumb_url'),
            $photo->getAttribute('poster_url'),
        ], static fn ($u) => is_string($u) && $u !== '');

        foreach ($urls as $url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $url,
                keepUrls: [],
                exceptPhotoId: (int) $photo->id,
            );
        }
    }
}
