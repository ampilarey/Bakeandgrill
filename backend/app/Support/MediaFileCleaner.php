<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Media;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Safe deletion of owned /storage/ menu media. Never removes seed assets,
 * external URLs, or files still referenced by another item/photo/category row.
 */
final class MediaFileCleaner
{
    /**
     * Resolve a public-disk relative path from a stored media URL.
     * Returns null for empty, external, or non-/storage/ URLs.
     */
    public static function storagePathFromUrl(?string $url): ?string
    {
        if ($url === null || $url === '') {
            return null;
        }

        $trimmed = trim($url);

        if (str_starts_with($trimmed, '/storage/')) {
            return ltrim(substr($trimmed, strlen('/storage/')), '/');
        }

        $diskUrl = rtrim(Storage::disk('public')->url('/'), '/');
        if ($diskUrl !== '' && str_starts_with($trimmed, $diskUrl)) {
            return ltrim(substr($trimmed, strlen($diskUrl)), '/');
        }

        $path = parse_url($trimmed, PHP_URL_PATH);
        if (is_string($path) && str_starts_with($path, '/storage/')) {
            return ltrim(substr($path, strlen('/storage/')), '/');
        }

        return null;
    }

    /**
     * True when the URL points at an owned public-disk upload (not seed / external).
     */
    public static function isOwnedUpload(?string $url): bool
    {
        $path = self::storagePathFromUrl($url);
        if ($path === null || $path === '') {
            return false;
        }

        // Seed cafe imagery lives under public/images/cafe — never under /storage/.
        if (str_starts_with($path, 'images/cafe/') || str_contains($path, '/images/cafe/')) {
            return false;
        }

        return true;
    }

    /**
     * Whether any item, photo, category, site_settings, or media_assets row
     * still references this exact URL string.
     *
     * @param list<string> $keepUrls
     * @param list<int> $exceptSiteSettingIds
     */
    public static function isReferenced(
        string $url,
        array $keepUrls = [],
        ?int $exceptPhotoId = null,
        ?int $exceptItemId = null,
        ?int $exceptCategoryId = null,
        array $exceptSiteSettingIds = [],
    ): bool {
        foreach ($keepUrls as $keep) {
            if (is_string($keep) && $keep !== '' && $keep === $url) {
                return true;
            }
        }

        $itemQuery = Item::query()
            ->where(function ($q) use ($url): void {
                $q->where('image_url', $url)
                    ->orWhere('image_original_url', $url);
                if (Schema::hasColumn('items', 'thumb_url')) {
                    $q->orWhere('thumb_url', $url);
                }
            });
        if ($exceptItemId !== null) {
            $itemQuery->where('id', '!=', $exceptItemId);
        }
        if ($itemQuery->exists()) {
            return true;
        }

        $photoQuery = ItemPhoto::query()
            ->where(function ($q) use ($url): void {
                $q->where('url', $url)
                    ->orWhere('original_url', $url);
                if (Schema::hasColumn('item_photos', 'thumb_url')) {
                    $q->orWhere('thumb_url', $url);
                }
                if (Schema::hasColumn('item_photos', 'poster_url')) {
                    $q->orWhere('poster_url', $url);
                }
            });
        if ($exceptPhotoId !== null) {
            $photoQuery->where('id', '!=', $exceptPhotoId);
        }
        if ($photoQuery->exists()) {
            return true;
        }

        if (Schema::hasTable('categories')) {
            $categoryQuery = Category::query()
                ->where(function ($q) use ($url): void {
                    $q->where('image_url', $url);
                    if (Schema::hasColumn('categories', 'image_original_url')) {
                        $q->orWhere('image_original_url', $url);
                    }
                    if (Schema::hasColumn('categories', 'thumb_url')) {
                        $q->orWhere('thumb_url', $url);
                    }
                });
            if ($exceptCategoryId !== null) {
                $categoryQuery->where('id', '!=', $exceptCategoryId);
            }
            if ($categoryQuery->exists()) {
                return true;
            }
        }

        if (Schema::hasTable('site_settings')) {
            // Exact match (image keys) or JSON embed (hero_slides, categories, …).
            // json_encode may escape slashes as \/ — match both forms.
            $jsonEscaped = str_replace('/', '\\/', $url);
            $likes = [
                '%' . addcslashes($url, '%_\\') . '%',
                '%' . addcslashes($jsonEscaped, '%_\\') . '%',
            ];
            $settingsQuery = SiteSetting::query()->where(function ($q) use ($url, $likes): void {
                $q->where('value', $url);
                foreach ($likes as $like) {
                    $q->orWhere('value', 'like', $like);
                }
            });
            if ($exceptSiteSettingIds !== []) {
                $settingsQuery->whereNotIn('id', $exceptSiteSettingIds);
            }
            if ($settingsQuery->exists()) {
                return true;
            }
        }

        if (Schema::hasTable('media_assets')) {
            $path = self::storagePathFromUrl($url);
            $mediaQuery = Media::query()->where(function ($q) use ($url, $path): void {
                $q->where('thumb_url', $url)
                    ->orWhere('original_url', $url);
                if (is_string($path) && $path !== '') {
                    $q->orWhere('path', $path)
                        ->orWhere('path', '/' . ltrim($path, '/'));
                }
            });
            if ($mediaQuery->exists()) {
                return true;
            }
        }

        return false;
    }

    /**
     * Delete the file from the public disk only when it is an owned upload
     * and no other row (outside the except* exclusions) still references it.
     *
     * @param list<string> $keepUrls
     */
    /**
     * @param list<string> $keepUrls
     * @param list<int> $exceptSiteSettingIds
     */
    public static function deleteIfOwnedAndUnreferenced(
        ?string $url,
        array $keepUrls = [],
        ?int $exceptPhotoId = null,
        ?int $exceptItemId = null,
        ?int $exceptCategoryId = null,
        array $exceptSiteSettingIds = [],
    ): bool {
        if (!self::isOwnedUpload($url)) {
            return false;
        }

        /** @var string $url */
        if (self::isReferenced($url, $keepUrls, $exceptPhotoId, $exceptItemId, $exceptCategoryId, $exceptSiteSettingIds)) {
            return false;
        }

        $path = self::storagePathFromUrl($url);
        if ($path === null) {
            return false;
        }

        return Storage::disk('public')->delete($path);
    }
}
