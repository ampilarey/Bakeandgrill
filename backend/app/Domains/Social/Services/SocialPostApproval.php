<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Social\Jobs\PublishSocialDeliveryJob;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Support\OwnerPhones;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Throwable;

/**
 * Approving and rejecting a post, and approval on the phone (owner's
 * shortlist, 2026-09-24). When an automation drafts a post for approval,
 * the business phone gets one SMS with a signed link, good for a day,
 * that opens a small page showing the post with Approve and Reject —
 * no admin login on the phone needed. The signature is the authority,
 * as the receipt complaint form's token is; a link that leaks lets a
 * stranger approve or reject one draft, nothing more, and the page says
 * who did what.
 */
class SocialPostApproval
{
    public const LINK_HOURS = 24;

    public const APPROVABLE = [SocialPost::STATUS_DRAFT, SocialPost::STATUS_SCHEDULED, SocialPost::STATUS_AWAITING_APPROVAL];

    /** Queue every waiting delivery now. */
    public function approve(SocialPost $post, ?string $by = null): void
    {
        $post->loadMissing('deliveries');
        $post->forceFill(['status' => SocialPost::STATUS_QUEUED, 'scheduled_at' => null])->save();
        foreach ($post->deliveries as $delivery) {
            if ($delivery->status === SocialPostDelivery::STATUS_SCHEDULED) {
                $delivery->forceFill(['status' => SocialPostDelivery::STATUS_QUEUED])->save();
                PublishSocialDeliveryJob::dispatch($delivery->id);
            }
        }
        if ($by !== null) {
            Log::info('social: post approved by link', ['post_id' => $post->id, 'by' => $by]);
        }
    }

    public function reject(SocialPost $post, ?string $by = null): void
    {
        $post->loadMissing('deliveries');
        $post->forceFill(['status' => SocialPost::STATUS_CANCELLED])->save();
        foreach ($post->deliveries as $delivery) {
            if ($delivery->status !== SocialPostDelivery::STATUS_PUBLISHED) {
                $delivery->forceFill(['status' => SocialPostDelivery::STATUS_CANCELLED])->save();
            }
        }
        if ($by !== null) {
            Log::info('social: post rejected by link', ['post_id' => $post->id, 'by' => $by]);
        }
    }

    /** A signed link to the approval page, good for a day. */
    public function link(SocialPost $post): string
    {
        return URL::temporarySignedRoute('social.approve.show', now()->addHours(self::LINK_HOURS), ['post' => $post->id]);
    }

    /** One SMS per drafted post, when the setting is on and there is a phone. */
    public function notify(SocialPost $post): void
    {
        if (!app(SocialPostingRules::class)->all()['approval_sms']) {
            return;
        }
        $what = match ($post->source) {
            'auto_special' => "today's special",
            'auto_new_item' => 'a new dish',
            'auto_featured' => "a chef's pick",
            'auto_weekly' => "the week's specials",
            'auto_stock' => 'a back-in-stock dish',
            'auto_hours' => 'opening hours',
            default => 'a post',
        };
        try {
            foreach (OwnerPhones::for('owner_social_approval') as $phone) {
                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: 'Social: a post about ' . $what . ' is waiting for approval: "' . Str::limit($post->caption(), 60) . '" Approve or reject: ' . $this->link($post),
                    type: 'owner_social_approval',
                    referenceType: 'social_post',
                    referenceId: (string) $post->id,
                    idempotencyKey: 'social-approval:' . $post->id . ':' . $phone,
                ));
            }
        } catch (Throwable $e) {
            Log::warning('social: approval SMS could not be sent', ['post_id' => $post->id, 'error' => $e->getMessage()]);
        }
    }
}
