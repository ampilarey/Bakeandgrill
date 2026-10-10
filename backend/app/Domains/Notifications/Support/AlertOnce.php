<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Domains\Notifications\DTOs\SmsMessage;

/**
 * One alert reaches each person once on each channel (owner, 2026-10-10:
 * "Opening float differs from the last close" arrived twice on Telegram).
 *
 * An alert goes out as one SmsService::send per address, and more than one
 * address can lead to the same person: the same number typed two ways on
 * two accounts, the business phone (whose Telegram copy goes to linked
 * owners) beside an owner's own phone, a manager whose phone is the shop's.
 * The Telegram and email copiers claim a person here before they send.
 *
 * The ledger lives for one request, queued job or command run (a scoped
 * binding, reset by the queue worker between jobs), which is the life of
 * one alert's sends. A Resend from Admin is a new request and goes again.
 */
final class AlertOnce
{
    public const TELEGRAM = 'telegram';

    public const EMAIL = 'email';

    /** Claimed, and the message is on its way (sent after the response). */
    public const PENDING = 'pending';

    public const SENT = 'sent';

    /** Timed out: the other side may well have shown it, so it is not tried again. */
    public const UNKNOWN = 'unknown';

    /** Refused outright: nothing was shown, so the claim is given back. */
    public const FAILED = 'failed';

    /** @var array<string, string> key → PENDING | SENT | UNKNOWN */
    private array $outcomes = [];

    /** The alert itself: its type, what it is about, and its words. */
    public static function fingerprint(SmsMessage $sms): string
    {
        return sha1(implode("\x1f", [$sms->type, (string) $sms->referenceType, (string) $sms->referenceId, trim($sms->message)]));
    }

    /** True the first time this person is claimed for this alert on this channel. */
    public function claim(string $channel, SmsMessage $sms, string $person): bool
    {
        $key = self::key($channel, $sms, $person);
        if (isset($this->outcomes[$key])) {
            return false;
        }
        $this->outcomes[$key] = self::PENDING;

        return true;
    }

    /** Record how the send went; a refusal gives the claim back so a later copy may try. */
    public function settle(string $channel, SmsMessage $sms, string $person, string $outcome): void
    {
        $key = self::key($channel, $sms, $person);
        if ($outcome === self::FAILED) {
            unset($this->outcomes[$key]);

            return;
        }
        $this->outcomes[$key] = $outcome;
    }

    /** PENDING, SENT, UNKNOWN, or null when nothing went to them yet. */
    public function outcome(string $channel, SmsMessage $sms, string $person): ?string
    {
        return $this->outcomes[self::key($channel, $sms, $person)] ?? null;
    }

    private static function key(string $channel, SmsMessage $sms, string $person): string
    {
        return $channel . "\x1f" . self::fingerprint($sms) . "\x1f" . $person;
    }
}
