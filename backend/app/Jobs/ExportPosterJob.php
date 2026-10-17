<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Posters\PosterPack;
use App\Models\PosterExport;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Renders a poster's ZIP off the request (docs/POSTER_PLAN.md § 12.5).
 * An A2 with a large photo is too much for a web request on shared hosting.
 */
class ExportPosterJob implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $exportId) {}

    public function handle(): void
    {
        $export = PosterExport::query()->with('poster')->find($this->exportId);
        if ($export === null || $export->poster === null) {
            return;
        }
        try {
            $result = PosterPack::make($export->poster, $export->request ?? []);
            if ($result['blocked']) {
                $export->update([
                    'status' => 'failed',
                    'preflight' => $result['preflight'],
                    'error' => 'Preflight failed. Fix the red checks and try again.',
                ]);

                return;
            }
            $dir = storage_path('app/posters/exports');
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }
            $path = $dir . '/' . $export->id . '.zip';
            file_put_contents($path, $result['bytes']);
            $export->poster->update(['state' => 'ready', 'version' => $export->poster->version + 1]);
            $export->update([
                'status' => 'ready',
                'preflight' => $result['preflight'],
                'zip_path' => $path,
                'bytes' => strlen($result['bytes']),
                'error' => null,
            ]);
        } catch (Throwable $e) {
            $export->update(['status' => 'failed', 'error' => $e->getMessage()]);
        }
    }
}
