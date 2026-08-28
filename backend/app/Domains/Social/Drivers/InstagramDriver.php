<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;

/**
 * Instagram business posts via the Graph API's asynchronous container flow:
 * create a media container → poll its status → publish. Every post requires
 * an image at a public URL.
 *
 * The container id is written to the delivery row BEFORE polling, so a
 * worker death mid-flight leaves enough behind for reconcile() to finish
 * the job instead of double-posting.
 */
class InstagramDriver implements SocialDriverInterface
{
    use MetaGraphSupport;

    public function platform(): string
    {
        return 'instagram';
    }

    public function capabilities(): array
    {
        return ['text' => false, 'photo' => true, 'requires_photo' => true];
    }

    public function requiredCredentials(): array
    {
        return ['ig_user_id', 'access_token'];
    }

    public function publish(SocialChannel $channel, SocialPost $post, SocialPostDelivery $delivery): PublishResult
    {
        $igUserId = $channel->credential('ig_user_id');
        $token = $channel->credential('access_token');
        if ($igUserId === '' || $token === '') {
            throw SocialPublishException::auth('Instagram channel is missing ig_user_id or access_token.');
        }

        $image = $post->imageUrl();
        if ($image === null) {
            throw SocialPublishException::validation('Instagram posts require an image.');
        }

        // Re-use a container from an interrupted earlier attempt when one
        // exists — creating a second container risks a duplicate post.
        $containerId = trim((string) $delivery->provider_container_id);
        if ($containerId === '') {
            $create = $this->graphPost("/{$igUserId}/media", [
                'image_url' => $image,
                'caption' => $post->caption(),
                'access_token' => $token,
            ]);
            if (!$create->successful()) {
                $this->throwGraphError($create);
            }
            $containerId = (string) ($create->json('id') ?? '');
            if ($containerId === '') {
                throw SocialPublishException::unknown('Instagram returned no container id.');
            }
            $delivery->forceFill(['provider_container_id' => $containerId])->save();
        }

        $this->waitUntilContainerReady($containerId, $token);

        $publish = $this->graphPost("/{$igUserId}/media_publish", [
            'creation_id' => $containerId,
            'access_token' => $token,
        ]);
        if (!$publish->successful()) {
            $this->throwGraphError($publish);
        }

        $mediaId = (string) ($publish->json('id') ?? '');
        if ($mediaId === '') {
            throw SocialPublishException::unknown('Instagram accepted media_publish but returned no media id.');
        }

        return new PublishResult($mediaId, $this->permalinkFor($mediaId, $token), $containerId);
    }

    public function reconcile(SocialChannel $channel, SocialPostDelivery $delivery): ?PublishResult
    {
        $token = $channel->credential('access_token');
        $containerId = trim((string) $delivery->provider_container_id);
        if ($containerId === '' || $token === '') {
            return null;
        }

        // A published container reports status FINISHED and carries no
        // separate media id here; check whether publishing went through by
        // reading the container's status.
        $status = $this->graphGet('/' . $containerId, [
            'fields' => 'status_code',
            'access_token' => $token,
        ]);
        if (!$status->successful()) {
            return null;
        }

        if ((string) $status->json('status_code') === 'PUBLISHED') {
            return new PublishResult($containerId, null, $containerId);
        }

        return null;
    }

    private function waitUntilContainerReady(string $containerId, string $token): void
    {
        $attempts = max(1, (int) config('social.ig_poll_attempts', 10));
        $delay = max(0, (int) config('social.ig_poll_delay', 2));

        for ($i = 0; $i < $attempts; $i++) {
            $status = $this->graphGet('/' . $containerId, [
                'fields' => 'status_code',
                'access_token' => $token,
            ]);
            if (!$status->successful()) {
                $this->throwGraphError($status);
            }

            $code = (string) $status->json('status_code');
            if ($code === 'FINISHED') {
                return;
            }
            if ($code === 'ERROR') {
                throw SocialPublishException::validation('Instagram could not process the media container.');
            }

            if ($i < $attempts - 1 && $delay > 0) {
                sleep($delay);
            }
        }

        // Still in progress: the container survives — reconcile can finish
        // later without creating a duplicate.
        throw SocialPublishException::transient('Instagram media container not ready after polling.');
    }

    private function permalinkFor(string $mediaId, string $token): ?string
    {
        $response = $this->graphGet('/' . $mediaId, [
            'fields' => 'permalink',
            'access_token' => $token,
        ]);

        return $response->successful() && $response->json('permalink')
            ? (string) $response->json('permalink')
            : null;
    }
}
