<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Category;
use App\Support\MediaFileCleaner;

/**
 * Removes owned disk files when a category is deleted,
 * unless another item/photo/category still references the same path.
 */
class CategoryObserver
{
    public function deleting(Category $category): void
    {
        $urls = array_filter([
            $category->image_url,
            $category->getAttribute('image_original_url'),
            $category->getAttribute('thumb_url'),
        ], static fn ($u) => is_string($u) && $u !== '');

        foreach ($urls as $url) {
            MediaFileCleaner::deleteIfOwnedAndUnreferenced(
                $url,
                keepUrls: [],
                exceptCategoryId: (int) $category->id,
            );
        }
    }
}
