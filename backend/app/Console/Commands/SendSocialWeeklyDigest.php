<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Social\Services\SocialPostingRules;
use App\Models\SocialChannel;
use App\Models\SocialComment;
use App\Models\SocialLinkVisit;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Monday morning (owner's shortlist, 2026-09-24): the social week in one
 * text — posts sent, the best one, visits and orders through the links,
 * comments waiting, drafts waiting, and any channel about to stop
 * working. On by default; silent when there is nothing to say.
 */
class SendSocialWeeklyDigest extends Command
{
    protected $signature = 'social:weekly-digest {--force : Send even if the setting is off}';

    protected $description = 'SMS the owner a summary of the last seven days of social posting';

    public function handle(SmsService $sms, SocialPostingRules $rules): int
    {
        if (!$this->option('force') && !$rules->all()['weekly_digest']) {
            $this->info('Weekly social digest is off.');

            return self::SUCCESS;
        }

        $since = now()->subDays(7);
        $deliveries = SocialPostDelivery::query()
            ->with(['channel:id,platform,name', 'post:id,snapshot'])
            ->withCount(['visits', 'orders'])
            ->where('status', SocialPostDelivery::STATUS_PUBLISHED)
            ->where('published_at', '>=', $since)
            ->get();
        $awaiting = SocialPost::query()->where('status', SocialPost::STATUS_AWAITING_APPROVAL)->count();
        $unread = SocialComment::query()->whereNull('read_at')->count();
        $unwell = SocialChannel::query()->where('is_enabled', true)->get()->filter(
            fn (SocialChannel $c) => in_array(($c->health ?? [])['status'] ?? 'ok', ['warning', 'error'], true),
        );

        if ($deliveries->isEmpty() && $awaiting === 0 && $unread === 0 && $unwell->isEmpty()) {
            $this->info('Nothing to report.');

            return self::SUCCESS;
        }

        $parts = [];
        $posts = $deliveries->pluck('social_post_id')->unique()->count();
        if ($posts > 0) {
            $byPlatform = $deliveries->groupBy(fn ($d) => $d->channel?->platform ?? '?')->map->count()
                ->map(fn ($n, $p) => ucfirst((string) $p) . " {$n}")->implode(', ');
            $parts[] = "{$posts} post" . ($posts === 1 ? '' : 's') . " went out ({$byPlatform})";

            $best = $deliveries->sortByDesc(function ($d) {
                $i = $d->insights ?? [];

                return ((int) ($i['likes'] ?? 0)) + 2 * ((int) ($i['comments'] ?? 0)) + 3 * ((int) ($i['shares'] ?? 0)) + 2 * (int) $d->visits_count + 5 * (int) $d->orders_count;
            })->first();
            if ($best !== null) {
                $i = $best->insights ?? [];
                $score = array_filter([
                    !empty($i['likes']) ? "{$i['likes']} likes" : null,
                    $best->visits_count > 0 ? "{$best->visits_count} visits" : null,
                    $best->orders_count > 0 ? "{$best->orders_count} orders" : null,
                ]);
                $parts[] = 'Best: "' . Str::limit((string) ($best->post?->snapshot['caption'] ?? ''), 40) . '"' . ($score !== [] ? ' (' . implode(', ', $score) . ')' : '');
            }

            $visits = SocialLinkVisit::query()->where('created_at', '>=', $since)->count();
            $orders = (int) $deliveries->sum('orders_count');
            if ($visits > 0 || $orders > 0) {
                $parts[] = "Links: {$visits} visit" . ($visits === 1 ? '' : 's') . ", {$orders} order" . ($orders === 1 ? '' : 's');
            }
        } else {
            $parts[] = 'No posts went out';
        }
        if ($unread > 0) {
            $parts[] = "{$unread} comment" . ($unread === 1 ? '' : 's') . ' unread';
        }
        if ($awaiting > 0) {
            $parts[] = "{$awaiting} draft" . ($awaiting === 1 ? '' : 's') . ' waiting for approval';
        }
        foreach ($unwell as $c) {
            $days = $c->tokenDaysLeft();
            $parts[] = ucfirst($c->platform) . ' "' . $c->name . '": ' . ($days !== null && $days >= 0 ? "token expires in {$days} day" . ($days === 1 ? '' : 's') : 'not working');
        }

        $message = 'Bake & Grill social, last 7 days: ' . implode('. ', $parts) . '. See Social Hub.';

        $phones = OwnerPhones::for('owner_social_digest');
        if ($phones->isEmpty()) {
            $this->warn('Weekly social digest enabled but no owner/manager phone or business_phone set.');

            return self::SUCCESS;
        }

        $weekKey = now()->format('o-\WW');
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: mb_substr($message, 0, 480),
                    type: 'owner_social_digest',
                    referenceType: 'social_weekly_digest',
                    referenceId: $weekKey,
                    idempotencyKey: 'social-weekly:' . $weekKey . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('Failed to send weekly social digest', ['phone' => $phone, 'error' => $e->getMessage()]);
            }
        }
        $this->info('Weekly social digest sent to ' . $phones->count() . ' recipient(s).');
        $this->line($message);

        return self::SUCCESS;
    }
}
