<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;

/**
 * Facebook Page posts via the Graph API. Photo posts hit /{page}/photos with
 * a public image URL; text-only posts hit /{page}/feed.
 * Credentials: page_id + a long-lived Page access token.
 */
class FacebookPageDriver implements SocialDriverInterface
{
    use MetaGraphSupport;

    public function platform(): string
    {
        return 'facebook';
    }

    public function capabilities(): array
    {
        return ['text' => true, 'photo' => true, 'requires_photo' => false];
    }

    public function requiredCredentials(): array
    {
        return ['page_id', 'access_token'];
    }

    public function publish(SocialChannel $channel, SocialPost $post, SocialPostDelivery $delivery): PublishResult
    {
        $pageId = $channel->credential('page_id');
        $token = $channel->credential('access_token');
        if ($pageId === '' || $token === '') {
            throw SocialPublishException::auth('Facebook channel is missing page_id or access_token.');
        }

        $image = $post->imageUrl();
        if ($image !== null) {
            $response = $this->graphPost("/{$pageId}/photos", [
                'url' => $image,
                'message' => $post->caption(),
                'access_token' => $token,
            ]);
        } else {
            $response = $this->graphPost("/{$pageId}/feed", [
                'message' => $post->caption(),
                'access_token' => $token,
            ]);
        }

        if (!$response->successful()) {
            $this->throwGraphError($response);
        }

        $id = (string) ($response->json('post_id') ?? $response->json('id') ?? '');
        if ($id === '') {
            throw SocialPublishException::unknown('Facebook accepted the request but returned no post id.');
        }

        return new PublishResult($id, 'https://www.facebook.com/' . $id);
    }

    public function reconcile(SocialChannel $channel, SocialPostDelivery $delivery): ?PublishResult
    {
        // Without a recorded provider id there is nothing to look up — the
        // delivery stays unknown for a human to check the page.
        $id = trim((string) $delivery->provider_post_id);
        if ($id === '') {
            return null;
        }

        $response = $this->graphGet('/' . $id, [
            'fields' => 'id,permalink_url',
            'access_token' => $channel->credential('access_token'),
        ]);
        if (!$response->successful()) {
            return null;
        }

        return new PublishResult(
            (string) $response->json('id'),
            $response->json('permalink_url') ? (string) $response->json('permalink_url') : null,
        );
    }
}
