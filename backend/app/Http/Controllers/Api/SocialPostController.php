<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Social\Jobs\PublishSocialDeliveryJob;
use App\Domains\Social\Services\SocialDriverRegistry;
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
                ->get(['id', 'platform', 'name'])
                ->map(fn (SocialChannel $c) => [
                    'id' => $c->id,
                    'platform' => $c->platform,
                    'name' => $c->name,
                ])->values(),
            'platforms' => $drivers->capabilities(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $posts = SocialPost::query()
            ->with(['deliveries.channel:id,platform,name'])
            ->orderByDesc('id')
            ->paginate(min(50, max(10, (int) $request->input('per_page', 25))));

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
            'caption' => ['required', 'string', 'max:2200'],
            'image_url' => ['nullable', 'string', 'max:500', 'url'],
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

        // Capability check up front: a caption-only post cannot go to a
        // platform that requires an image.
        if (empty($data['image_url'])) {
            $needsPhoto = $channels->filter(
                fn (SocialChannel $c) => $drivers->for($c->platform)->capabilities()['requires_photo'],
            );
            if ($needsPhoto->isNotEmpty()) {
                return response()->json([
                    'message' => 'These channels require an image: '
                        . $needsPhoto->pluck('name')->implode(', '),
                ], 422);
            }
        }

        $post = SocialPost::create([
            'status' => match ($data['action']) {
                'now' => SocialPost::STATUS_QUEUED,
                'schedule' => SocialPost::STATUS_SCHEDULED,
                default => SocialPost::STATUS_DRAFT,
            },
            'snapshot' => $this->buildSnapshot($data),
            'source' => 'manual',
            'business_date' => now(config('app.timezone', 'Indian/Maldives'))->toDateString(),
            'created_by' => $request->user()?->id,
            'scheduled_at' => $data['action'] === 'schedule' ? $data['scheduled_at'] : null,
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

    /** Publish a draft/scheduled post immediately. */
    public function publishNow(Request $request, SocialPublisher $publisher, int $id): JsonResponse
    {
        $this->requirePermission($request, 'social.publish');
        $post = SocialPost::with('deliveries')->findOrFail($id);
        if (!in_array($post->status, [SocialPost::STATUS_DRAFT, SocialPost::STATUS_SCHEDULED], true)) {
            return response()->json(['message' => 'Only draft or scheduled posts can be published.'], 422);
        }

        $post->forceFill(['status' => SocialPost::STATUS_QUEUED, 'scheduled_at' => null])->save();
        foreach ($post->deliveries as $delivery) {
            if ($delivery->status === SocialPostDelivery::STATUS_SCHEDULED) {
                $delivery->forceFill(['status' => SocialPostDelivery::STATUS_QUEUED])->save();
                PublishSocialDeliveryJob::dispatch($delivery->id);
            }
        }

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

    /** @param array<string, mixed> $data
     * @return array<string, mixed> */
    private function buildSnapshot(array $data): array
    {
        $snapshot = [
            'caption' => (string) $data['caption'],
            'image_url' => $data['image_url'] ?? null,
            'image_fingerprint' => !empty($data['image_url']) ? sha1((string) $data['image_url']) : null,
            'link_url' => null,
            'item_id' => null,
            'price' => null,
        ];

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
            'source' => $post->source,
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
            ])->values(),
        ];
    }
}
