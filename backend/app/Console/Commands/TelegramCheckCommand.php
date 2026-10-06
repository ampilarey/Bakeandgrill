<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Telegram\Listeners\SendDayReportOnLastShiftClose;
use App\Domains\Telegram\Services\TelegramAlertCopier;
use App\Domains\Telegram\Services\TelegramLinker;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * php artisan telegram:check: why did (or didn't) an alert reach Telegram?
 * Bots, who is linked, the alert switches, who discount requests go to and
 * whether each is linked, and the last staff alerts with how they went.
 * Read-only; prints no tokens or codes.
 */
class TelegramCheckCommand extends Command
{
    protected $signature = 'telegram:check';

    protected $description = 'Show Telegram bots, links, alert settings and the last staff alerts (read-only)';

    public function handle(TelegramLinker $linker): int
    {
        $this->line('<info>Bots</info>');
        foreach (TelegramBot::query()->get() as $b) {
            $this->line(sprintf('  #%d %s @%s  %s  roles: %s  %s', $b->id, $b->name, $b->username ?? '?', $b->is_enabled ? 'ON' : 'OFF', implode(',', (array) $b->roles), $b->last_error ? 'error: ' . $b->last_error : ''));
        }
        if (TelegramBot::query()->count() === 0) {
            $this->warn('  No bot added.');
        }

        $this->line('<info>Linked people</info>');
        foreach (TelegramLink::query()->with(['bot', 'user.role', 'driver'])->get() as $l) {
            $this->line(sprintf('  %s (%s) phone %s  usable: %s%s', $l->displayName(), $l->role() ?? '?', $l->user?->phone ?? $l->driver?->phone ?? '-', $l->isUsable() ? 'yes' : 'NO', $l->blocked_at ? '  BLOCKED the bot' : ''));
        }

        $this->line('<info>Settings</info>');
        $this->line('  Alerts on Telegram: ' . (TelegramAlertCopier::enabled() ? 'on' : 'OFF'));
        $this->line('  Telegram instead of SMS: ' . (TelegramAlertCopier::insteadOfSms() ? 'on' : 'off'));
        $this->line('  Day report: ' . (SendDayReportOnLastShiftClose::enabled() ? 'on' : 'off'));
        $this->line('  Business phone: ' . (SiteSetting::get('business_phone') ?: '(none)'));

        $this->line('<info>Discount approvals go to</info>');
        $approvers = DiscountSettings::effectiveApprovers();
        if ($approvers === []) {
            $this->warn('  Nobody: add approvers in Admin → Promotions → Discount controls.');
        }
        foreach ($approvers as $a) {
            $user = $a['user_id'] ? User::query()->find($a['user_id']) : null;
            $link = $user ? $linker->linkForUser($user) : $linker->linkForPhone((string) $a['phone']);
            $this->line(sprintf('  %s  %s  %s  Telegram: %s', $a['label'], $a['phone'], $a['user_id'] ? 'staff #' . $a['user_id'] : 'typed number', $link ? 'linked (' . $link->displayName() . ')' : 'NOT linked'));
        }

        $this->line('<info>Last staff alerts</info>');
        $types = ['discount_approval_otp', 'owner_device_approval', 'staff_refund_requested', 'owner_complaint_box_received', 'owner_shift_variance', 'owner_shift_left_open'];
        foreach (SmsLog::query()->whereIn('type', $types)->latest('id')->limit(12)->get() as $log) {
            $link = $linker->linkForPhone((string) $log->to);
            $this->line(sprintf('  %s  %s  to %s  %s%s  Telegram: %s', $log->created_at?->format('d M H:i'), $log->type, $log->to, $log->status, $log->error_message ? ' (' . $log->error_message . ')' : '', $link ? 'linked' : 'no link for this number'));
        }

        return self::SUCCESS;
    }
}
