<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Services\SocialPublisher;
use App\Models\SocialPost;
use Illuminate\Console\Command;

/**
 * Queues deliveries for manually scheduled posts whose time has come.
 * The delivery rows were created at scheduling time, so re-runs and
 * scheduler restarts re-dispatch only rows still queued — publishing
 * itself is idempotent at the delivery level.
 */
class PublishDueSocialPosts extends Command
{
    protected $signature = 'social:publish-due';

    protected $description = 'Queue social post deliveries whose scheduled time has arrived';

    public function handle(SocialPublisher $publisher): int
    {
        $due = SocialPost::query()
            ->where('status', SocialPost::STATUS_SCHEDULED)
            ->where('scheduled_at', '<=', now())
            ->orderBy('scheduled_at')
            ->limit(20)
            ->get();

        foreach ($due as $post) {
            $channelIds = $post->deliveries()->pluck('social_channel_id')->all();
            $post->forceFill(['status' => SocialPost::STATUS_QUEUED])->save();
            foreach ($post->deliveries()->where('status', \App\Models\SocialPostDelivery::STATUS_SCHEDULED)->get() as $delivery) {
                $delivery->forceFill(['status' => \App\Models\SocialPostDelivery::STATUS_QUEUED])->save();
                \App\Domains\Social\Jobs\PublishSocialDeliveryJob::dispatch($delivery->id);
            }
            $this->info("Queued post {$post->id} for channels: " . implode(',', $channelIds));
        }

        return self::SUCCESS;
    }
}
