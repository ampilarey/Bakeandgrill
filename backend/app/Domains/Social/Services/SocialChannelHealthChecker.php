<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Social\Drivers\ChannelHealth;
use App\Models\SocialChannel;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Social Hub audit (2026-09-24): "token expiry is invisible". Asks each
 * enabled channel's platform whether the credentials still work and when
 * the token expires, stores the answer on the channel, and sends one SMS
 * per distinct problem — a token inside its last week, or a check that
 * fails outright. The SMS repeats only when the problem changes (a new
 * expiry date, a different error), and never while the channel is fine.
 */
class SocialChannelHealthChecker
{
    public const EXPIRY_WARNING_DAYS = 7;

    public function __construct(private readonly SocialDriverRegistry $drivers) {}

    /** Check one channel and store the result. Never throws. */
    public function check(SocialChannel $channel): ChannelHealth
    {
        try {
            $health = $this->drivers->for($channel->platform)->checkHealth($channel);
        } catch (Throwable $e) {
            $health = ChannelHealth::error('Health check crashed: ' . $e->getMessage());
        }

        $status = $health->status;
        $daysLeft = $health->tokenExpiresAt !== null
            ? (int) floor(now()->diffInDays($health->tokenExpiresAt, false))
            : null;
        if ($status === ChannelHealth::OK && $daysLeft !== null && $daysLeft <= self::EXPIRY_WARNING_DAYS) {
            $status = ChannelHealth::WARNING;
        }

        $previous = $channel->health ?? [];
        $channel->forceFill(['health' => [
            'status' => $status,
            'message' => $health->message,
            'token_expires_at' => $health->tokenExpiresAt?->toIso8601String(),
            'account_label' => $health->accountLabel,
            'checked_at' => now()->toIso8601String(),
            'alerted_key' => $previous['alerted_key'] ?? null,
        ]])->save();

        $this->alertIfNeeded($channel, $status, $health, $daysLeft);

        return $health;
    }

    /** @return array<int, ChannelHealth> keyed by channel id */
    public function checkAllEnabled(): array
    {
        $out = [];
        foreach (SocialChannel::query()->where('is_enabled', true)->orderBy('id')->get() as $channel) {
            $out[$channel->id] = $this->check($channel);
        }

        return $out;
    }

    private function alertIfNeeded(SocialChannel $channel, string $status, ChannelHealth $health, ?int $daysLeft): void
    {
        $meta = $channel->health ?? [];
        $key = match ($status) {
            ChannelHealth::ERROR => 'error:' . md5($health->message),
            ChannelHealth::WARNING => 'expiry:' . ($health->tokenExpiresAt?->toDateString() ?? ''),
            default => null,
        };

        if ($key === null) {
            if (!empty($meta['alerted_key'])) {
                $meta['alerted_key'] = null;
                $channel->forceFill(['health' => $meta])->save();
            }

            return;
        }
        if (($meta['alerted_key'] ?? null) === $key) {
            return; // already told them about this exact problem
        }

        $meta['alerted_key'] = $key;
        $channel->forceFill(['health' => $meta])->save();

        $label = ucfirst($channel->platform) . " channel \"{$channel->name}\"";
        $text = $status === ChannelHealth::ERROR
            ? "Social: {$label} check failed: {$health->message}"
            : "Social: {$label} token expires in {$daysLeft} day" . ($daysLeft === 1 ? '' : 's') . '. Reconnect it in Admin → Social Hub → Channels before posts start failing.';
        Log::warning('social: channel health alert', ['channel_id' => $channel->id, 'status' => $status, 'message' => $health->message]);

        try {
            foreach (OwnerPhones::for('owner_social_channel') as $phone) {
                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: mb_substr($text, 0, 300),
                    type: 'owner_social_channel',
                    referenceType: 'social_channel',
                    referenceId: (string) $channel->id,
                    idempotencyKey: 'social-health:' . $channel->id . ':' . $key . ':' . $phone,
                ));
            }
        } catch (Throwable $e) {
            Log::warning('social: health alert SMS could not be sent', ['channel_id' => $channel->id, 'error' => $e->getMessage()]);
        }
    }
}
