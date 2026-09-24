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
        return ['text' => true, 'photo' => true, 'requires_photo' => false, 'caption_max' => 63206, 'caption_max_photo' => 63206, 'video' => true, 'carousel' => true];
    }

    public function checkHealth(SocialChannel $channel): ChannelHealth
    {
        $pageId = $channel->credential('page_id');
        $token = $channel->credential('access_token');
        if ($pageId === '' || $token === '') {
            return ChannelHealth::error('Facebook channel is missing page_id or access_token.');
        }

        return $this->metaHealth($token, '/' . $pageId, 'name');
    }

    public function insights(SocialChannel $channel, SocialPostDelivery $delivery): ?array
    {
        $id = trim((string) $delivery->provider_post_id);
        if ($id === '') {
            return null;
        }
        $json = $this->graphGetQuiet('/' . $id, [
            'fields' => 'likes.summary(true).limit(0),comments.summary(true).limit(0),shares',
            'access_token' => $channel->credential('access_token'),
        ]);
        if ($json === null) {
            return null;
        }

        return [
            'likes' => (int) ($json['likes']['summary']['total_count'] ?? 0),
            'comments' => (int) ($json['comments']['summary']['total_count'] ?? 0),
            'shares' => (int) ($json['shares']['count'] ?? 0),
        ];
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

        $images = $post->images();
        if (($video = $post->videoUrl()) !== null) {
            // A video by public URL; Facebook fetches and encodes it.
            $response = $this->graphPost("/{$pageId}/videos", [
                'file_url' => $video,
                'description' => $post->captionFor($channel, $delivery),
                'access_token' => $token,
            ]);
        } elseif (count($images) > 1) {
            // Multi-photo post: each photo uploaded unpublished, then one feed
            // post that attaches them all.
            $attached = [];
            foreach ($images as $url) {
                $photo = $this->graphPost("/{$pageId}/photos", [
                    'url' => $url,
                    'published' => 'false',
                    'access_token' => $token,
                ]);
                if (!$photo->successful()) {
                    $this->throwGraphError($photo);
                }
                $attached[] = ['media_fbid' => (string) $photo->json('id')];
            }
            $response = $this->graphPost("/{$pageId}/feed", [
                'message' => $post->captionFor($channel, $delivery),
                'attached_media' => json_encode($attached),
                'access_token' => $token,
            ]);
        } elseif ($images !== []) {
            $response = $this->graphPost("/{$pageId}/photos", [
                'url' => $images[0],
                'message' => $post->captionFor($channel, $delivery),
                'access_token' => $token,
            ]);
        } else {
            $response = $this->graphPost("/{$pageId}/feed", [
                'message' => $post->captionFor($channel, $delivery),
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

    public function comments(SocialChannel $channel, SocialPostDelivery $delivery): ?array
    {
        $id = trim((string) $delivery->provider_post_id);
        if ($id === '') {
            return null;
        }
        $json = $this->graphGetQuiet('/' . $id . '/comments', [
            'fields' => 'id,from{name},message,created_time',
            'order' => 'reverse_chronological',
            'limit' => 50,
            'access_token' => $channel->credential('access_token'),
        ]);
        if ($json === null) {
            return null;
        }

        return array_values(array_map(fn (array $c) => [
            'id' => (string) ($c['id'] ?? ''),
            'author' => $c['from']['name'] ?? null,
            'text' => (string) ($c['message'] ?? ''),
            'posted_at' => $c['created_time'] ?? null,
        ], array_filter($json['data'] ?? [], fn ($c) => is_array($c) && !empty($c['id']))));
    }

    public function reply(SocialChannel $channel, string $commentId, string $message): string
    {
        $response = $this->graphPost('/' . $commentId . '/comments', [
            'message' => $message,
            'access_token' => $channel->credential('access_token'),
        ]);
        if (!$response->successful()) {
            $this->throwGraphError($response);
        }

        return (string) ($response->json('id') ?? '');
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
