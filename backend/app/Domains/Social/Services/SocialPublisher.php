<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Social\Drivers\SocialPublishException;
use App\Domains\Social\Jobs\PublishSocialDeliveryJob;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Fans a post out to its channels as queued delivery jobs, owns the
 * fail-closed environment guard, and executes one delivery (called from the
 * job). Failure alerts go through the existing SMS path, rate-limited to
 * one per channel per hour so an expired token cannot SMS staff in a loop.
 */
class SocialPublisher
{
    public function __construct(private readonly SocialDriverRegistry $drivers) {}

    /**
     * Create delivery rows for the post's channels and queue them.
     *
     * @param list<int> $channelIds
     * @return list<SocialPostDelivery>
     */
    public function dispatch(SocialPost $post, array $channelIds, ?string $dedupePrefix = null): array
    {
        $channels = SocialChannel::query()
            ->whereIn('id', $channelIds)
            ->where('is_enabled', true)
            ->get();

        $deliveries = [];
        foreach ($channels as $channel) {
            $dedupeKey = $dedupePrefix !== null
                ? "{$dedupePrefix}:{$channel->id}"
                : null;

            // The nullable-unique dedupe_key is the idempotency lock: a
            // second automated dispatch for the same source + business date
            // + channel refuses at the database, whatever restarted us.
            $delivery = SocialPostDelivery::query()->firstOrCreate(
                $dedupeKey !== null
                    ? ['dedupe_key' => $dedupeKey]
                    : ['social_post_id' => $post->id, 'social_channel_id' => $channel->id],
                [
                    'social_post_id' => $post->id,
                    'social_channel_id' => $channel->id,
                    'status' => SocialPostDelivery::STATUS_QUEUED,
                ],
            );
            if (!$delivery->wasRecentlyCreated) {
                continue; // already dispatched — idempotent
            }

            PublishSocialDeliveryJob::dispatch($delivery->id);
            $deliveries[] = $delivery;
        }

        if ($deliveries !== []) {
            $post->forceFill(['status' => SocialPost::STATUS_QUEUED])->save();
        }

        return $deliveries;
    }

    /**
     * Fail-closed guard: outside production nothing publishes unless the
     * flag is on AND the channel is explicitly a test channel (plan §2f).
     */
    public function publishingAllowed(SocialChannel $channel): bool
    {
        if (app()->environment('production')) {
            return true;
        }

        return (bool) config('social.publish_allowed', false) && $channel->is_test_channel;
    }

    /** Execute one delivery. Called from the queued job. */
    public function deliver(SocialPostDelivery $delivery): void
    {
        $delivery->loadMissing(['post', 'channel']);
        $post = $delivery->post;
        $channel = $delivery->channel;
        if ($post === null || $channel === null) {
            return;
        }

        // Terminal states never re-run: a published/cancelled delivery that
        // gets re-queued (worker restart, manual retry race) is a no-op.
        if (in_array($delivery->status, [
            SocialPostDelivery::STATUS_PUBLISHED,
            SocialPostDelivery::STATUS_CANCELLED,
            SocialPostDelivery::STATUS_SKIPPED,
        ], true)) {
            return;
        }

        if (!$this->publishingAllowed($channel)) {
            $delivery->recordAttempt('skipped', 'environment guard');
            $delivery->forceFill([
                'status' => SocialPostDelivery::STATUS_SKIPPED,
                'error_class' => SocialPostDelivery::ERROR_ENVIRONMENT_GUARD,
                'error_message' => 'Publishing refused: not production and channel is not an enabled test channel.',
            ])->save();
            $post->refreshStatusFromDeliveries();
            Log::warning('social: environment guard refused publish', [
                'delivery_id' => $delivery->id,
                'channel_id' => $channel->id,
            ]);

            return;
        }

        $driver = $this->drivers->for($channel->platform);

        // An unknown outcome reconciles before any new attempt — the
        // provider may already show the post (plan §2c).
        if ($delivery->status === SocialPostDelivery::STATUS_UNKNOWN) {
            $confirmed = $driver->reconcile($channel, $delivery);
            if ($confirmed !== null) {
                $this->markPublished($delivery, $post, $channel, $confirmed->providerPostId, $confirmed->permalink);

                return;
            }
        }

        $delivery->forceFill(['status' => SocialPostDelivery::STATUS_PROCESSING])->save();

        try {
            $result = $driver->publish($channel, $post, $delivery);
        } catch (SocialPublishException $e) {
            $this->markFailure($delivery, $post, $channel, $e);

            if ($e->isRetryable()) {
                throw $e; // let the queue retry with backoff
            }

            return;
        }

        $this->markPublished($delivery, $post, $channel, $result->providerPostId, $result->permalink);
    }

    private function markPublished(
        SocialPostDelivery $delivery,
        SocialPost $post,
        SocialChannel $channel,
        string $providerPostId,
        ?string $permalink,
    ): void {
        $delivery->recordAttempt('published');
        $delivery->forceFill([
            'status' => SocialPostDelivery::STATUS_PUBLISHED,
            'provider_post_id' => $providerPostId,
            'permalink' => $permalink,
            'error_class' => null,
            'error_message' => null,
            'published_at' => now(),
        ])->save();
        $channel->forceFill(['last_published_at' => now()])->save();
        $post->refreshStatusFromDeliveries();
    }

    private function markFailure(
        SocialPostDelivery $delivery,
        SocialPost $post,
        SocialChannel $channel,
        SocialPublishException $e,
    ): void {
        $isUnknown = $e->errorClass === SocialPostDelivery::ERROR_UNKNOWN;
        $delivery->recordAttempt($isUnknown ? 'unknown' : 'failed', $e->getMessage());
        $delivery->forceFill([
            'status' => $isUnknown
                ? SocialPostDelivery::STATUS_UNKNOWN
                : ($e->isRetryable() ? SocialPostDelivery::STATUS_QUEUED : SocialPostDelivery::STATUS_FAILED),
            'error_class' => $e->errorClass,
            'error_message' => $e->getMessage(),
        ])->save();

        if (!$e->isRetryable()) {
            $post->refreshStatusFromDeliveries();
            $this->alertFailure($channel, $e);
        }
    }

    /**
     * One SMS per channel per alert interval, and only when a business
     * phone is configured. Never includes credentials — only the platform,
     * channel name and error class.
     */
    private function alertFailure(SocialChannel $channel, SocialPublishException $e): void
    {
        $interval = max(60, (int) config('social.alert_interval', 3600));
        if (!Cache::add("social-alert:{$channel->id}", 1, $interval)) {
            return; // already alerted within the interval
        }

        $phone = trim((string) SiteSetting::get('business_phone', ''));
        if ($phone === '') {
            return;
        }

        try {
            app(SmsService::class)->send(new SmsMessage(
                to: $phone,
                message: "Social post to {$channel->platform} channel \"{$channel->name}\" failed ({$e->errorClass}). Check Social Hub in admin.",
                type: 'system',
                referenceType: 'social_channel',
                referenceId: (string) $channel->id,
            ));
        } catch (Throwable $smsError) {
            Log::warning('social: failure alert SMS could not be sent', [
                'channel_id' => $channel->id,
                'error' => $smsError->getMessage(),
            ]);
        }
    }
}
