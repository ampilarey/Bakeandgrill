<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\ComplaintBoxEntry;
use App\Models\SiteSetting;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * A nudge when a complaint has sat unread.
 *
 * Owner, 2026-09-21 (phase B). A complaint texts the owner once, as it
 * arrives, and then waits. If it is still "new" after N days (Complaint
 * Box → Alerts, two by default) the owner is told again, naming it; and
 * again every N days after that while it stays unread.
 */
class RemindStaleComplaints extends Command
{
    protected $signature = 'complaints:remind-stale';

    protected $description = 'SMS the owner about complaints left as "new" for too long';

    public const SETTING_ON = 'ops_complaint_stale_sms';

    public const SETTING_DAYS = 'ops_complaint_stale_days';

    public static function days(): int
    {
        return max(1, min(30, (int) SiteSetting::get(self::SETTING_DAYS, '2')));
    }

    public function handle(SmsService $sms): int
    {
        if (!filter_var(SiteSetting::get(self::SETTING_ON, '1'), FILTER_VALIDATE_BOOLEAN)) {
            $this->info('Stale complaint SMS is off.');

            return self::SUCCESS;
        }

        $days = self::days();
        $cutoff = now()->subDays($days);
        $stale = ComplaintBoxEntry::query()
            ->where('status', ComplaintBoxEntry::STATUS_NEW)
            ->where('created_at', '<=', $cutoff)
            ->where(fn ($q) => $q->whereNull('stale_reminded_at')->orWhere('stale_reminded_at', '<=', $cutoff))
            ->orderBy('created_at')
            ->get();

        if ($stale->isEmpty()) {
            $this->info('Nothing left unread.');

            return self::SUCCESS;
        }

        $lines = $stale->take(3)->map(function (ComplaintBoxEntry $e) {
            $cat = collect((array) $e->categories)->map(fn ($c) => ComplaintBoxEntry::categoryLabel((string) $c))->first() ?? 'complaint';
            $age = (int) $e->created_at->diffInDays(now());

            return "{$e->reference_number} ({$cat}, {$age}d)";
        })->implode(', ');
        $more = $stale->count() > 3 ? ' +' . ($stale->count() - 3) . ' more' : '';
        $message = 'Bake & Grill: ' . $stale->count() . ' complaint' . ($stale->count() === 1 ? '' : 's')
            . " unread for over {$days} day" . ($days === 1 ? '' : 's') . ": {$lines}{$more}. Open Customers → Complaint Box.";

        $phones = OwnerPhones::all();
        if ($phones->isEmpty()) {
            $this->warn('Stale complaint SMS enabled but no owner/manager phone or business_phone set.');

            return self::SUCCESS;
        }

        $dayKey = now()->toDateString();
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'system',
                    referenceType: 'complaint_stale_reminder',
                    referenceId: $dayKey,
                    idempotencyKey: 'complaint-stale:' . $dayKey . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send stale complaint SMS', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }

        ComplaintBoxEntry::query()->whereIn('id', $stale->pluck('id'))->update(['stale_reminded_at' => now()]);
        $this->info('Stale complaint SMS sent to ' . $phones->count() . ' recipient(s) for ' . $stale->count() . ' complaint(s).');

        return self::SUCCESS;
    }
}
