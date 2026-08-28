<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Viber Channel posts via the Channels Post API (plan §2a: this is NOT a
 * simple "free bot key" — it needs the channel super-admin's auth token, the
 * super-admin sender id, and a registered HTTPS webhook before Viber accepts
 * posts).
 *
 * The webhook is registered lazily on first publish — never at channel-save
 * time — so the side effect sits behind the same fail-closed environment
 * guard as posting itself: a TEST box can never point the live channel's
 * webhook at itself.
 *
 * Media constraints: Viber pictures should be JPEG under ~1MB at a public
 * URL; oversized/odd formats come back as classified validation errors.
 */
class ViberChannelDriver implements SocialDriverInterface
{
    private const API = 'https://chatapi.viber.com/pa';

    public function platform(): string
    {
        return 'viber';
    }

    public function capabilities(): array
    {
        return ['text' => true, 'photo' => true, 'requires_photo' => false];
    }

    public function requiredCredentials(): array
    {
        return ['auth_token', 'sender_id'];
    }

    public function publish(SocialChannel $channel, SocialPost $post, SocialPostDelivery $delivery): PublishResult
    {
        $token = $channel->credential('auth_token');
        $sender = $channel->credential('sender_id');
        if ($token === '' || $sender === '') {
            throw SocialPublishException::auth('Viber channel is missing auth_token or sender_id.');
        }

        $this->ensureWebhook($channel, $token);

        $image = $post->imageUrl();
        $payload = $image !== null
            ? ['from' => $sender, 'type' => 'picture', 'text' => $post->caption(), 'media' => $image]
            : ['from' => $sender, 'type' => 'text', 'text' => $post->caption()];

        $response = $this->call('/post', $token, $payload);
        $this->assertOk($response);

        $messageToken = (string) ($response->json('message_token') ?? '');
        if ($messageToken === '') {
            throw SocialPublishException::unknown('Viber accepted the request but returned no message token.');
        }

        return new PublishResult($messageToken);
    }

    public function reconcile(SocialChannel $channel, SocialPostDelivery $delivery): ?PublishResult
    {
        // The Channels API has no post lookup; only a recorded token confirms.
        $id = trim((string) $delivery->provider_post_id);

        return $id !== '' ? new PublishResult($id) : null;
    }

    /**
     * Viber refuses /pa/post until a webhook is registered. Register once
     * per app-url (cached a day; re-registering is idempotent server-side).
     * Reaching here means the environment guard already allowed publishing.
     */
    private function ensureWebhook(SocialChannel $channel, string $token): void
    {
        $url = rtrim((string) config('app.url'), '/') . '/api/social/viber/webhook';
        $cacheKey = 'viber-webhook:' . $channel->id . ':' . sha1($url);
        if (Cache::get($cacheKey)) {
            return;
        }

        $response = $this->call('/set_webhook', $token, [
            'url' => $url,
            'event_types' => [],
            'send_name' => false,
            'send_photo' => false,
        ]);
        $this->assertOk($response);
        Cache::put($cacheKey, 1, 86400);
    }

    /** @param array<string, mixed> $payload */
    private function call(string $path, string $token, array $payload): Response
    {
        try {
            return Http::withHeaders(['X-Viber-Auth-Token' => $token])
                ->timeout(20)
                ->post(self::API . $path, $payload);
        } catch (ConnectionException $e) {
            // /post may have landed before the connection died.
            throw $path === '/post'
                ? SocialPublishException::unknown('Viber request timed out: ' . $e->getMessage())
                : SocialPublishException::transient('Viber request timed out: ' . $e->getMessage());
        }
    }

    private function assertOk(Response $response): void
    {
        $status = (int) ($response->json('status') ?? -1);
        if ($response->successful() && $status === 0) {
            return;
        }

        $message = (string) ($response->json('status_message') ?? ('HTTP ' . $response->status()));

        // Viber status codes: 2 invalid token, 12 too many requests,
        // 1/3/8… bad request shapes.
        throw match (true) {
            $status === 2 || $response->status() === 401 => SocialPublishException::auth($message),
            $status === 12 || $response->status() === 429 => SocialPublishException::rateLimit($message),
            $response->status() >= 500 => SocialPublishException::transient($message),
            default => SocialPublishException::validation($message),
        };
    }
}
