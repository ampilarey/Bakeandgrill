<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Services\MenuImageProcessor;
use App\Support\MediaFileCleaner;
use Illuminate\Console\Command;

class GenerateMenuThumbnails extends Command
{
    protected $signature = 'menu:generate-thumbnails {--dry-run : List rows that would be updated without writing}';

    protected $description = 'Backfill thumb_url for items, item_photos, and categories that have a crop but no thumbnail';

    public function handle(MenuImageProcessor $processor): int
    {
        $dry = (bool) $this->option('dry-run');
        $updated = 0;
        $skipped = 0;
        $failed = 0;

        Item::query()
            ->whereNotNull('image_url')
            ->where(function ($q): void {
                $q->whereNull('thumb_url')->orWhere('thumb_url', '');
            })
            ->orderBy('id')
            ->chunkById(50, function ($items) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($items as $item) {
                    $path = MediaFileCleaner::storagePathFromUrl($item->image_url);
                    if ($path === null) {
                        $skipped++;

                        continue;
                    }
                    if ($dry) {
                        $this->line("[dry-run] item #{$item->id} ← {$path}");
                        $updated++;

                        continue;
                    }
                    try {
                        $thumbRel = $processor->storeThumbnailFromStoragePath($path);
                        $item->update(['thumb_url' => '/storage/'.ltrim($thumbRel, '/')]);
                        $updated++;
                    } catch (\Throwable $e) {
                        $failed++;
                        $this->warn("item #{$item->id}: {$e->getMessage()}");
                    }
                }
            });

        ItemPhoto::query()
            ->whereNotNull('url')
            ->where(function ($q): void {
                $q->whereNull('thumb_url')->orWhere('thumb_url', '');
            })
            ->orderBy('id')
            ->chunkById(50, function ($photos) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($photos as $photo) {
                    $path = MediaFileCleaner::storagePathFromUrl($photo->url);
                    if ($path === null) {
                        $skipped++;

                        continue;
                    }
                    if ($dry) {
                        $this->line("[dry-run] photo #{$photo->id} ← {$path}");
                        $updated++;

                        continue;
                    }
                    try {
                        $thumbRel = $processor->storeThumbnailFromStoragePath(
                            $path,
                            "item-photos/{$photo->item_id}/thumbs",
                        );
                        $photo->update(['thumb_url' => '/storage/'.ltrim($thumbRel, '/')]);
                        $updated++;
                    } catch (\Throwable $e) {
                        $failed++;
                        $this->warn("photo #{$photo->id}: {$e->getMessage()}");
                    }
                }
            });

        Category::query()
            ->whereNotNull('image_url')
            ->where(function ($q): void {
                $q->whereNull('thumb_url')->orWhere('thumb_url', '');
            })
            ->orderBy('id')
            ->chunkById(50, function ($categories) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($categories as $category) {
                    $path = MediaFileCleaner::storagePathFromUrl($category->image_url);
                    if ($path === null) {
                        $skipped++;

                        continue;
                    }
                    if ($dry) {
                        $this->line("[dry-run] category #{$category->id} ← {$path}");
                        $updated++;

                        continue;
                    }
                    try {
                        $thumbRel = $processor->storeThumbnailFromStoragePath($path);
                        $category->update(['thumb_url' => '/storage/'.ltrim($thumbRel, '/')]);
                        $updated++;
                    } catch (\Throwable $e) {
                        $failed++;
                        $this->warn("category #{$category->id}: {$e->getMessage()}");
                    }
                }
            });

        $this->info("Thumbnails: updated={$updated} skipped={$skipped} failed={$failed}".($dry ? ' (dry-run)' : ''));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
