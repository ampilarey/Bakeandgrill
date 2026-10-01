<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Media\Services\MediaReferenceIndex;
use App\Models\Media;
use App\Models\MediaAssetVersion;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Delete files on the public disk that nothing points at any more.
 *
 * Media audit, 2026-10-01: this used to scan four folders and consult three
 * tables, so it both deleted pictures still used by a hero slide or the
 * Media Library, and never touched orphans in any other folder. It now scans
 * every folder the app writes, against the one reference index the delete
 * path also uses (MediaReferenceIndex), and removes the Media Library row
 * along with a file so the library never shows a broken tile for it.
 *
 * It also applies the delivery-proof retention: a proof photo is the
 * customer's door, and there is no reason to keep it past the time a
 * delivery could be disputed.
 */
class PruneUnreferencedMedia extends Command
{
    protected $signature = 'media:prune-unreferenced
        {--days=7 : Only delete files older than this many days}
        {--proof-days=90 : Remove delivery proof photos from orders delivered longer ago than this}
        {--dry-run : List candidates without deleting}';

    protected $description = 'Prune unreferenced media files from the public disk';

    /** Top-level folders the app writes. Anything else is left alone and reported. */
    public const KNOWN_FOLDERS = [
        'menu', 'menu-banners', 'menu-masters', 'menu-cutouts', 'thumbs', 'webp',
        'item-photos', 'item_photos', 'content', 'site', 'library',
        'inventory-photos', 'brand-photos', 'delivery-proofs',
        'kitchen-production', 'kitchen-receiving', 'purchase-requests', 'purchase-receipts', 'expense-receipts',
        'social-cards', 'social-videos',
    ];

    /** Rebuilt on demand, so they are only ever a cache. */
    private const CACHE_FOLDERS = ['social-cards', 'thumbs/images'];

    private const CACHE_DAYS = 30;

    public function handle(MediaReferenceIndex $index): int
    {
        $days = max(0, (int) $this->option('days'));
        $dry = (bool) $this->option('dry-run');
        $cutoff = Carbon::now()->subDays($days)->getTimestamp();
        $cacheCutoff = Carbon::now()->subDays(self::CACHE_DAYS)->getTimestamp();
        $disk = Storage::disk('public');

        $proofs = $this->expireDeliveryProofs(max(0, (int) $this->option('proof-days')), $dry);

        $referenced = $index->build();
        $deleted = 0;
        $skipped = 0;
        $unknown = [];

        foreach ($disk->directories('') as $folder) {
            $folder = trim($folder, '/');
            if (!in_array($folder, self::KNOWN_FOLDERS, true)) {
                $unknown[] = $folder;

                continue;
            }

            foreach ($disk->allFiles($folder) as $path) {
                if (basename($path) === '.htaccess' || basename($path) === '.gitignore') {
                    continue;
                }
                // A cache file is rebuilt on demand, but a scheduled social
                // post may still point at one: anything referenced stays.
                $isCache = $this->isCache($path);
                if (isset($referenced[$path])) {
                    $skipped++;

                    continue;
                }
                if ($disk->lastModified($path) > ($isCache ? $cacheCutoff : $cutoff)) {
                    $skipped++;

                    continue;
                }
                if ($dry) {
                    $this->line("[dry-run] would delete {$path}");
                } else {
                    $disk->delete($path);
                    $this->forgetRows($path);
                }
                $deleted++;
            }
        }

        if ($unknown !== []) {
            $this->warn('Left alone (not a folder this app writes): ' . implode(', ', $unknown));
        }

        $this->info(sprintf(
            'Prune complete: deleted=%d skipped=%d proofs_expired=%d%s',
            $deleted,
            $skipped,
            $proofs,
            $dry ? ' (dry-run)' : '',
        ));

        return self::SUCCESS;
    }

    private function isCache(string $path): bool
    {
        foreach (self::CACHE_FOLDERS as $prefix) {
            if (str_starts_with($path, $prefix . '/')) {
                return true;
            }
        }

        return false;
    }

    /** A Media Library row (or an edit version) for a file that is now gone. */
    private function forgetRows(string $path): void
    {
        if (Schema::hasTable('media_asset_versions')) {
            MediaAssetVersion::query()->where('path', $path)->delete();
        }
        if (Schema::hasTable('media_assets')) {
            Media::query()->where('path', $path)->delete();
        }
    }

    private function expireDeliveryProofs(int $proofDays, bool $dry): int
    {
        if ($proofDays <= 0 || !Schema::hasColumn('orders', 'proof_of_delivery_path')) {
            return 0;
        }

        $before = Carbon::now()->subDays($proofDays);
        $count = 0;
        Order::query()
            ->whereNotNull('proof_of_delivery_path')
            ->where(fn ($q) => $q->where('delivered_at', '<', $before)
                ->orWhere(fn ($q2) => $q2->whereNull('delivered_at')->where('updated_at', '<', $before)))
            ->orderBy('id')
            ->chunkById(200, function ($orders) use ($dry, &$count): void {
                foreach ($orders as $order) {
                    $path = ltrim((string) $order->proof_of_delivery_path, '/');
                    if ($dry) {
                        $this->line("[dry-run] would expire delivery proof for order #{$order->id}");
                    } else {
                        if ($path !== '' && Storage::disk('public')->exists($path)) {
                            Storage::disk('public')->delete($path);
                        }
                        Order::query()->whereKey($order->id)->update(['proof_of_delivery_path' => null]);
                    }
                    $count++;
                }
            });

        return $count;
    }
}
