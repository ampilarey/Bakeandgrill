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
     * @return array{text: bool, photo: bool, requires_photo: bool}
     */
    public function capabilities(): array;

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
