<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Models\TelegramBot;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;

/**
 * One update from Telegram: a message or a button press. Private chats are
 * people (staff and drivers); groups take the online orders feed
 * (TelegramGroupFeed). A chat that is not linked learns nothing about the
 * business beyond how to link.
 */
class TelegramUpdateHandler
{
    public function __construct(
        private readonly TelegramClient $client,
        private readonly TelegramLinker $linker,
        private readonly TelegramCommands $commands,
        private readonly TelegramGroupFeed $groups,
        private readonly TelegramDriverDesk $drivers,
    ) {}

    /** @param array<string, mixed> $update */
    public function handle(TelegramBot $bot, array $update): void
    {
        try {
            if (isset($update['callback_query']) && is_array($update['callback_query'])) {
                $this->handleCallback($bot, $update['callback_query']);

                return;
            }
            if (isset($update['message']) && is_array($update['message'])) {
                $this->handleMessage($bot, $update['message']);
            }
        } catch (TelegramApiException $e) {
            Log::warning('telegram: reply failed', ['bot' => $bot->id, 'error' => $e->getMessage()]);
        }
    }

    /** @param array<string, mixed> $message */
    private function handleMessage(TelegramBot $bot, array $message): void
    {
        $chatType = (string) ($message['chat']['type'] ?? '');
        if (in_array($chatType, ['group', 'supergroup'], true)) {
            $this->groups->handleMessage($bot, $message);

            return;
        }
        if ($chatType !== 'private') {
            return; // channels are not used
        }
        $chatId = (string) ($message['chat']['id'] ?? '');
        $text = trim((string) ($message['text'] ?? ''));
        if ($chatId === '') {
            return;
        }

        // Someone hammering the bot gets one reply in ten seconds at most.
        $key = 'telegram-chat:' . $bot->id . ':' . $chatId;
        if (RateLimiter::tooManyAttempts($key, 20)) {
            return;
        }
        RateLimiter::hit($key, 10);

        if (preg_match('/^\/start(?:@\w+)?(?:\s+(\S+))?/i', $text, $m)) {
            $code = $m[1] ?? '';
            if ($code !== '') {
                $link = $this->linker->consume($bot, $code, $chatId, (array) ($message['from'] ?? []));
                if ($link === null) {
                    $this->client->sendMessage($bot, $chatId, "That link has expired or was already used.\n\nAsk the owner for a new one: Admin → Telegram → Link.");

                    return;
                }
                $link->load(['bot', 'user.role', 'driver']);
                if (!$link->isUsable()) {
                    $this->client->sendMessage($bot, $chatId, 'You are linked, but this bot does not serve your role. Ask the owner which bot to use.');

                    return;
                }
                $link->delivery_driver_id !== null ? $this->drivers->welcome($link) : $this->commands->welcome($link);

                return;
            }
        }

        $link = $this->linker->findByChat($bot, $chatId);
        if ($link === null) {
            $this->client->sendMessage($bot, $chatId, "This is the Bake &amp; Grill staff bot.\n\nTo use it, ask the owner for your link: Admin → Telegram → Link.");

            return;
        }
        if (!$link->isUsable()) {
            $this->client->sendMessage($bot, $chatId, 'Your account cannot use this bot right now. Ask the owner.');

            return;
        }

        $link->forceFill(['last_seen_at' => now(), 'blocked_at' => null])->save();

        if (preg_match('/^\/stop(?:@\w+)?$/i', $text)) {
            $link->delete();
            $this->client->sendMessage($bot, $chatId, 'Unlinked. You will get no more alerts here. Ask the owner for a new link to come back.', null, ['reply_markup' => ['remove_keyboard' => true]]);

            return;
        }

        if ($link->delivery_driver_id !== null) {
            $this->drivers->handleText($link, $text);

            return;
        }
        if ($text === '' || !$this->commands->handleText($link, $text)) {
            $this->commands->help($link, $link->user ?? throw new \LogicException('no user'));
        }
    }

    /** @param array<string, mixed> $callback */
    private function handleCallback(TelegramBot $bot, array $callback): void
    {
        $chatId = (string) ($callback['message']['chat']['id'] ?? '');
        $fromId = (string) ($callback['from']['id'] ?? '');
        // A button on an order card in a shop group: the presser is checked there.
        if (in_array((string) ($callback['message']['chat']['type'] ?? ''), ['group', 'supergroup'], true)) {
            $this->groups->handleCallback($bot, $callback);

            return;
        }
        $link = $chatId !== '' ? $this->linker->findByChat($bot, $chatId) : null;

        // In a private chat the chat id is the person's id; anything else is not ours.
        if ($link === null || $fromId !== $chatId || !$link->isUsable()) {
            $this->client->answerCallback($bot, (string) ($callback['id'] ?? ''), 'This chat is not linked to an account.', true);

            return;
        }
        $link->forceFill(['last_seen_at' => now()])->save();

        if ($link->delivery_driver_id !== null) {
            $this->drivers->handleCallback($link, $callback);

            return;
        }
        $this->commands->handleCallback($link, $callback);
    }
}
