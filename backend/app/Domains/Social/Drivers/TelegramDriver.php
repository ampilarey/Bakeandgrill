<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Telegram channel posts via the Bot API. Credentials: bot_token + the
 * destination chat_id (the bot must be an admin of the channel).
 */
class TelegramDriver implements SocialDriverInterface
{
    public function platform(): string
    {
        return 'telegram';
    }

    public function capabilities(): array
    {
        return ['text' => true, 'photo' => true, 'requires_photo' => false];
    }

    public function requiredCredentials(): array
    {
        return ['bot_token', 'chat_id'];
    }

    public function publish(SocialChannel $channel, SocialPost $post, SocialPostDelivery $delivery): PublishResult
    {
        $token = $channel->credential('bot_token');
        $chatId = $channel->credential('chat_id');
        if ($token === '' || $chatId === '') {
            throw SocialPublishException::auth('Telegram channel is missing bot_token or chat_id.');
        }

        $image = $post->imageUrl();
        $params = $image !== null
            ? ['chat_id' => $chatId, 'photo' => $image, 'caption' => $post->caption()]
            : ['chat_id' => $chatId, 'text' => $post->caption()];
        $method = $image !== null ? 'sendPhoto' : 'sendMessage';

        try {
            $response = Http::asForm()->timeout(20)
                ->post("https://api.telegram.org/bot{$token}/{$method}", $params);
        } catch (ConnectionException $e) {
            throw SocialPublishException::unknown('Telegram request timed out: ' . $e->getMessage());
        }

        if (!$response->successful() || $response->json('ok') !== true) {
            $this->throwTelegramError($response);
        }

        $messageId = (string) ($response->json('result.message_id') ?? '');
        if ($messageId === '') {
            throw SocialPublishException::unknown('Telegram accepted the request but returned no message id.');
        }

        return new PublishResult($messageId, $this->permalinkFor($response, $messageId));
    }

    public function reconcile(SocialChannel $channel, SocialPostDelivery $delivery): ?PublishResult
    {
        // The Bot API has no message lookup by content; without a recorded
        // message id the outcome stays unknown for a human.
        $id = trim((string) $delivery->provider_post_id);

        return $id !== '' ? new PublishResult($id) : null;
    }

    private function throwTelegramError(Response $response): never
    {
        $code = (int) ($response->json('error_code') ?? $response->status());
        $message = (string) ($response->json('description') ?? ('HTTP ' . $response->status()));

        if ($code === 401 || $code === 403) {
            throw SocialPublishException::auth($message);
        }
        if ($code === 429) {
            throw SocialPublishException::rateLimit($message);
        }
        if ($code >= 500) {
            throw SocialPublishException::transient($message);
        }

        throw SocialPublishException::validation($message);
    }

    private function permalinkFor(Response $response, string $messageId): ?string
    {
        $username = trim((string) ($response->json('result.chat.username') ?? ''));

        return $username !== '' ? "https://t.me/{$username}/{$messageId}" : null;
    }
}
