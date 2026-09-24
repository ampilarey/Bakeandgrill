<?php

declare(strict_types=1);

namespace App\Domains\Social\Drivers;

use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;

/**
 * One platform. Drivers declare capabilities rather than pretending every
 * platform supports the same trio of calls (plan §2b): Instagram requires an
 * image and publishes through an async container flow; Telegram happily
 * sends bare text.
 */
interface SocialDriverInterface
{
    public function platform(): string;

    /**
     * `caption_max` is the platform's limit for a text post and
     * `caption_max_photo` the (sometimes tighter) limit when a photo is
     * attached — the composer and the store endpoint both check them.
     *
     * `video` and `carousel` say whether the platform takes a video post
     * and a multi-photo post; a driver without carousel posts the first
     * photo instead, a driver without video is refused at compose time.
     *
     * @return array{text: bool, photo: bool, requires_photo: bool, caption_max: int, caption_max_photo: int, video: bool, carousel: bool}
     */
    public function capabilities(): array;

    /**
     * Ask the platform whether the stored credentials still reach the
     * account, and when the token expires if it knows. Never throws:
     * a network failure is an `error` result with the reason.
     */
    public function checkHealth(SocialChannel $channel): ChannelHealth;

    /**
     * Engagement numbers for a published delivery (likes, comments,
     * shares…) or null when the platform offers none through its API.
     *
     * @return array<string, int>|null
     */
    public function insights(SocialChannel $channel, SocialPostDelivery $delivery): ?array;

    /**
     * Which credential keys a channel of this platform must carry.
     *
     * @return list<string>
     */
    public function requiredCredentials(): array;

    /**
     * Publish the post's snapshot to the channel. Throws
     * SocialPublishException with a classification on failure. May update
     * $delivery->provider_container_id mid-flight (IG) so an interrupted
     * publish can be reconciled.
     */
    public function publish(SocialChannel $channel, SocialPost $post, SocialPostDelivery $delivery): PublishResult;

    /**
     * Resolve an `unknown` outcome: did the provider actually accept the
     * post? Returns a result when it can confirm publication, null when it
     * can confirm nothing (the delivery stays unknown for a human).
     */
    public function reconcile(SocialChannel $channel, SocialPostDelivery $delivery): ?PublishResult;
}
