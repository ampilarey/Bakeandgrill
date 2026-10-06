<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\ComplaintBoxEntry;
use App\Models\DiscountApproval;
use App\Models\Refund;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Staff and owner alerts on Telegram (owner, 2026-10-06).
 *
 * SmsService calls this for every text it handles. When the text is a
 * staff alert (any "Staff" or "Owner" type in the SMS Control Center, or a
 * discount approval code) and the number belongs to a staff member who has
 * linked Telegram, the same message goes to their Telegram chat: free, and
 * with buttons where the alert has something to decide.
 *
 * Two modes, set in Admin → Telegram:
 *  - alongside SMS (default): the text goes as before, Telegram is a copy;
 *  - instead of SMS: a linked person gets Telegram only, and the SMS is
 *    sent after all if Telegram cannot be reached, so nothing is lost.
 *
 * It never affects the SMS: any failure here is logged and ignored.
 */
class TelegramAlertCopier
{
    public const SETTING_ENABLED = 'telegram_alerts_enabled';
    public const SETTING_INSTEAD_OF_SMS = 'telegram_alerts_instead_of_sms';

    /** Staff-facing types outside the "staff" category. */
    private const EXTRA_TYPES = ['discount_approval_otp'];

    public function __construct(
        private readonly TelegramLinker $linker,
        private readonly TelegramClient $client,
        private readonly TelegramCommands $commands,
    ) {}

    public static function enabled(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::SETTING_ENABLED), true);
    }

    public static function insteadOfSms(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::SETTING_INSTEAD_OF_SMS), false);
    }

    /** @param array<string, mixed>|null $entry */
    public static function isStaffAlert(?array $entry, string $type): bool
    {
        return ($entry['category'] ?? null) === 'staff' || in_array($type, self::EXTRA_TYPES, true)
            || in_array((string) ($entry['key'] ?? ''), self::EXTRA_TYPES, true);
    }

    /**
     * The linked chat this alert should reach, or null.
     *
     * @param array<string, mixed>|null $entry
     */
    public function target(SmsMessage $sms, string $normalizedPhone, ?array $entry): ?TelegramLink
    {
        try {
            if (!self::enabled() || !self::isStaffAlert($entry, $sms->type)) {
                return null;
            }
            if (!TelegramBot::query()->where('is_enabled', true)->exists()) {
                return null;
            }

            return $this->linker->linkForPhone($normalizedPhone);
        } catch (Throwable $e) {
            Log::warning('telegram alert: lookup failed', ['type' => $sms->type, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * "Instead of SMS" mode: send now and say whether it arrived. The
     * caller sends the SMS when this returns false.
     *
     * @param array<string, mixed>|null $entry
     */
    public function sendInsteadOfSms(SmsMessage $sms, string $normalizedPhone, SmsLog $log, ?array $entry): bool
    {
        if (!self::insteadOfSms()) {
            return false;
        }
        $link = $this->target($sms, $normalizedPhone, $entry);
        if ($link === null || !Cache::add($this->onceKey($log), 1, now()->addDays(2))) {
            return false;
        }

        if ($this->deliver($link, $sms, $entry, timeout: 5)) {
            return true;
        }
        // Not delivered: let a later copy try again, and send the SMS.
        Cache::forget($this->onceKey($log));

        return false;
    }

    /**
     * A copy alongside the SMS (or alongside the email when the SMS is
     * switched off). Sent after the response so it never slows a till.
     *
     * @param array<string, mixed>|null $entry
     */
    public function copy(SmsMessage $sms, string $normalizedPhone, SmsLog $log, ?array $entry): void
    {
        $link = $this->target($sms, $normalizedPhone, $entry);
        if ($link === null || !Cache::add($this->onceKey($log), 1, now()->addDays(2))) {
            return;
        }

        DeferAfterResponse::run(function () use ($link, $sms, $entry): void {
            $this->deliver($link, $sms, $entry, timeout: 8);
        }, 'telegram-alert');
    }

    /** @param array<string, mixed>|null $entry */
    private function deliver(TelegramLink $link, SmsMessage $sms, ?array $entry, int $timeout): bool
    {
        try {
            [$html, $buttons] = $this->render($link, $sms, $entry);
            $params = [
                'chat_id' => $link->chat_id,
                'text' => $html,
                'parse_mode' => 'HTML',
                'disable_web_page_preview' => true,
            ];
            if ($buttons !== []) {
                $params['reply_markup'] = ['inline_keyboard' => $buttons];
            }
            $this->client->call($link->bot, 'sendMessage', $params, $timeout);

            return true;
        } catch (TelegramApiException $e) {
            if ($e->isBlocked()) {
                $link->forceFill(['blocked_at' => now()])->save();
            }
            Log::warning('telegram alert: not delivered', ['type' => $sms->type, 'link_id' => $link->id, 'error' => $e->getMessage()]);

            return false;
        } catch (Throwable $e) {
            Log::warning('telegram alert: skipped after an error', ['type' => $sms->type, 'error' => $e->getMessage()]);

            return false;
        }
    }

    /**
     * @param array<string, mixed>|null $entry
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>}
     */
    private function render(TelegramLink $link, SmsMessage $sms, ?array $entry): array
    {
        // A refund waiting for approval arrives as the refund itself, with
        // its Approve / Reject buttons.
        if ($sms->type === 'staff_refund_requested' && $sms->referenceType === 'refund' && $link->user !== null) {
            $refund = Refund::find((int) $sms->referenceId);
            if ($refund !== null) {
                [$card, $buttons] = $this->commands->refundCard($refund, $link->user);

                return ["🔔 <b>Refund waiting for approval</b>\n\n" . $card, $buttons];
            }
        }

        // A discount waiting for approval: Approve / Decline buttons, the
        // code as well for a till not yet updated (owner, 2026-10-07).
        if ($sms->type === 'discount_approval_otp' && $sms->referenceType === 'discount_approval' && $link->user !== null) {
            $approval = DiscountApproval::find((int) $sms->referenceId);
            if ($approval !== null) {
                return app(TelegramOwnerExtras::class)->discountCard($approval, $link->user, $sms->message);
            }
        }

        // A new complaint arrives as the complaint, with Reply / Resolved.
        if ($sms->type === 'owner_complaint_box_received' && $sms->referenceType === 'complaint_box' && $link->user !== null) {
            $complaint = ComplaintBoxEntry::find((int) $sms->referenceId);
            if ($complaint !== null) {
                [$card, $buttons] = app(TelegramOwnerExtras::class)->complaintCard($complaint);

                return ["🔔 <b>New complaint</b>\n\n" . $card, $buttons];
            }
        }

        $label = trim((string) ($entry['label'] ?? ''));
        $label = (string) preg_replace('/^(Owner|Staff):\s*/', '', $label);
        $icon = $sms->type === 'discount_approval_otp' ? '🔑' : '🔔';
        $title = $label !== '' ? $icon . ' <b>' . T::e(ucfirst($label)) . "</b>\n\n" : '';

        // "Bake & Grill: …" says who sent a text; in the bot's own chat it is noise.
        $body = (string) preg_replace('/^\s*Bake\s*(&|and)\s*Grill\s*:\s*/iu', '', trim($sms->message));

        return [T::clip($title . T::e($body)), []];
    }

    private function onceKey(SmsLog $log): string
    {
        return 'telegram-alert:log:' . $log->id;
    }
}
