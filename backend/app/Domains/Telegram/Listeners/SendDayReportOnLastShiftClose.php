<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Listeners;

use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Services\TelegramClient;
use App\Domains\Telegram\Services\TelegramOwnerExtras;
use App\Domains\Telegram\Services\TelegramOwnerTools;
use App\Models\Shift;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The day's report on Telegram as soon as the last shift of the day closes
 * (owner, 2026-10-07): sales, payments, best sellers, each shift's drawer
 * and refunds still owed. Once a day, to whoever the row "Owner: day report
 * when the last shift closes" goes to in Admin → Notifications (owners, and
 * whoever can see reports, by default), when they have linked Telegram.
 */
class SendDayReportOnLastShiftClose
{
    public const TYPE = 'owner_day_report';

    public const SETTING = 'telegram_day_report_enabled';

    /** The row's own switch (its only one); the Telegram master switch applies as well when sending. */
    public static function enabled(): bool
    {
        return SmsTypeRegistry::isTelegramEnabled(self::TYPE);
    }

    public function handle(ShiftClosed $event): void
    {
        try {
            if (!AlertSwitch::isOn(self::TYPE)) {
                return;
            }
            if (Shift::query()->whereNull('closed_at')->exists()) {
                return; // someone is still on a till
            }
            $people = TelegramOwnerTools::linksFor(self::TYPE);
            if ($people->isEmpty()) {
                return;
            }
            // Once a day: a shift reopened and closed again does not repeat it.
            if (!Cache::add('telegram-day-report:' . now()->toDateString(), 1, now()->endOfDay())) {
                return;
            }

            DeferAfterResponse::run(function () use ($people): void {
                $html = app(TelegramOwnerExtras::class)->endOfDayHtml();
                foreach ($people as $link) {
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
