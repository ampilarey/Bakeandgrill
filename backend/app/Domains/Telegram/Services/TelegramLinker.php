<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Models\DeliveryDriver;
use App\Models\TelegramBot;
use App\Models\TelegramLink;
use App\Models\TelegramLinkCode;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Linking a person's Telegram to their account. Admin makes a one-time
 * code (shown as a link and a QR); the person opens it, Telegram sends the
 * bot "/start <code>", and the chat is linked. A code works once, for one
 * hour, for the one person and bot it was made for.
 */
class TelegramLinker
{
    public const CODE_MINUTES = 60;

    /** @return array{code: string, url: string|null, expires_at: \Illuminate\Support\Carbon} */
    public function issue(TelegramBot $bot, ?User $user, ?DeliveryDriver $driver, ?User $by): array
    {
        if (($user === null) === ($driver === null)) {
            throw new \InvalidArgumentException('Link exactly one staff member or one driver.');
        }

        // Only the newest code for this person and bot works.
        TelegramLinkCode::query()
            ->where('telegram_bot_id', $bot->id)
            ->where('user_id', $user?->id)
            ->where('delivery_driver_id', $driver?->id)
            ->whereNull('used_at')
            ->delete();

        $code = Str::lower(Str::random(24));
        $expires = now()->addMinutes(self::CODE_MINUTES);
        TelegramLinkCode::create([
            'telegram_bot_id' => $bot->id,
            'user_id' => $user?->id,
            'delivery_driver_id' => $driver?->id,
            'code_hash' => hash('sha256', $code),
            'expires_at' => $expires,
            'created_by' => $by?->id,
        ]);

        return [
            'code' => $code,
            'url' => $bot->username ? 'https://t.me/' . $bot->username . '?start=' . $code : null,
            'expires_at' => $expires,
        ];
    }

    /**
     * "/start <code>" from a private chat. Returns the new link, or null
     * when the code is unknown, used, expired or for another bot.
     *
     * @param array<string, mixed> $from Telegram's `from` object
     */
    public function consume(TelegramBot $bot, string $code, string $chatId, array $from): ?TelegramLink
    {
        $code = trim($code);
        if ($code === '' || strlen($code) > 64) {
            return null;
        }

        return DB::transaction(function () use ($bot, $code, $chatId, $from): ?TelegramLink {
            $row = TelegramLinkCode::query()
                ->where('code_hash', hash('sha256', $code))
                ->lockForUpdate()
                ->first();
            if ($row === null || (int) $row->telegram_bot_id !== (int) $bot->id || $row->used_at !== null || $row->expires_at->isPast()) {
                return null;
            }
            $row->update(['used_at' => now()]);

            // This chat may have been someone else's (a shared phone): it is theirs no more.
            TelegramLink::query()->where('telegram_bot_id', $bot->id)->where('chat_id', $chatId)->delete();

            $name = trim(((string) ($from['first_name'] ?? '')) . ' ' . ((string) ($from['last_name'] ?? '')));

            return TelegramLink::updateOrCreate(
                [
                    'telegram_bot_id' => $bot->id,
                    'user_id' => $row->user_id,
                    'delivery_driver_id' => $row->delivery_driver_id,
                ],
                [
                    'chat_id' => $chatId,
                    'telegram_username' => isset($from['username']) ? mb_substr((string) $from['username'], 0, 64) : null,
                    'telegram_name' => $name !== '' ? mb_substr($name, 0, 128) : null,
                    'linked_at' => now(),
                    'last_seen_at' => now(),
                    'blocked_at' => null,
                ],
            );
        });
    }

    /** The usable link for this staff member, on the first enabled bot that serves their role. */
    public function linkForUser(User $user): ?TelegramLink
    {
        return TelegramLink::query()
            ->with(['bot', 'user.role'])
            ->where('user_id', $user->id)
            ->whereNull('blocked_at')
            ->orderBy('id')
            ->get()
            ->first(fn (TelegramLink $l) => $l->isUsable());
    }

    /** The staff member whose phone this is, when they have a usable link. */
    public function linkForPhone(string $normalizedPhone): ?TelegramLink
    {
        $local = substr(preg_replace('/\D/', '', $normalizedPhone) ?? '', -7);
        if (strlen($local) !== 7) {
            return null;
        }
        $forms = ['+960' . $local, '960' . $local, $local, '+960 ' . $local];
        $users = User::query()->whereIn('phone', $forms)->where('is_active', true)->get();
        foreach ($users as $user) {
            $link = $this->linkForUser($user);
            if ($link !== null) {
                return $link;
            }
        }

        return null;
    }

    public function findByChat(TelegramBot $bot, string $chatId): ?TelegramLink
    {
        return TelegramLink::query()
            ->with(['bot', 'user.role', 'driver'])
            ->where('telegram_bot_id', $bot->id)
            ->where('chat_id', $chatId)
            ->first();
    }
}
