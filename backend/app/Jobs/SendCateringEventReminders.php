<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Catering\Services\CateringLifecycleNotifier;
use App\Models\CateringRequest;
use App\Models\SiteSetting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendCateringEventReminders implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 30;

    public int $timeout = 120;

    public function handle(CateringLifecycleNotifier $notifier): void
    {
        $enabled = SiteSetting::get('catering_reminder_enabled', '1');
        if ($enabled === '0' || $enabled === 'false' || $enabled === false) {
            return;
        }

        $tomorrow = now()->addDay()->toDateString();
        $rows = CateringRequest::query()
            ->where('status', 'confirmed')
            ->whereDate('event_date', $tomorrow)
            ->get();

        foreach ($rows as $row) {
            $notifier->notifyReminder($row);
        }
    }

    public function failed(\Throwable $e): void
    {
        Log::error('SendCateringEventReminders failed', ['error' => $e->getMessage()]);
    }
}
