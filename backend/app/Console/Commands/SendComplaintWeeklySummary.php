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
 * Monday morning: how the complaint box went last week.
 *
 * Owner, 2026-09-21 (phase B). Each complaint already texts the owner as
 * it arrives; this is the week in one message — how many, about what, who
 * was named, and how many are still open — so a bad week is seen as a
 * week, not as seven separate pings. Off unless switched on.
 */
class SendComplaintWeeklySummary extends Command
{
    protected $signature = 'complaints:weekly-summary {--force : Send even if the setting is off}';

    protected $description = 'SMS the owner a summary of the last seven days of complaints';

    public const SETTING = 'ops_complaint_weekly_sms';

    public function handle(SmsService $sms): int
    {
        if (!$this->option('force') && !filter_var(SiteSetting::get(self::SETTING, '0'), FILTER_VALIDATE_BOOLEAN)) {
            $this->info('Weekly complaint SMS is off.');

            return self::SUCCESS;
        }

        $since = now()->subDays(7);
        $week = ComplaintBoxEntry::query()->where('created_at', '>=', $since)->get(['id', 'categories', 'about_staff', 'status']);
        $open = ComplaintBoxEntry::query()->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES)->count();

        if ($week->isEmpty() && $open === 0) {
            $this->info('No complaints last week and none open.');

            return self::SUCCESS;
        }

        $byCategory = [];
        foreach ($week as $e) {
            foreach ((array) $e->categories as $c) {
                $byCategory[$c] = ($byCategory[$c] ?? 0) + 1;
            }
        }
        arsort($byCategory);
        $cats = collect($byCategory)->take(3)->map(fn (int $n, string $c) => ComplaintBoxEntry::categoryLabel($c) . ' ' . $n)->implode(', ');

        $named = $week->map(fn ($e) => trim((string) $e->about_staff))->filter()->countBy(fn ($n) => mb_strtolower($n));
        $staff = $named->isEmpty() ? '' : ' Named: ' . $named->sortDesc()->take(3)->map(fn (int $n, string $who) => $who . ($n > 1 ? " ×{$n}" : ''))->implode(', ') . '.';

        $message = 'Bake & Grill complaints, last 7 days: ' . $week->count()
            . ($cats !== '' ? " ({$cats})" : '')
            . '.' . $staff
            . " Still open: {$open}. See Customers → Complaint Box.";

        $phones = OwnerPhones::all();
        if ($phones->isEmpty()) {
            $this->warn('Weekly complaint SMS enabled but no owner/manager phone or business_phone set.');

            return self::SUCCESS;
        }

        $weekKey = now()->format('o-\WW');
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'system',
                    referenceType: 'complaint_weekly_summary',
                    referenceId: $weekKey,
                    idempotencyKey: 'complaint-weekly:' . $weekKey . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send weekly complaint SMS', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }

        $this->info('Weekly complaint SMS sent to ' . $phones->count() . ' recipient(s).');

        return self::SUCCESS;
    }
}
