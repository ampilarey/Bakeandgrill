<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Posters\PosterOrders;
use App\Domains\Posters\PosterPack;
use App\Domains\Posters\PosterStaleness;
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

    /** @param ?int $orderId a print-shop order waiting for this file (PosterOrders::exportFinished) */
    public function __construct(public int $exportId, public ?int $orderId = null) {}

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
                if ($this->orderId !== null) {
                    PosterOrders::exportFailed($this->orderId, 'a red preflight check');
                }

                return;
            }
            $dir = (string) config('posters.export_dir', storage_path('app/posters/exports'));
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }
            $path = $dir . '/' . $export->id . '.zip';
            file_put_contents($path, $result['bytes']);
            $snapshot = PosterStaleness::snapshot($export->poster);
            $previous = PosterExport::query()
                ->where('poster_id', $export->poster_id)
                ->where('status', 'ready')
                ->where('id', '<', $export->id)
                ->orderByDesc('id')
                ->first();
            $export->poster->update(['state' => 'ready', 'version' => $export->poster->version + 1]);
            $export->update([
                'status' => 'ready',
                'preflight' => $result['preflight'],
                'zip_path' => $path,
                'bytes' => strlen($result['bytes']),
                'error' => null,
                'snapshot' => $snapshot,
                'bound_hash' => PosterStaleness::hash($snapshot),
                'diff' => PosterStaleness::diff($previous?->snapshot, $snapshot),
            ]);
        } catch (Throwable $e) {
            $export->update(['status' => 'failed', 'error' => $e->getMessage()]);
            if ($this->orderId !== null) {
                PosterOrders::exportFailed($this->orderId, $e->getMessage());
            }

            return;
        }
        if ($this->orderId !== null) {
            PosterOrders::exportFinished($this->orderId);
        }
    }
}
