<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\ComplaintBoxEntry;
use App\Models\Device;
use App\Models\DiscountApproval;
use App\Models\Refund;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Staff and owner alerts on Telegram (owner, 2026-10-06).
 *
 * SmsService calls this for every text it handles. When the text is a
 * staff alert (any "Staff" or "Owner" type in the SMS Control Center, or a
 * discount approval code) for a staff member who has linked Telegram, the
 * same message goes to their Telegram chat: free, and with buttons where
 * the alert has something to decide.
 *
 * Since 2026-10-07 Admin decides who gets what by which channel
 * (NotificationChannels): the type's Telegram switch, and the person's
 * channels (their own, else their role's). A person whose channels leave
 * SMS out gets Telegram straight away (sendNow) and the SMS only if
 * nothing else reached them; that replaced the single "instead of SMS"
 * switch.
 *
 * It never affects the SMS: any failure here is logged and ignored.
 */
class TelegramAlertCopier
{
    public const SETTING_ENABLED = 'telegram_alerts_enabled';

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

    /** @param array<string, mixed>|null $entry */
    public static function isStaffAlert(?array $entry, string $type): bool
    {
        return ($entry['category'] ?? null) === 'staff' || in_array($type, self::EXTRA_TYPES, true)
            || in_array((string) ($entry['key'] ?? ''), self::EXTRA_TYPES, true);
    }

    /** Telegram on for this alert type at all: the master switch and the type's own. */
    public static function typeWanted(?array $entry, string $type): bool
    {
        return self::enabled() && self::isStaffAlert($entry, $type)
            && SmsTypeRegistry::isTelegramEnabled((string) ($entry['key'] ?? $type));
    }

    /**
     * The linked chat this alert should reach, or null.
     *
     * @param array<string, mixed>|null $entry
     */
    public function target(SmsMessage $sms, string $normalizedPhone, ?array $entry, ?User $staff = null): ?TelegramLink
    {
        try {
            if (!self::typeWanted($entry, $sms->type)) {
                return null;
            }
            if (!TelegramBot::query()->where('is_enabled', true)->exists()) {
                return null;
            }
            if ($staff !== null) {
                return NotificationChannels::allows($staff, NotificationChannels::TELEGRAM) ? $this->linker->linkForUser($staff) : null;
            }

            return $this->linker->linkForPhone($normalizedPhone);
        } catch (Throwable $e) {
            Log::warning('telegram alert: lookup failed', ['type' => $sms->type, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * Send now and say whether it arrived: for a person whose channels
     * leave SMS out. The caller sends the SMS when nothing reached them.
     *
     * @param array<string, mixed>|null $entry
     */
    public function sendNow(SmsMessage $sms, string $normalizedPhone, SmsLog $log, ?array $entry, User $staff): bool
    {
        $link = $this->target($sms, $normalizedPhone, $entry, $staff);
        if ($link === null || !Cache::add($this->onceKey($log), 1, now()->addDays(2))) {
            return false;
        }

        if ($this->deliver($link, $sms, $entry, timeout: 5)) {
            Cache::put(self::resultKey($log), $link->displayName() . ' ✓', now()->addDays(7));

            return true;
        }
        // Not delivered: let a later copy try again.
        Cache::forget($this->onceKey($log));
        Cache::put(self::resultKey($log), $link->displayName() . ' ✗', now()->addDays(7));

        return false;
    }

    /**
     * A copy alongside the SMS (or alongside the email when the SMS is
     * switched off). Sent after the response so it never slows a till.
     *
     * @param array<string, mixed>|null $entry
     */
    public function copy(SmsMessage $sms, string $normalizedPhone, SmsLog $log, ?array $entry, ?User $staff = null): void
    {
        $link = $this->target($sms, $normalizedPhone, $entry, $staff);
        // An alert sent to the shop's business phone (new till waiting for
        // approval, deliveries past ETA, social posts…) goes to every linked
        // owner as well (2026-10-07), by their channels.
        $links = $link !== null ? [$link] : $this->businessPhoneOwners($sms, $normalizedPhone, $entry);
        if ($links === [] || !Cache::add($this->onceKey($log), 1, now()->addDays(2))) {
            return;
        }

        DeferAfterResponse::run(function () use ($links, $sms, $entry, $log): void {
            $results = [];
            foreach ($links as $one) {
                $results[] = $one->displayName() . ($this->deliver($one, $sms, $entry, timeout: 8) ? ' ✓' : ' ✗');
            }
            // What happened, for telegram:check.
            Cache::put(self::resultKey($log), implode(', ', $results), now()->addDays(7));
        }, 'telegram-alert', always: true);
    }

    /**
     * Linked owners (and managers, for the alerts they can act on), when
     * this staff alert went to the business phone.
     * The SMS to the shop phone still goes as before.
     *
     * @param array<string, mixed>|null $entry
     * @return list<TelegramLink>
     */
    private function businessPhoneOwners(SmsMessage $sms, string $normalizedPhone, ?array $entry): array
    {
        try {
            if (!self::typeWanted($entry, $sms->type) || $sms->type === 'discount_approval_otp') {
                return [];
            }
            $business = substr(preg_replace('/\D/', '', (string) SiteSetting::get('business_phone', '')) ?? '', -7);
            $to = substr(preg_replace('/\D/', '', $normalizedPhone) ?? '', -7);
            if (strlen($business) !== 7 || $business !== $to) {
                return [];
            }

            return TelegramLink::query()
                ->with(['bot', 'user.role'])
                ->whereNotNull('user_id')
                ->whereNull('blocked_at')
                ->get()
                ->filter(fn (TelegramLink $l) => $l->isUsable() && self::takesBusinessPhoneAlert($l, $sms->type)
                    && NotificationChannels::allows($l->user, NotificationChannels::TELEGRAM))
                ->unique('user_id')
                ->values()
                ->all();
        } catch (Throwable $e) {
            Log::warning('telegram alert: business phone lookup failed', ['type' => $sms->type, 'error' => $e->getMessage()]);

            return [];
        }
    }

    /**
     * Shop-phone alerts a manager also gets on Telegram (manager level,
     * 2026-10-07), each for the permission that lets them act on it.
     */
    private const MANAGER_BUSINESS_PHONE_ALERTS = [
        'owner_device_approval' => 'devices.approve',
        'owner_delivery_delays' => 'orders.view',
        'owner_order_unstarted' => 'orders.view',
    ];

    /** Owners get every shop-phone alert; managers the ones they can act on. */
    public static function takesBusinessPhoneAlert(TelegramLink $link, string $type): bool
    {
        return match ($link->role()) {
            'owner' => true,
            'manager' => isset(self::MANAGER_BUSINESS_PHONE_ALERTS[$type]) && $link->user !== null
                && app(\App\Domains\Permissions\Services\PermissionService::class)->hasPermission($link->user, self::MANAGER_BUSINESS_PHONE_ALERTS[$type]),
            default => false,
        };
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

        // A new till waiting for approval: Approve / Reject (owner,
        // 2026-10-07: "No button for approval?").
        if ($sms->type === 'owner_device_approval' && $sms->referenceType === 'device' && $link->user !== null) {
            $device = Device::find((int) $sms->referenceId);
            if ($device !== null) {
                [$card, $buttons] = app(TelegramOwnerExtras::class)->deviceCard($device, $link->user);

                return ["🔔 <b>New till waiting for approval</b>\n\n" . $card, $buttons];
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

    /** Who the Telegram copy of this SMS reached (✓) or failed to reach (✗). */
    public static function resultKey(SmsLog $log): string
    {
        return 'telegram-alert:result:' . $log->id;
    }

    private function onceKey(SmsLog $log): string
    {
        return 'telegram-alert:log:' . $log->id;
    }
}
