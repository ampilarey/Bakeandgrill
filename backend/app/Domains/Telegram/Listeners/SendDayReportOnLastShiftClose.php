<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Listeners;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Services\TelegramClient;
use App\Domains\Telegram\Services\TelegramOwnerExtras;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\TelegramLink;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The day's report on Telegram as soon as the last shift of the day closes
 * (owner, 2026-10-07): sales, payments, best sellers, each shift's drawer
 * and refunds still owed. Once a day, to every linked owner. Switch:
 * Admin → Telegram → "Day report when the last shift closes".
 */
class SendDayReportOnLastShiftClose
{
    public const SETTING = 'telegram_day_report_enabled';

    public static function enabled(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::SETTING), true);
    }

    public function handle(ShiftClosed $event): void
    {
        try {
            if (!self::enabled()) {
                return;
            }
            if (Shift::query()->whereNull('closed_at')->exists()) {
                return; // someone is still on a till
            }
            $owners = TelegramLink::query()
                ->with(['bot', 'user.role'])
                ->whereNotNull('user_id')
                ->whereNull('blocked_at')
                ->get()
                ->filter(fn (TelegramLink $l) => $l->isUsable() && $l->user !== null && app(PermissionService::class)->isOwner($l->user))
                ->unique('user_id');
            if ($owners->isEmpty()) {
                return;
            }
            // Once a day: a shift reopened and closed again does not repeat it.
            if (!Cache::add('telegram-day-report:' . now()->toDateString(), 1, now()->endOfDay())) {
                return;
            }

            DeferAfterResponse::run(function () use ($owners): void {
                $html = app(TelegramOwnerExtras::class)->endOfDayHtml();
                foreach ($owners as $link) {
                    try {
                        app(TelegramClient::class)->sendMessage($link->bot, $link->chat_id, $html);
                    } catch (TelegramApiException $e) {
                        if ($e->isBlocked()) {
                            $link->forceFill(['blocked_at' => now()])->save();
                        }
                        Log::warning('telegram day report: not delivered', ['link_id' => $link->id, 'error' => $e->getMessage()]);
                    }
                }
            }, 'telegram-day-report');
        } catch (Throwable $e) {
            // Never let the report affect closing the shift.
            Log::warning('telegram day report: skipped after an error', ['error' => $e->getMessage()]);
        }
    }
}
