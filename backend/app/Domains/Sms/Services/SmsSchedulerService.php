<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Domains\Notifications\Services\BulkSmsService;
use App\Domains\Sms\Jobs\SendScheduledSmsJob;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignSchedule;
use App\Models\SmsScheduledMessage;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SmsSchedulerService
{
    /**
     * Draft campaigns given a send time never fired (SMS audit, 2026-09-24):
     * nothing read `scheduled_at`. Each due one is dispatched exactly as
     * "Send now" would, so the same audience, budget and gate apply.
     *
     * @return int campaigns started
     */
    public function dispatchDueCampaigns(Carbon $now): int
    {
        $started = 0;
        $ids = SmsCampaign::query()
            ->where('status', 'draft')
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', $now)
            ->pluck('id');

        foreach ($ids as $id) {
            try {
                $campaign = SmsCampaign::find($id);
                if ($campaign === null || !$campaign->canStart()) {
                    continue;
                }
                app(BulkSmsService::class)->dispatch($campaign);
                $started++;
            } catch (\Throwable $e) {
                Log::error('SmsSchedulerService: scheduled campaign could not start', ['campaign_id' => $id, 'error' => $e->getMessage()]);
                // Do not retry every minute: an empty audience or a blown budget needs a person.
                SmsCampaign::whereKey($id)->update(['scheduled_at' => null, 'notes' => trim(((string) (SmsCampaign::find($id)?->notes ?? '')) . "\nScheduled send failed: " . $e->getMessage())]);
            }
        }

        return $started;
    }

    /**
     * Recurring campaigns (SMS audit follow-up, 2026-09-24): each due
     * schedule becomes one ordinary campaign, built from the schedule's
     * criteria plus its cooldown, and sent through the same gate as "Send
     * now". The row is advanced before the send so two overlapping ticks
     * cannot both run it; a run with nobody to text is recorded as a
     * cancelled campaign so the owner can see the schedule fired.
     */
    public function runDueCampaignSchedules(Carbon $now): int
    {
        $ran = 0;
        $ids = SmsCampaignSchedule::query()
            ->where('is_active', true)
            ->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', $now)
            ->pluck('id');

        foreach ($ids as $id) {
            $schedule = null;
            DB::transaction(function () use ($id, $now, &$schedule): void {
                $locked = SmsCampaignSchedule::lockForUpdate()->find($id);
                if ($locked === null || !$locked->is_active || $locked->next_run_at === null || $locked->next_run_at->gt($now)) {
                    return;
                }
                $locked->update([
                    'last_run_at' => $now,
                    'next_run_at' => $locked->computeNextRunAt($now),
                    'runs_count' => $locked->runs_count + 1,
                ]);
                $schedule = $locked;
            });
            if ($schedule === null) {
                continue;
            }
            $this->runSchedule($schedule, $now);
            $ran++;
        }

        return $ran;
    }

    /** Create and send one run of a schedule. Returns the campaign. */
    public function runSchedule(SmsCampaignSchedule $schedule, ?Carbon $now = null): SmsCampaign
    {
        $now = $now ?? Carbon::now();
        $campaign = SmsCampaign::create([
            'name' => $schedule->name . ' · ' . $now->copy()->setTimezone(config('app.timezone', 'Indian/Maldives'))->format('j M'),
            'message' => $schedule->message,
            'target_criteria' => array_merge(
                (array) ($schedule->target_criteria ?? []),
                ['schedule_id' => $schedule->id, 'cooldown_days' => max(1, (int) $schedule->cooldown_days)],
            ),
            'status' => 'draft',
            'created_by' => $schedule->created_by,
            'schedule_id' => $schedule->id,
        ]);

        try {
            return app(BulkSmsService::class)->dispatch($campaign);
        } catch (\Throwable $e) {
            Log::info('SmsSchedulerService: recurring campaign run did not send', ['schedule_id' => $schedule->id, 'campaign_id' => $campaign->id, 'reason' => $e->getMessage()]);
            $campaign->update(['status' => 'cancelled', 'completed_at' => $now, 'notes' => 'Recurring run skipped: ' . $e->getMessage()]);

            return $campaign->fresh();
        }
    }

    /**
     * Find all due scheduled messages and dispatch their send jobs.
     * Updates next_send_at for recurring messages and marks one-time messages as completed.
     *
     * @return int Number of messages dispatched
     */
    public function dispatchDue(Carbon $now): int
    {
        // Collect IDs first without a lock so the SELECT is fast.
        $ids = SmsScheduledMessage::query()
            ->where('status', 'active')
            ->where('next_send_at', '<=', $now)
            ->pluck('id');

        $dispatched = 0;

        foreach ($ids as $id) {
            try {
                DB::transaction(function () use ($id, $now, &$dispatched): void {
                    // Re-check inside a transaction with a row-level lock to prevent
                    // duplicate dispatch when two scheduler runs overlap.
                    $scheduled = SmsScheduledMessage::lockForUpdate()->find($id);

                    if (!$scheduled || $scheduled->status !== 'active') {
                        return; // Already picked up by another process.
                    }
                    if ($scheduled->next_send_at > $now) {
                        return; // Advanced by another process for a recurring message.
                    }

                    // Advance / complete the row BEFORE dispatching so a second
                    // concurrent process cannot pick up the same ID.
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
                            'status' => 'completed',
                        ]);
                    }

                    SendScheduledSmsJob::dispatch($scheduled->id);
                    $dispatched++;
                });
            } catch (\Throwable $e) {
                Log::error('SmsSchedulerService: failed to dispatch scheduled message', [
                    'id' => $id,
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
