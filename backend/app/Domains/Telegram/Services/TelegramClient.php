<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Models\TelegramBot;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * The Telegram Bot API, for one bot at a time. Messages use HTML parse
 * mode, so anything typed by a person goes through TelegramText::e().
 */
class TelegramClient
{
    private const BASE = 'https://api.telegram.org/bot';

    /**
     * @param array<string, mixed> $params
     * @return mixed the API's `result`
     */
    public function call(TelegramBot $bot, string $method, array $params = [], int $timeout = 8): mixed
    {
        $token = (string) $bot->token;
        if ($token === '') {
            throw new TelegramApiException('This bot has no token.');
        }

        try {
            $response = Http::timeout($timeout)->acceptJson()->asJson()
                ->post(self::BASE . $token . '/' . $method, $params);
        } catch (ConnectionException $e) {
            throw new TelegramApiException('Could not reach Telegram: ' . $e->getMessage());
        }

        if (!$response->successful() || $response->json('ok') !== true) {
            $description = (string) ($response->json('description') ?? ('HTTP ' . $response->status()));
            // Never echo the token back (it is part of the URL).
            throw new TelegramApiException(str_replace($token, '***', $description), (int) ($response->json('error_code') ?? $response->status()));
        }

        return $response->json('result');
    }

    /**
     * @param array<int, array<int, array<string, string>>>|null $buttons inline keyboard rows
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    public function sendMessage(TelegramBot $bot, string $chatId, string $html, ?array $buttons = null, array $extra = []): array
    {
        $params = array_merge([
            'chat_id' => $chatId,
            'text' => $html,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ], $extra);
        if ($buttons !== null) {
            $params['reply_markup'] = ['inline_keyboard' => $buttons];
        }

        return (array) $this->call($bot, 'sendMessage', $params);
    }

    /** @param array<int, array<int, array<string, string>>>|null $buttons */
    public function editMessage(TelegramBot $bot, string $chatId, int $messageId, string $html, ?array $buttons = null): void
    {
        $params = [
            'chat_id' => $chatId,
            'message_id' => $messageId,
            'text' => $html,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
            'reply_markup' => ['inline_keyboard' => $buttons ?? []],
        ];
        try {
            $this->call($bot, 'editMessageText', $params);
        } catch (TelegramApiException $e) {
            // Editing to the same text is an error on Telegram's side; harmless.
            if (!str_contains($e->getMessage(), 'message is not modified')) {
                throw $e;
            }
        }
    }

    public function answerCallback(TelegramBot $bot, string $callbackId, string $text = '', bool $alert = false): void
    {
        try {
            $this->call($bot, 'answerCallbackQuery', array_filter([
                'callback_query_id' => $callbackId,
                'text' => $text !== '' ? mb_substr($text, 0, 190) : null,
                'show_alert' => $alert ?: null,
            ], fn ($v) => $v !== null));
        } catch (TelegramApiException) {
            // A late answer (over 15 seconds) is refused; the action itself already ran.
        }
    }

    /** @return array<string, mixed> */
    public function getMe(TelegramBot $bot): array
    {
        return (array) $this->call($bot, 'getMe');
    }

    /** @return array<string, mixed> */
    public function getWebhookInfo(TelegramBot $bot): array
    {
        return (array) $this->call($bot, 'getWebhookInfo');
    }

    public function setWebhook(TelegramBot $bot): void
    {
        $this->call($bot, 'setWebhook', [
            'url' => $bot->webhookUrl(),
            'secret_token' => $bot->webhook_secret,
            'allowed_updates' => ['message', 'callback_query'],
            'drop_pending_updates' => true,
        ]);
    }

    public function deleteWebhook(TelegramBot $bot): void
    {
        $this->call($bot, 'deleteWebhook');
    }

    /** The command list shown when someone types "/" in the chat. */
    public function setCommands(TelegramBot $bot, array $commands): void
    {
        $this->call($bot, 'setMyCommands', ['commands' => $commands]);
    }
}
