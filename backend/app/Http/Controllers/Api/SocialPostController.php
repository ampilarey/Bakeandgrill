<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Social\Jobs\PublishSocialDeliveryJob;
use App\Domains\Social\Services\SocialAutomationSettings;
use App\Domains\Social\Services\SocialDriverRegistry;
use App\Domains\Social\Services\SocialInsightsRefresher;
use App\Domains\Social\Services\SocialPublisher;
use App\Models\Item;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Services\EffectivePriceService;
use App\Support\SocialPreviewImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

/**
 * The manual composer + queue/history (plan §2c). The route group requires
 * social.view; writes check the finer slugs (compose / schedule / publish)
 * in-method so one controller serves all levels.
 *
 * The snapshot is frozen HERE, at creation: caption, image, link, and the
 * item's current effective price. Later item edits never change a post.
 */
class SocialPostController extends Controller
{
    /**
     * Channel picker for the composer: names and capabilities only — no
     * credential summaries, no failure counts. The full channel endpoint
     * stays owner-only.
     */
    public function channelOptions(SocialDriverRegistry $drivers): JsonResponse
    {
        return response()->json([
            'channels' => SocialChannel::query()
                ->where('is_enabled', true)
                ->orderBy('platform')->orderBy('name')
                ->get(['id', 'platform', 'name', 'language'])
                ->map(fn (SocialChannel $c) => [
                    'id' => $c->id,
                    'platform' => $c->platform,
                    'name' => $c->name,
                    'language' => $c->language ?? 'both',
                ])->values(),
            'platforms' => $drivers->capabilities(),
        ]);
    }

    /**
     * History. Channel test posts are hidden unless asked for
     * (`include_tests=1`) so "Test post" on the Channels tab does not
     * litter the list the owner reads; `status` and `source` narrow it.
     */
    public function index(Request $request): JsonResponse
    {
        $query = SocialPost::query()
            ->with(['deliveries' => fn ($q) => $q->withCount(['visits', 'orders', 'comments'])->with('channel:id,platform,name')])
            ->orderByDesc('id');

        if (!$request->boolean('include_tests')) {
            $query->where('source', '!=', 'channel_test');
        }
        $status = trim((string) $request->input('status', ''));
        if ($status !== '') {
            $query->where('status', $status);
        }
        $source = trim((string) $request->input('source', ''));
        if ($source !== '') {
            $query->where('source', $source);
        }

        $posts = $query->paginate(min(50, max(10, (int) $request->input('per_page', 25))));

        return response()->json([
            'posts' => collect($posts->items())->map(fn (SocialPost $p) => $this->payload($p))->values(),
            'meta' => [
                'current_page' => $posts->currentPage(),
                'last_page' => $posts->lastPage(),
                'total' => $posts->total(),
            ],
        ]);
    }

    public function store(Request $request, SocialPublisher $publisher, SocialDriverRegistry $drivers): JsonResponse
    {
        $data = $request->validate([
            'caption' => ['required', 'string', 'max:10000'],
            'caption_dv' => ['nullable', 'string', 'max:10000'],
            'image_url' => ['nullable', 'string', 'max:500', 'url'],
            'media' => ['sometimes', 'nullable', 'array'],
            'media.type' => ['required_with:media', Rule::in(['photo', 'carousel', 'video'])],
            'media.images' => ['sometimes', 'array', 'max:10'],
            'media.images.*' => ['string', 'url', 'max:500'],
            'media.video_url' => ['nullable', 'string', 'url', 'max:500'],
            'media.video_poster_url' => ['nullable', 'string', 'url', 'max:500'],
            'media.video_bytes' => ['nullable', 'integer', 'min:0'],
            'item_id' => ['nullable', 'integer', 'exists:items,id'],
            'channel_ids' => ['required', 'array', 'min:1'],
            'channel_ids.*' => ['integer', 'exists:social_channels,id'],
            'action' => ['required', Rule::in(['draft', 'schedule', 'now'])],
            'scheduled_at' => ['required_if:action,schedule', 'nullable', 'date', 'after:now'],
        ]);

        $this->requirePermission($request, match ($data['action']) {
            'now' => 'social.publish',
            'schedule' => 'social.schedule',
            default => 'social.compose',
        });

        $channels = SocialChannel::query()->whereIn('id', $data['channel_ids'])->get();
        $snapshot = $this->buildSnapshot($data);
        if ($problem = $this->capabilityProblem($channels, $snapshot, $drivers)) {
            return response()->json(['message' => $problem], 422);
        }

        // Spacing rules: "Post now" too close to another post is offered the
        // next free slot instead; `force` says post anyway.
        if ($data['action'] === 'now' && !$request->boolean('force')) {
            $rules = app(\App\Domains\Social\Services\SocialPostingRules::class);
            if (($why = $rules->conflict(now())) !== null) {
                return response()->json([
                    'message' => $why,
                    'next_free_at' => $rules->nextFreeSlot(now())?->toIso8601String(),
                ], 409);
            }
        }

        $post = SocialPost::create([
            'status' => match ($data['action']) {
                'now' => SocialPost::STATUS_QUEUED,
                'schedule' => SocialPost::STATUS_SCHEDULED,
                default => SocialPost::STATUS_DRAFT,
            },
            'snapshot' => $snapshot,
            'source' => 'manual',
            'business_date' => now(config('app.timezone', 'Indian/Maldives'))->toDateString(),
            'created_by' => $request->user()?->id,
            'scheduled_at' => $data['action'] === 'schedule' ? $this->localTime($data['scheduled_at']) : null,
        ]);

        if ($data['action'] === 'now') {
            $publisher->dispatch($post, $data['channel_ids']);
        } else {
            // Draft/scheduled: create the delivery rows now so the channel
            // choice is frozen with the post; the scheduler (or a later
            // publish action) flips them to queued.
            foreach ($channels as $channel) {
                SocialPostDelivery::create([
                    'social_post_id' => $post->id,
                    'social_channel_id' => $channel->id,
                    'status' => SocialPostDelivery::STATUS_SCHEDULED,
                ]);
            }
        }

        return response()->json(['post' => $this->payload($post->fresh(['deliveries.channel']))], 201);
    }

    public function show(int $id): JsonResponse
    {
        $post = SocialPost::with(['deliveries.channel:id,platform,name'])->findOrFail($id);

        return response()->json(['post' => $this->payload($post)]);
    }

    /**
     * What linking an item to a post would freeze: its shareable photo (or
     * none — the site logo is never offered as a post image), effective
     * price, names and durable link. The composer shows this as the user
     * picks, so the preview is what the platforms will get.
     */
    public function itemPreview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_id' => ['required_without:special_id', 'nullable', 'integer', 'exists:items,id'],
            'special_id' => ['required_without:item_id', 'nullable', 'integer', 'exists:daily_specials,id'],
        ]);
        // "Share" on a special (owner's shortlist): the composer opens on the
        // special's item, with the badge and the offer's last day to hand.
        $special = !empty($data['special_id']) ? \App\Models\DailySpecial::findOrFail((int) $data['special_id']) : null;
        $item = Item::with(['photos', 'category:id,name'])->findOrFail((int) ($special?->item_id ?? $data['item_id']));
        $previews = app(SocialPreviewImage::class);
        $preview = $previews->forItem($item);
        $hasRealPhoto = $preview['url'] !== $previews->siteFallback();
        $resolved = app(EffectivePriceService::class)->resolveUnitPrice($item->id, (float) $item->base_price, $item);

        return response()->json(['item' => [
            'id' => $item->id,
            'name' => (string) $item->name,
            'name_dv' => trim((string) ($item->name_dv ?? '')) ?: null,
            'category' => $item->category?->name,
            'price' => round((float) $resolved->unitPrice, 2),
            'base_price' => round((float) $item->base_price, 2),
            'image_url' => $hasRealPhoto ? $preview['url'] : null,
            'link_url' => url('/menu/' . $item->id),
            'is_sellable' => (bool) $item->is_active && (bool) $item->is_available,
            'special' => $special ? [
                'id' => $special->id,
                'badge_label' => trim((string) ($special->badge_label ?? '')) ?: null,
                'end_date' => $special->end_date?->toDateString(),
                'is_active' => $special->isCurrentlyActive(),
            ] : null,
            // For a carousel: every shareable photo; for a video: the ready renditions.
            'gallery' => $hasRealPhoto ? $previews->galleryFor($item) : [],
            'videos' => \App\Models\SocialVideoRendition::query()
                ->where('item_id', $item->id)
                ->where('status', \App\Models\SocialVideoRendition::STATUS_READY)
                ->orderBy('format')
                ->get()
                ->map(fn (\App\Models\SocialVideoRendition $r) => [
                    'format' => $r->format,
                    'url' => $r->url(),
                    'poster_url' => $r->posterUrl(),
                    'bytes' => (int) $r->bytes,
                    'width' => $r->width,
                    'height' => $r->height,
                ])->values(),
        ]]);
    }

    /**
     * Edit a post that has not gone out: draft, scheduled, or an automation
     * draft awaiting approval. The snapshot is rebuilt (price re-frozen)
     * from the merged input. Automation posts keep their item and channels
     * — only the words and picture can change — so their stale checks and
     * per-day dedupe keys still mean what they say.
     */
    public function update(Request $request, SocialDriverRegistry $drivers, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.compose');
        $post = SocialPost::with('deliveries')->findOrFail($id);
        if (!in_array($post->status, [SocialPost::STATUS_DRAFT, SocialPost::STATUS_SCHEDULED, SocialPost::STATUS_AWAITING_APPROVAL], true)) {
            return response()->json(['message' => 'Only draft, scheduled or awaiting-approval posts can be edited.'], 422);
        }

        $data = $request->validate([
            'caption' => ['sometimes', 'required', 'string', 'max:10000'],
            'caption_dv' => ['sometimes', 'nullable', 'string', 'max:10000'],
            'image_url' => ['sometimes', 'nullable', 'string', 'max:500', 'url'],
            'media' => ['sometimes', 'nullable', 'array'],
            'media.type' => ['required_with:media', Rule::in(['photo', 'carousel', 'video'])],
            'media.images' => ['sometimes', 'array', 'max:10'],
            'media.images.*' => ['string', 'url', 'max:500'],
            'media.video_url' => ['nullable', 'string', 'url', 'max:500'],
            'media.video_poster_url' => ['nullable', 'string', 'url', 'max:500'],
            'media.video_bytes' => ['nullable', 'integer', 'min:0'],

            'item_id' => ['sometimes', 'nullable', 'integer', 'exists:items,id'],
            'channel_ids' => ['sometimes', 'array', 'min:1'],
            'channel_ids.*' => ['integer', 'exists:social_channels,id'],
            'action' => ['sometimes', Rule::in(['draft', 'schedule'])],
            'scheduled_at' => ['nullable', 'date', 'after:now'],
        ]);

        $automated = $post->source !== 'manual';
        $old = $post->snapshot ?? [];
        $merged = [
            'caption' => array_key_exists('caption', $data) ? (string) $data['caption'] : (string) ($old['caption'] ?? ''),
            'caption_dv' => array_key_exists('caption_dv', $data) ? (string) ($data['caption_dv'] ?? '') : (string) ($old['caption_dv'] ?? ''),
            'image_url' => array_key_exists('image_url', $data) ? $data['image_url'] : ($old['image_url'] ?? null),
            'media' => array_key_exists('media', $data) ? $data['media'] : (isset($old['video_url']) || isset($old['images']) ? [
                'type' => !empty($old['video_url']) ? 'video' : 'carousel',
                'images' => $old['images'] ?? [],
                'video_url' => $old['video_url'] ?? null,
                'video_poster_url' => $old['video_poster_url'] ?? null,
                'video_bytes' => $old['video_bytes'] ?? null,
            ] : null),
            'item_id' => $automated || !array_key_exists('item_id', $data) ? ($old['item_id'] ?? null) : $data['item_id'],
        ];
        $snapshot = $this->buildSnapshot($merged);
        if ($automated) {
            // Keep what the automation knew (special id, offer end) so the
            // pre-publish stale check still applies.
            $snapshot = array_merge($old, $snapshot);
        }

        // Channels: manual posts may change them while nothing has gone out.
        if (!$automated && array_key_exists('channel_ids', $data)) {
            $wanted = array_values(array_unique(array_map('intval', $data['channel_ids'])));
            foreach ($post->deliveries as $delivery) {
                if ($delivery->status === SocialPostDelivery::STATUS_SCHEDULED && !in_array($delivery->social_channel_id, $wanted, true)) {
                    $delivery->delete();
                }
            }
            $have = $post->deliveries()->pluck('social_channel_id')->all();
            foreach ($wanted as $channelId) {
                if (!in_array($channelId, $have, true)) {
                    SocialPostDelivery::create([
                        'social_post_id' => $post->id,
                        'social_channel_id' => $channelId,
                        'status' => SocialPostDelivery::STATUS_SCHEDULED,
                    ]);
                }
            }
        }
        $channels = SocialChannel::query()->whereIn('id', $post->deliveries()->pluck('social_channel_id'))->get();
        if ($problem = $this->capabilityProblem($channels, $snapshot, $drivers)) {
            return response()->json(['message' => $problem], 422);
        }

        $status = $post->status;
        $scheduledAt = $post->scheduled_at;
        $action = $data['action'] ?? null;
        if ($status !== SocialPost::STATUS_AWAITING_APPROVAL) {
            if ($action === 'schedule' || ($action === null && $status === SocialPost::STATUS_SCHEDULED && !empty($data['scheduled_at']))) {
                if (empty($data['scheduled_at']) && $scheduledAt === null) {
                    return response()->json(['message' => 'Choose a time to schedule for.'], 422);
                }
                $this->requirePermission($request, 'social.schedule');
                $status = SocialPost::STATUS_SCHEDULED;
                $scheduledAt = !empty($data['scheduled_at']) ? $this->localTime((string) $data['scheduled_at']) : $scheduledAt;
            } elseif ($action === 'draft') {
                $status = SocialPost::STATUS_DRAFT;
                $scheduledAt = null;
            }
        }

        $post->forceFill([
            'snapshot' => $snapshot,
            'status' => $status,
            'scheduled_at' => $scheduledAt,
        ])->save();

        return response()->json(['post' => $this->payload($post->fresh(['deliveries.channel']))]);
    }

    /**
     * GET /admin/social/automation — every automation's settings.
     * `automation` is the daily special (the original shape); `automations`
     * carries all three kinds.
     */
    public function automationSettings(SocialAutomationSettings $settings): JsonResponse
    {
        return response()->json([
            'automation' => $settings->forKind('special'),
            'automations' => $settings->allKinds(),
        ]);
    }

    /**
     * PUT /admin/social/automation. social.publish holders configure it —
     * these settings decide what gets posted publicly. `unattended` is the
     * pilot gate: leave it off until approved posts have run cleanly.
     * `kind` picks the automation (default: the daily special).
     */
    public function updateAutomationSettings(Request $request, SocialAutomationSettings $settings): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');

        $data = $request->validate([
            'kind' => ['sometimes', Rule::in(SocialAutomationSettings::KINDS)],
            'enabled' => ['sometimes', 'boolean'],
            'time' => ['sometimes', 'date_format:H:i'],
            'channel_ids' => ['sometimes', 'array'],
            'channel_ids.*' => ['integer', 'exists:social_channels,id'],
            'template' => ['sometimes', 'string', 'max:2200'],
            'unattended' => ['sometimes', 'boolean'],
            'days' => ['sometimes', 'array'],
            'days.*' => ['integer', 'between:0,6'],
            'max_age_days' => ['sometimes', 'integer', 'between:1,90'],
            'featured_only' => ['sometimes', 'boolean'],
            'min_out_hours' => ['sometimes', 'integer', 'between:0,168'],
        ]);

        $kind = (string) ($data['kind'] ?? 'special');
        $settings->update($data, $kind);

        return response()->json([
            'automation' => $settings->forKind('special'),
            'automations' => $settings->allKinds(),
        ]);
    }

    /** Fetch fresh likes/comments/shares for one post's published deliveries. */
    public function refreshInsights(SocialInsightsRefresher $refresher, int $id): JsonResponse
    {
        $post = SocialPost::findOrFail($id);
        $refresher->refreshPost($post);

        return response()->json(['post' => $this->payload($post->fresh(['deliveries.channel']))]);
    }

    /** Publish (or approve) a draft/scheduled/awaiting-approval post now. */
    public function publishNow(Request $request, SocialPublisher $publisher, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $post = SocialPost::with('deliveries')->findOrFail($id);
        if (!in_array($post->status, [
            SocialPost::STATUS_DRAFT,
            SocialPost::STATUS_SCHEDULED,
            SocialPost::STATUS_AWAITING_APPROVAL,
        ], true)) {
            return response()->json(['message' => 'Only draft, scheduled or awaiting-approval posts can be published.'], 422);
        }

        app(\App\Domains\Social\Services\SocialPostApproval::class)->approve($post);

        return response()->json(['post' => $this->payload($post->fresh(['deliveries.channel']))]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $post = SocialPost::with('deliveries')->findOrFail($id);
        if (in_array($post->status, [SocialPost::STATUS_PUBLISHED, SocialPost::STATUS_PARTIAL_FAILURE], true)) {
            return response()->json(['message' => 'Published posts cannot be cancelled.'], 422);
        }

        $post->forceFill(['status' => SocialPost::STATUS_CANCELLED])->save();
        foreach ($post->deliveries as $delivery) {
            if (!in_array($delivery->status, [SocialPostDelivery::STATUS_PUBLISHED], true)) {
                $delivery->forceFill(['status' => SocialPostDelivery::STATUS_CANCELLED])->save();
            }
        }

        return response()->json(['post' => $this->payload($post->fresh(['deliveries.channel']))]);
    }

    /** Re-queue one failed/unknown delivery (unknown reconciles first). */
    public function retryDelivery(Request $request, int $id, int $deliveryId): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $delivery = SocialPostDelivery::where('social_post_id', $id)->findOrFail($deliveryId);
        if (!in_array($delivery->status, [
            SocialPostDelivery::STATUS_FAILED,
            SocialPostDelivery::STATUS_UNKNOWN,
            SocialPostDelivery::STATUS_SKIPPED,
        ], true)) {
            return response()->json(['message' => 'Only failed, skipped or unknown deliveries can be retried.'], 422);
        }

        if ($delivery->status !== SocialPostDelivery::STATUS_UNKNOWN) {
            $delivery->forceFill(['status' => SocialPostDelivery::STATUS_QUEUED])->save();
        }
        PublishSocialDeliveryJob::dispatch($delivery->id);

        return response()->json(['ok' => true], 202);
    }

    /**
     * Why these channels cannot take this post, or null. Checked after the
     * snapshot is built so an item's photo counts as the image. Caption
     * limits are per platform (Telegram allows 1024 characters on a photo,
     * Instagram 2200) — a post that would be cut or refused at publish
     * time is refused here instead.
     *
     * @param \Illuminate\Support\Collection<int, SocialChannel> $channels
     * @param array<string, mixed> $snapshot
     */
    private function capabilityProblem($channels, array $snapshot, SocialDriverRegistry $drivers): ?string
    {
        $probe = new SocialPost(['snapshot' => $snapshot]);
        $hasVideo = $probe->videoUrl() !== null;
        $hasImage = !empty($snapshot['image_url']) || $hasVideo;

        $needsPhoto = [];
        $noVideo = [];
        $tooLong = [];
        foreach ($channels as $channel) {
            $caps = $drivers->for($channel->platform)->capabilities();
            if (!$hasImage && $caps['requires_photo']) {
                $needsPhoto[] = $channel->name;
            }
            if ($hasVideo && empty($caps['video'])) {
                $noVideo[] = $channel->name;
            }
            // Measured as the channel will receive it: its language setting
            // decides whether the Dhivehi rides along under the English.
            $length = mb_strlen($probe->captionFor($channel));
            $limit = (int) ($hasImage ? $caps['caption_max_photo'] : $caps['caption_max']);
            if ($limit > 0 && $length > $limit) {
                $tooLong[] = "{$channel->name} ({$limit})";
            }
        }

        if ($needsPhoto !== []) {
            return 'These channels require an image: ' . implode(', ', $needsPhoto);
        }
        if ($noVideo !== []) {
            return 'These channels cannot take a video: ' . implode(', ', $noVideo);
        }
        if ($tooLong !== []) {
            return 'The caption is too long for ' . implode(', ', $tooLong) . '.';
        }

        return null;
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed> */
    private function buildSnapshot(array $data): array
    {
        $snapshot = [
            'caption' => (string) $data['caption'],
            'caption_dv' => trim((string) ($data['caption_dv'] ?? '')),
            'image_url' => $data['image_url'] ?? null,
            'image_fingerprint' => !empty($data['image_url']) ? sha1((string) $data['image_url']) : null,
            'link_url' => null,
            'item_id' => null,
            'price' => null,
        ];

        // Media beyond one photo (owner's shortlist, 2026-09-24): a carousel
        // of photos, or a video with its poster. `image_url` stays the
        // representative picture — the first photo, or the poster — so the
        // list, the link preview and Instagram's cover all have one.
        $media = is_array($data['media'] ?? null) ? $data['media'] : null;
        if ($media !== null && ($media['type'] ?? 'photo') === 'video' && !empty($media['video_url'])) {
            $snapshot['video_url'] = (string) $media['video_url'];
            $snapshot['video_poster_url'] = !empty($media['video_poster_url']) ? (string) $media['video_poster_url'] : null;
            $snapshot['video_bytes'] = (int) ($media['video_bytes'] ?? 0);
            if (empty($snapshot['image_url']) && $snapshot['video_poster_url'] !== null) {
                $snapshot['image_url'] = $snapshot['video_poster_url'];
                $snapshot['image_fingerprint'] = sha1($snapshot['video_poster_url']);
            }
        } elseif ($media !== null && ($media['type'] ?? 'photo') === 'carousel') {
            $images = array_values(array_unique(array_filter(array_map(fn ($u) => trim((string) $u), $media['images'] ?? []), fn (string $u) => $u !== '')));
            if (count($images) > 1) {
                $snapshot['images'] = array_slice($images, 0, 10);
            }
            if ($images !== []) {
                $snapshot['image_url'] = $images[0];
                $snapshot['image_fingerprint'] = sha1($images[0]);
            }
        }

        if (!empty($data['item_id'])) {
            $item = Item::with('photos')->find((int) $data['item_id']);
            if ($item !== null) {
                $snapshot['item_id'] = $item->id;
                $snapshot['link_url'] = url('/menu/' . $item->id);
                // Price frozen from EffectivePriceService — never base_price.
                $resolved = app(EffectivePriceService::class)
                    ->resolveUnitPrice($item->id, (float) $item->base_price, $item);
                $snapshot['price'] = round((float) $resolved->unitPrice, 2);
                if (empty($snapshot['image_url'])) {
                    $preview = app(SocialPreviewImage::class)->forItem($item);
                    $snapshot['image_url'] = $preview['url'];
                    $snapshot['image_fingerprint'] = sha1($preview['url']);
                }
            }
        }

        return $snapshot;
    }

    /**
     * A schedule time as the app's zone. The composer sends the browser's
     * local time with its offset; Eloquent would store the wall-clock of
     * that offset unconverted, an hour out for a phone set to Dubai.
     */
    private function localTime(string $value): \Carbon\Carbon
    {
        return \Carbon\Carbon::parse($value)->setTimezone(config('app.timezone', 'Indian/Maldives'));
    }

    private function requirePermission(Request $request, string $slug): void
    {
        $user = $request->user();
        if (!$user instanceof \App\Models\User
            || !app(PermissionService::class)->hasPermission($user, $slug)) {
            abort(403, "Missing permission: {$slug}");
        }
    }

    /** @return array<string, mixed> */
    private function payload(SocialPost $post): array
    {
        return [
            'id' => $post->id,
            'status' => $post->status,
            'snapshot' => $post->snapshot,
            'media_type' => $post->mediaType(),
            'dry_run' => $post->deliveries->isNotEmpty() && $post->deliveries->every(fn (SocialPostDelivery $d) => $d->status === SocialPostDelivery::STATUS_DRY_RUN),
            'source' => $post->source,
            'source_ref' => $post->source_ref,
            'business_date' => $post->business_date?->toDateString(),
            'scheduled_at' => $post->scheduled_at?->toIso8601String(),
            'published_at' => $post->published_at?->toIso8601String(),
            'created_at' => $post->created_at?->toIso8601String(),
            'deliveries' => $post->deliveries->map(fn (SocialPostDelivery $d) => [
                'id' => $d->id,
                'status' => $d->status,
                'channel' => $d->channel ? [
                    'id' => $d->channel->id,
                    'platform' => $d->channel->platform,
                    'name' => $d->channel->name,
                ] : null,
                'permalink' => $d->permalink,
                'error_class' => $d->error_class,
                'error_message' => $d->error_message,
                'attempts' => $d->attempts ?? [],
                'published_at' => $d->published_at?->toIso8601String(),
                'insights' => $d->insights,
                'insights_at' => $d->insights_at?->toIso8601String(),
                // Tracked-link visits and the web orders that followed them.
                'visits' => (int) ($d->visits_count ?? $d->visits()->count()),
                'orders' => (int) ($d->orders_count ?? $d->orders()->count()),
                'comments' => (int) ($d->comments_count ?? $d->comments()->count()),
            ])->values(),
        ];
    }
}
