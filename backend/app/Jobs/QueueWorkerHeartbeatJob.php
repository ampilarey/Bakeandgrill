<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\System\Services\QueueWorkerHeartbeat;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * No-op job whose sole purpose is to prove a queue worker is alive.
 * Scheduled every minute; JobProcessed listener records the heartbeat.
 */
class QueueWorkerHeartbeatJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1;

    public int $timeout = 15;

    public function handle(QueueWorkerHeartbeat $heartbeat): void
    {
        // Belt-and-braces: record even if the JobProcessed listener is absent.
        $heartbeat->record();
    }
}
