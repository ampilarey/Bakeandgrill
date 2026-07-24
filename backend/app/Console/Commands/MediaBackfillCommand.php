<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Media\Services\MediaLibraryService;
use Illuminate\Console\Command;

class MediaBackfillCommand extends Command
{
    protected $signature = 'media:backfill';

    protected $description = 'Catalog existing public-disk media into media_assets (idempotent)';

    public function handle(MediaLibraryService $library): int
    {
        $result = $library->reconcile();
        $this->info(sprintf(
            'Scanned %d files; created %d; skipped %d; thumbs fixed %d.',
            $result['scanned'],
            $result['created'],
            $result['skipped'],
            $result['thumbs_fixed'] ?? 0,
        ));

        return self::SUCCESS;
    }
}
