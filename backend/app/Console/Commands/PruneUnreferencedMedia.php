<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Support\MediaFileCleaner;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Delete orphaned files under menu media directories that are not referenced
 * by any items/item_photos row and are older than N days.
 */
class PruneUnreferencedMedia extends Command
{
    protected $signature = 'media:prune-unreferenced
        {--days=7 : Only delete files older than this many days}
        {--dry-run : List candidates without deleting}';

    protected $description = 'Prune unreferenced menu media files from the public disk';

    /** @var list<string> */
    private const SCAN_PREFIXES = [
        'menu/',
        'menu-masters/',
        'thumbs/',
        'item-photos/',
    ];

    public function handle(): int
    {
        $days = max(0, (int) $this->option('days'));
        $dry = (bool) $this->option('dry-run');
        $cutoff = Carbon::now()->subDays($days)->getTimestamp();

        $referenced = $this->collectReferencedPaths();
        $deleted = 0;
        $skipped = 0;

        foreach (self::SCAN_PREFIXES as $prefix) {
            if (!Storage::disk('public')->exists(rtrim($prefix, '/'))) {
                continue;
            }
            foreach (Storage::disk('public')->allFiles(rtrim($prefix, '/')) as $path) {
                if (isset($referenced[$path])) {
                    $skipped++;

                    continue;
                }
                $lastModified = Storage::disk('public')->lastModified($path);
                if ($lastModified > $cutoff) {
                    $skipped++;

                    continue;
                }
                if ($dry) {
                    $this->line("[dry-run] would delete {$path}");
                } else {
                    Storage::disk('public')->delete($path);
                }
                $deleted++;
            }
        }

        $this->info("Prune complete: deleted={$deleted} skipped={$skipped}" . ($dry ? ' (dry-run)' : ''));

        return self::SUCCESS;
    }

    /** @return array<string, true> */
    private function collectReferencedPaths(): array
    {
        $paths = [];

        $remember = static function (?string $url) use (&$paths): void {
            $path = MediaFileCleaner::storagePathFromUrl($url);
            if ($path !== null) {
                $paths[$path] = true;
            }
        };

        $itemCols = ['id', 'image_url', 'image_original_url'];
        foreach (['thumb_url', 'image_webp_url', 'thumb_webp_url'] as $col) {
            if (Schema::hasColumn('items', $col)) {
                $itemCols[] = $col;
            }
        }
        Item::query()->select($itemCols)->orderBy('id')
            ->chunkById(200, function ($items) use ($remember): void {
                foreach ($items as $item) {
                    $remember($item->image_url);
                    $remember($item->image_original_url);
                    $remember($item->getAttribute('thumb_url'));
                    $remember($item->getAttribute('image_webp_url'));
                    $remember($item->getAttribute('thumb_webp_url'));
                }
            });

        $photoCols = ['id', 'url', 'original_url'];
        foreach (['thumb_url', 'poster_url', 'image_webp_url', 'thumb_webp_url'] as $col) {
            if (Schema::hasColumn('item_photos', $col)) {
                $photoCols[] = $col;
            }
        }
        ItemPhoto::query()->select($photoCols)->orderBy('id')
            ->chunkById(200, function ($photos) use ($remember): void {
                foreach ($photos as $photo) {
                    $remember($photo->url);
                    $remember($photo->original_url);
                    $remember($photo->getAttribute('thumb_url'));
                    $remember($photo->getAttribute('poster_url'));
                    $remember($photo->getAttribute('image_webp_url'));
                    $remember($photo->getAttribute('thumb_webp_url'));
                }
            });

        $categoryCols = ['id', 'image_url'];
        foreach (['image_original_url', 'thumb_url', 'image_webp_url', 'thumb_webp_url'] as $col) {
            if (Schema::hasColumn('categories', $col)) {
                $categoryCols[] = $col;
            }
        }
        Category::query()->select($categoryCols)->orderBy('id')
            ->chunkById(200, function ($categories) use ($remember): void {
                foreach ($categories as $category) {
                    $remember($category->image_url);
                    $remember($category->getAttribute('image_original_url'));
                    $remember($category->getAttribute('thumb_url'));
                    $remember($category->getAttribute('image_webp_url'));
                    $remember($category->getAttribute('thumb_webp_url'));
                }
            });

        return $paths;
    }
}
