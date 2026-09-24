<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Signage\Services\SignageNotices;
use App\Domains\Social\Services\AnnouncementTemplates;
use App\Domains\Social\Services\SocialDriverRegistry;
use App\Domains\Social\Services\SocialPublisher;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * One announcement, two places: the social channels and the TV board's
 * notice line (owner's shortlist, 2026-09-24). A closure, changed hours
 * or a holiday greeting is typed once; the social post goes through the
 * ordinary composer path (draft / schedule / now) and the TV notice goes
 * up at once with its own look and expiry. Instagram, which needs a
 * photo, is dropped from a text-only announcement and named in the reply.
 */
class SocialAnnouncementController extends Controller
{
    public function templates(AnnouncementTemplates $templates): JsonResponse
    {
        return response()->json(['templates' => $templates->all()]);
    }

    public function store(Request $request, SocialPublisher $publisher, SocialDriverRegistry $drivers): JsonResponse
    {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:1000'],
            'text_dv' => ['nullable', 'string', 'max:1000'],
            'template' => ['nullable', 'string', 'max:40'],
            'channel_ids' => ['sometimes', 'array'],
            'channel_ids.*' => ['integer', 'exists:social_channels,id'],
            'action' => ['sometimes', Rule::in(['draft', 'schedule', 'now'])],
            'scheduled_at' => ['required_if:action,schedule', 'nullable', 'date', 'after:now'],
            'signage' => ['sometimes', 'array'],
            'signage.enabled' => ['sometimes', 'boolean'],
            'signage.text' => ['nullable', 'string', 'max:160'],
            'signage.text_dv' => ['nullable', 'string', 'max:160'],
            'signage.look' => ['nullable', Rule::in(SignageNotices::LOOKS)],
            'signage.show' => ['nullable', Rule::in(SignageNotices::SHOWS)],
            'signage.seconds' => ['nullable', 'integer', 'min:4', 'max:60'],
            'signage.minutes' => ['nullable', 'integer', 'min:0', 'max:43200'],
        ]);

        $channelIds = array_values(array_unique(array_map('intval', $data['channel_ids'] ?? [])));
        $signageOn = (bool) ($data['signage']['enabled'] ?? false);
        if ($channelIds === [] && !$signageOn) {
            return response()->json(['message' => 'Pick at least one channel or the TV board.'], 422);
        }

        $action = (string) ($data['action'] ?? 'now');
        if ($channelIds !== []) {
            $this->requirePermission($request, match ($action) {
                'now' => 'social.publish',
                'schedule' => 'social.schedule',
                default => 'social.compose',
            });
        }
        if ($signageOn) {
            $this->requirePermission($request, 'signage.manage');
        }

        $text = trim((string) $data['text']);
        $textDv = trim((string) ($data['text_dv'] ?? ''));
        $caption = $textDv !== '' ? $text . "\n" . $textDv : $text;

        $post = null;
        $skipped = [];
        if ($channelIds !== []) {
            $channels = SocialChannel::query()->whereIn('id', $channelIds)->where('is_enabled', true)->get();
            $usable = $channels->filter(function (SocialChannel $c) use ($drivers, &$skipped) {
                if ($drivers->for($c->platform)->capabilities()['requires_photo']) {
                    $skipped[] = $c->name;

                    return false;
                }

                return true;
            });
            if ($usable->isEmpty()) {
                return response()->json(['message' => 'None of those channels can take a text-only post: ' . implode(', ', $skipped)], 422);
            }
            foreach ($usable as $c) {
                $limit = (int) $drivers->for($c->platform)->capabilities()['caption_max'];
                if ($limit > 0 && mb_strlen($caption) > $limit) {
                    return response()->json(['message' => "The announcement is too long for {$c->name} ({$limit} characters)."], 422);
                }
            }

            $post = SocialPost::create([
                'status' => match ($action) {
                    'now' => SocialPost::STATUS_QUEUED,
                    'schedule' => SocialPost::STATUS_SCHEDULED,
                    default => SocialPost::STATUS_DRAFT,
                },
                'snapshot' => ['caption' => $caption, 'image_url' => null, 'image_fingerprint' => null, 'link_url' => url('/hours'), 'item_id' => null, 'price' => null],
                'source' => 'announcement',
                'source_ref' => $data['template'] ?? null,
                'business_date' => now(config('app.timezone', 'Indian/Maldives'))->toDateString(),
                'created_by' => $request->user()?->id,
                'scheduled_at' => $action === 'schedule'
                    ? \Carbon\Carbon::parse((string) $data['scheduled_at'])->setTimezone(config('app.timezone', 'Indian/Maldives'))
                    : null,
            ]);
            if ($action === 'now') {
                $publisher->dispatch($post, $usable->pluck('id')->all());
            } else {
                foreach ($usable as $c) {
                    SocialPostDelivery::create(['social_post_id' => $post->id, 'social_channel_id' => $c->id, 'status' => SocialPostDelivery::STATUS_SCHEDULED]);
                }
            }
        }

        $notice = null;
        if ($signageOn) {
            $s = $data['signage'];
            $minutes = (int) ($s['minutes'] ?? 1440);
            $notice = SignageNotices::add([
                'text' => trim((string) ($s['text'] ?? '')) ?: Str::limit($text, 157),
                'text_dv' => trim((string) ($s['text_dv'] ?? '')) ?: Str::limit($textDv, 157),
                'look' => $s['look'] ?? 'info',
                'show' => $s['show'] ?? 'both',
                'seconds' => $s['seconds'] ?? 10,
                'expires_at' => $minutes > 0 ? now()->addMinutes($minutes)->toIso8601String() : null,
            ]);
        }

        return response()->json([
            'post_id' => $post?->id,
            'post_status' => $post?->status,
            'notice' => $notice,
            'skipped_channels' => $skipped,
        ], 201);
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof \App\Models\User || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }
}
