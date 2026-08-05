<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Media;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use App\Support\MediaFileCleaner;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

/**
 * Backfill WebP sidecars from existing JPEG crop/thumb renditions.
 * Never uses image_original_url / masters — those are full-frame and would change framing.
 */
class GenerateMenuWebp extends Command
{
    protected $signature = 'menu:generate-webp {--dry-run : List rows that would be updated without writing}';

    protected $description = 'Backfill image_webp_url / thumb_webp_url from existing JPEG crops and thumbs';

    public function handle(MenuImageProcessor $processor): int
    {
        if (!ImageCapabilities::supportsWebp()) {
            $this->warn('WebP is not supported on this server (imagewebp missing). Nothing to do.');

            return self::SUCCESS;
        }

        $dry = (bool) $this->option('dry-run');
        $updated = 0;
        $skipped = 0;
        $failed = 0;

        $this->backfillItems($processor, $dry, $updated, $skipped, $failed);
        $this->backfillPhotos($processor, $dry, $updated, $skipped, $failed);
        $this->backfillCategories($processor, $dry, $updated, $skipped, $failed);
        $this->backfillMediaAssets($processor, $dry, $updated, $skipped, $failed);

        $this->info("WebP: updated={$updated} skipped={$skipped} failed={$failed}" . ($dry ? ' (dry-run)' : ''));

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function backfillItems(
        MenuImageProcessor $processor,
        bool $dry,
        int &$updated,
        int &$skipped,
        int &$failed,
    ): void {
        Item::query()
            ->where(function ($q): void {
                $q->where(function ($inner): void {
                    $inner->whereNotNull('image_url')
                        ->where(function ($w): void {
                            $w->whereNull('image_webp_url')->orWhere('image_webp_url', '');
                        });
                })->orWhere(function ($inner): void {
                    $inner->whereNotNull('thumb_url')
                        ->where(function ($w): void {
                            $w->whereNull('thumb_webp_url')->orWhere('thumb_webp_url', '');
                        });
                });
            })
            ->orderBy('id')
            ->chunkById(50, function ($items) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($items as $item) {
                    $this->fillEntityWebp(
                        label: "item #{$item->id}",
                        cropUrl: $item->image_url,
                        thumbUrl: $item->thumb_url,
                        hasImageWebp: is_string($item->image_webp_url) && $item->image_webp_url !== '',
                        hasThumbWebp: is_string($item->thumb_webp_url) && $item->thumb_webp_url !== '',
                        processor: $processor,
                        dry: $dry,
                        updated: $updated,
                        skipped: $skipped,
                        failed: $failed,
                        persist: function (?string $imageWebp, ?string $thumbWebp) use ($item): void {
                            $data = [];
                            if ($imageWebp !== null) {
                                $data['image_webp_url'] = $imageWebp;
                            }
                            if ($thumbWebp !== null) {
                                $data['thumb_webp_url'] = $thumbWebp;
                            }
                            if ($data !== []) {
                                $item->update($data);
                            }
                        },
                    );
                }
            });
    }

    private function backfillPhotos(
        MenuImageProcessor $processor,
        bool $dry,
        int &$updated,
        int &$skipped,
        int &$failed,
    ): void {
        ItemPhoto::query()
            ->where(function ($q): void {
                $q->whereNull('media_type')->orWhere('media_type', 'image');
            })
            ->where(function ($q): void {
                $q->where(function ($inner): void {
                    $inner->whereNotNull('url')
                        ->where(function ($w): void {
                            $w->whereNull('image_webp_url')->orWhere('image_webp_url', '');
                        });
                })->orWhere(function ($inner): void {
                    $inner->whereNotNull('thumb_url')
                        ->where(function ($w): void {
                            $w->whereNull('thumb_webp_url')->orWhere('thumb_webp_url', '');
                        });
                });
            })
            ->orderBy('id')
            ->chunkById(50, function ($photos) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($photos as $photo) {
                    $this->fillEntityWebp(
                        label: "photo #{$photo->id}",
                        cropUrl: $photo->url,
                        thumbUrl: $photo->thumb_url,
                        hasImageWebp: is_string($photo->image_webp_url) && $photo->image_webp_url !== '',
                        hasThumbWebp: is_string($photo->thumb_webp_url) && $photo->thumb_webp_url !== '',
                        processor: $processor,
                        dry: $dry,
                        updated: $updated,
                        skipped: $skipped,
                        failed: $failed,
                        persist: function (?string $imageWebp, ?string $thumbWebp) use ($photo): void {
                            $data = [];
                            if ($imageWebp !== null) {
                                $data['image_webp_url'] = $imageWebp;
                            }
                            if ($thumbWebp !== null) {
                                $data['thumb_webp_url'] = $thumbWebp;
                            }
                            if ($data !== []) {
                                $photo->update($data);
                            }
                        },
                    );
                }
            });
    }

    private function backfillCategories(
        MenuImageProcessor $processor,
        bool $dry,
        int &$updated,
        int &$skipped,
        int &$failed,
    ): void {
        Category::query()
            ->where(function ($q): void {
                $q->where(function ($inner): void {
                    $inner->whereNotNull('image_url')
                        ->where(function ($w): void {
                            $w->whereNull('image_webp_url')->orWhere('image_webp_url', '');
                        });
                })->orWhere(function ($inner): void {
                    $inner->whereNotNull('thumb_url')
                        ->where(function ($w): void {
                            $w->whereNull('thumb_webp_url')->orWhere('thumb_webp_url', '');
                        });
                });
            })
            ->orderBy('id')
            ->chunkById(50, function ($categories) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($categories as $category) {
                    $this->fillEntityWebp(
                        label: "category #{$category->id}",
                        cropUrl: $category->image_url,
                        thumbUrl: $category->thumb_url,
                        hasImageWebp: is_string($category->image_webp_url) && $category->image_webp_url !== '',
                        hasThumbWebp: is_string($category->thumb_webp_url) && $category->thumb_webp_url !== '',
                        processor: $processor,
                        dry: $dry,
                        updated: $updated,
                        skipped: $skipped,
                        failed: $failed,
                        persist: function (?string $imageWebp, ?string $thumbWebp) use ($category): void {
                            $data = [];
                            if ($imageWebp !== null) {
                                $data['image_webp_url'] = $imageWebp;
                            }
                            if ($thumbWebp !== null) {
                                $data['thumb_webp_url'] = $thumbWebp;
                            }
                            if ($data !== []) {
                                $category->update($data);
                            }
                        },
                    );
                }
            });
    }

    private function backfillMediaAssets(
        MenuImageProcessor $processor,
        bool $dry,
        int &$updated,
        int &$skipped,
        int &$failed,
    ): void {
        if (!Schema::hasTable('media_assets') || !Schema::hasColumn('media_assets', 'image_webp_url')) {
            return;
        }

        Media::query()
            ->where('media_type', 'image')
            ->where(function ($q): void {
                $q->where(function ($inner): void {
                    $inner->whereNotNull('path')
                        ->where(function ($w): void {
                            $w->whereNull('image_webp_url')->orWhere('image_webp_url', '');
                        });
                })->orWhere(function ($inner): void {
                    $inner->whereNotNull('thumb_url')
                        ->where(function ($w): void {
                            $w->whereNull('thumb_webp_url')->orWhere('thumb_webp_url', '');
                        });
                });
            })
            ->orderBy('id')
            ->chunkById(50, function ($rows) use ($processor, $dry, &$updated, &$skipped, &$failed): void {
                foreach ($rows as $row) {
                    $cropUrl = '/storage/' . ltrim((string) $row->path, '/');
                    $this->fillEntityWebp(
                        label: "media #{$row->id}",
                        cropUrl: $cropUrl,
                        thumbUrl: $row->thumb_url,
                        hasImageWebp: is_string($row->image_webp_url) && $row->image_webp_url !== '',
                        hasThumbWebp: is_string($row->thumb_webp_url) && $row->thumb_webp_url !== '',
                        processor: $processor,
                        dry: $dry,
                        updated: $updated,
                        skipped: $skipped,
                        failed: $failed,
                        persist: function (?string $imageWebp, ?string $thumbWebp) use ($row): void {
                            $data = [];
                            if ($imageWebp !== null) {
                                $data['image_webp_url'] = $imageWebp;
                            }
                            if ($thumbWebp !== null) {
                                $data['thumb_webp_url'] = $thumbWebp;
                            }
                            if ($data !== []) {
                                $row->update($data);
                            }
                        },
                    );
                }
            });
    }

    /**
     * @param  callable(?string, ?string): void  $persist
     */
    private function fillEntityWebp(
        string $label,
        ?string $cropUrl,
        ?string $thumbUrl,
        bool $hasImageWebp,
        bool $hasThumbWebp,
        MenuImageProcessor $processor,
        bool $dry,
        int &$updated,
        int &$skipped,
        int &$failed,
        callable $persist,
    ): void {
        $imageWebp = null;
        $thumbWebp = null;
        $didWork = false;

        if (!$hasImageWebp && is_string($cropUrl) && $cropUrl !== '') {
            $path = MediaFileCleaner::storagePathFromUrl($cropUrl);
            if ($path === null) {
                $skipped++;
            } elseif ($dry) {
                $this->line("[dry-run] {$label} image_webp ← {$path}");
                $didWork = true;
            } else {
                try {
                    $rel = $processor->storeWebpFromStoragePath($path);
                    if ($rel !== null) {
                        $imageWebp = '/storage/' . ltrim($rel, '/');
                        $didWork = true;
                    } else {
                        $skipped++;
                    }
                } catch (\Throwable $e) {
                    $failed++;
                    $this->warn("{$label} image: {$e->getMessage()}");
                }
            }
        }

        if (!$hasThumbWebp && is_string($thumbUrl) && $thumbUrl !== '') {
            $path = MediaFileCleaner::storagePathFromUrl($thumbUrl);
            if ($path === null) {
                $skipped++;
            } elseif ($dry) {
                $this->line("[dry-run] {$label} thumb_webp ← {$path}");
                $didWork = true;
            } else {
                try {
                    $rel = $processor->storeWebpFromStoragePath($path, dirname($path));
                    if ($rel !== null) {
                        $thumbWebp = '/storage/' . ltrim($rel, '/');
                        $didWork = true;
                    } else {
                        $skipped++;
                    }
                } catch (\Throwable $e) {
                    $failed++;
                    $this->warn("{$label} thumb: {$e->getMessage()}");
                }
            }
        }

        if ($dry) {
            if ($didWork) {
                $updated++;
            }

            return;
        }

        if ($imageWebp !== null || $thumbWebp !== null) {
            $persist($imageWebp, $thumbWebp);
            $updated++;
        }
    }
}
