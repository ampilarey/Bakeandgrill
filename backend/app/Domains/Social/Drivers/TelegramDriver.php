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
        // Bot API: 4096 characters for a message, 1024 for a photo caption.
        return ['text' => true, 'photo' => true, 'requires_photo' => false, 'caption_max' => 4096, 'caption_max_photo' => 1024, 'video' => true, 'carousel' => true];
    }

    public function checkHealth(SocialChannel $channel): ChannelHealth
    {
        $token = $channel->credential('bot_token');
        $chatId = $channel->credential('chat_id');
        if ($token === '' || $chatId === '') {
            return ChannelHealth::error('Telegram channel is missing bot_token or chat_id.');
        }

        try {
            $chat = Http::timeout(15)->get("https://api.telegram.org/bot{$token}/getChat", ['chat_id' => $chatId]);
        } catch (ConnectionException $e) {
            return ChannelHealth::error('Could not reach Telegram: ' . $e->getMessage());
        }
        if (!$chat->successful() || $chat->json('ok') !== true) {
            return ChannelHealth::error((string) ($chat->json('description') ?? ('HTTP ' . $chat->status())));
        }
        $title = trim((string) ($chat->json('result.title') ?? $chat->json('result.username') ?? ''));

        // Bot tokens do not expire; the check is that the bot still reaches the chat.
        return ChannelHealth::ok('Connected; bot tokens do not expire.', null, $title !== '' ? $title : null);
    }

    public function comments(SocialChannel $channel, SocialPostDelivery $delivery): ?array
    {
        return null; // the Bot API cannot read a channel's comments
    }

    public function reply(SocialChannel $channel, string $commentId, string $message): string
    {
        throw SocialPublishException::validation('Replies are not possible on this platform.');
    }

    public function insights(SocialChannel $channel, SocialPostDelivery $delivery): ?array
    {
        return null; // the Bot API exposes no view or reaction counts for channel posts
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

        $images = $post->images();
        $caption = $post->captionFor($channel, $delivery);
        if (($video = $post->videoUrl()) !== null) {
            $method = 'sendVideo';
            $params = ['chat_id' => $chatId, 'video' => $video, 'caption' => $caption, 'supports_streaming' => 'true'];
        } elseif (count($images) > 1) {
            // An album: the caption rides on the first photo.
            $method = 'sendMediaGroup';
            $media = [];
            foreach (array_slice($images, 0, 10) as $i => $url) {
                $media[] = $i === 0 ? ['type' => 'photo', 'media' => $url, 'caption' => $caption] : ['type' => 'photo', 'media' => $url];
            }
            $params = ['chat_id' => $chatId, 'media' => json_encode($media)];
        } elseif ($images !== []) {
            $method = 'sendPhoto';
            $params = ['chat_id' => $chatId, 'photo' => $images[0], 'caption' => $caption];
        } else {
            $method = 'sendMessage';
            $params = ['chat_id' => $chatId, 'text' => $caption];
        }

        try {
            $response = Http::asForm()->timeout(20)
                ->post("https://api.telegram.org/bot{$token}/{$method}", $params);
        } catch (ConnectionException $e) {
            throw SocialPublishException::unknown('Telegram request timed out: ' . $e->getMessage());
        }

        if (!$response->successful() || $response->json('ok') !== true) {
            $this->throwTelegramError($response);
        }

        // sendMediaGroup answers with an array of messages; the album is the first.
        $messageId = (string) ($response->json('result.message_id') ?? $response->json('result.0.message_id') ?? '');
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
        $username = trim((string) ($response->json('result.chat.username') ?? $response->json('result.0.chat.username') ?? ''));

        return $username !== '' ? "https://t.me/{$username}/{$messageId}" : null;
    }
}
