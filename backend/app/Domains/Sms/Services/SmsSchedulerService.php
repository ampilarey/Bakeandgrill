<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Domains\Sms\Jobs\SendScheduledSmsJob;
use App\Models\SmsScheduledMessage;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class SmsSchedulerService
{
    /**
     * Find all due scheduled messages and dispatch their send jobs.
     * Updates next_send_at for recurring messages and marks one-time messages as completed.
     *
     * @return int Number of messages dispatched
     */
    public function dispatchDue(Carbon $now): int
    {
        $due = SmsScheduledMessage::query()
            ->where('status', 'active')
            ->where('next_send_at', '<=', $now)
            ->with(['contact.user', 'group.contacts.user', 'template'])
            ->get();

        $dispatched = 0;

        foreach ($due as $scheduled) {
            try {
                SendScheduledSmsJob::dispatch($scheduled->id);

                // Advance or complete the scheduled message
                if ($scheduled->is_recurring) {
                    $nextSendAt = $scheduled->computeNextSendAt($now);
                    $scheduled->update([
                        'last_sent_at' => $now,
                        'next_send_at' => $nextSendAt,
                    ]);
                } else {
                    $scheduled->update([
                        'last_sent_at' => $now,
                        'next_send_at' => null,
                        'status'       => 'completed',
                    ]);
                }

                $dispatched++;
            } catch (\Throwable $e) {
                Log::error('SmsSchedulerService: failed to dispatch scheduled message', [
                    'id'    => $scheduled->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $dispatched;
    }

    /**
     * Compute and set next_send_at when a new scheduled message is created.
     */
    public function initializeNextSendAt(SmsScheduledMessage $message): void
    {
        if ($message->is_recurring) {
            $now = Carbon::now();
            $nextSendAt = $message->computeNextSendAt($now);
            $message->update(['next_send_at' => $nextSendAt]);
        } else {
            $message->update(['next_send_at' => $message->send_at]);
        }
    }
}
