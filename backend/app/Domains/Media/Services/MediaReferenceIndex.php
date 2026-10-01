<?php

declare(strict_types=1);

namespace App\Domains\Media\Services;

use App\Support\MediaFileCleaner;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every file on the public disk that something still points at (media audit,
 * 2026-10-01).
 *
 * The weekly prune used to look at items, gallery photos and categories only.
 * The per-delete check also looked at the Media Library, the site settings
 * (logo, hero slides, page blocks) and TV signage. So the two disagreed: a
 * photo kept by the delete check because a hero slide used it was removed by
 * the prune a week later, and the slide showed a broken picture. Both now
 * read the same index.
 *
 * Columns that hold one URL or path are listed; text and JSON columns that
 * can carry URLs inside them are scanned for "/storage/..." strings. A table
 * or column that does not exist is skipped, so this works on every
 * migration state the tests run at.
 */
final class MediaReferenceIndex
{
    /** @var array<string, list<string>> table => columns holding one URL or path */
    public const COLUMNS = [
        'items' => ['image_url', 'image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url', 'cutout_url', 'cutout_webp_url'],
        'item_photos' => ['url', 'original_url', 'thumb_url', 'poster_url', 'image_webp_url', 'thumb_webp_url'],
        'categories' => ['image_url', 'image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url', 'cutout_url', 'cutout_webp_url'],
        'media_assets' => ['path', 'thumb_url', 'original_url', 'image_webp_url', 'thumb_webp_url'],
        'media_asset_versions' => ['path'],
        'orders' => ['proof_of_delivery_path'],
        'inventory_items' => ['photo_path'],
        'inventory_brand_photos' => ['file_path'],
        'kitchen_production_attachments' => ['file_path'],
        'purchase_request_attachments' => ['file_path'],
        'purchase_receipts' => ['file_path'],
        'expenses' => ['receipt_path'],
        'social_video_renditions' => ['path', 'poster_path'],
    ];

    /** @var array<string, list<string>> table => text or JSON columns with URLs inside */
    public const BLOBS = [
        'site_settings' => ['value'],
        'signage_playlists' => ['slides', 'theme', 'layout'],
        'signage_groups' => ['theme', 'layout', 'fallback', 'overrides'],
        'signage_screens' => ['theme', 'layout', 'fallback', 'overrides'],
        'signage_campaigns' => ['slides'],
        'page_blocks' => ['settings'],
        'page_block_shared_contents' => ['settings'],
        'page_layout_drafts' => ['payload'],
        'content_drafts' => ['value'],
        'content_revisions' => ['value'],
        // A drafted, scheduled or awaiting-approval post names the picture
        // it will go out with (Social Hub audit, 2026-10-01).
        'social_posts' => ['snapshot'],
    ];

    /**
     * @return array<string, true> storage-relative paths, e.g. "menu/abc.jpg"
     */
    public function build(): array
    {
        $paths = [];
        $remember = static function (?string $raw) use (&$paths): void {
            $path = self::normalise($raw);
            if ($path !== null) {
                $paths[$path] = true;
            }
        };

        foreach (self::COLUMNS as $table => $columns) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            $present = array_values(array_filter($columns, static fn (string $c): bool => Schema::hasColumn($table, $c)));
            if ($present === []) {
                continue;
            }
            DB::table($table)->select($present)->orderBy(DB::raw('1'))->chunk(500, function ($rows) use ($present, $remember): void {
                foreach ($rows as $row) {
                    foreach ($present as $col) {
                        $remember(is_string($row->{$col}) ? $row->{$col} : null);
                    }
                }
            });
        }

        foreach (self::BLOBS as $table => $columns) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            $present = array_values(array_filter($columns, static fn (string $c): bool => Schema::hasColumn($table, $c)));
            if ($present === []) {
                continue;
            }
            DB::table($table)->select($present)->orderBy(DB::raw('1'))->chunk(200, function ($rows) use ($present, $remember): void {
                foreach ($rows as $row) {
                    foreach ($present as $col) {
                        $value = $row->{$col};
                        if (!is_string($value) || $value === '') {
                            continue;
                        }
                        foreach (self::storagePathsIn($value) as $found) {
                            $remember($found);
                        }
                    }
                }
            });
        }

        return $paths;
    }

    /**
     * Every "/storage/..." path inside a text or JSON blob, with JSON's
     * escaped slashes undone first.
     *
     * @return list<string>
     */
    public static function storagePathsIn(string $blob): array
    {
        $blob = str_replace('\\/', '/', $blob);
        if (!preg_match_all('#/storage/([A-Za-z0-9_./%\-]+)#', $blob, $m)) {
            return [];
        }

        return array_values(array_unique($m[1]));
    }

    /**
     * A column value as a storage-relative path: a full URL, a "/storage/..."
     * URL, or a bare relative path as the attachment tables store them.
     */
    public static function normalise(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $raw = trim($raw);
        if ($raw === '') {
            return null;
        }

        $path = MediaFileCleaner::storagePathFromUrl($raw);
        if ($path === null) {
            if (preg_match('#^[a-z]+://#i', $raw) === 1 || str_starts_with($raw, '/') || str_starts_with($raw, 'data:')) {
                return null; // some other site's URL, or a public/ asset
            }
            $path = $raw;
        }

        $path = (string) (parse_url($path, PHP_URL_PATH) ?? $path);
        $path = rawurldecode(ltrim(str_replace('\\', '/', $path), '/'));

        return $path === '' ? null : $path;
    }
}
