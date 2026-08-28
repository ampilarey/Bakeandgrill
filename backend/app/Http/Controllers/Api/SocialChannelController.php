<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Social\Services\SocialDriverRegistry;
use App\Domains\Social\Services\SocialPublisher;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

/**
 * Channel connections. Owner-only (social.channels.manage): credentials
 * post as the business. Credentials are WRITE-ONLY — every response goes
 * through payload(), which exposes a masked summary and never the values.
 */
class SocialChannelController extends Controller
{
    public function __construct(private readonly SocialDriverRegistry $drivers) {}

    public function index(): JsonResponse
    {
        return response()->json([
            'channels' => SocialChannel::query()->orderBy('platform')->orderBy('name')->get()
                ->map(fn (SocialChannel $c) => $this->payload($c))->values(),
            'platforms' => $this->drivers->capabilities(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform' => ['required', Rule::in(SocialChannel::PLATFORMS)],
            'name' => ['required', 'string', 'max:100'],
            'credentials' => ['required', 'array'],
            'credentials.*' => ['string', 'max:500'],
            'remote_account_id' => ['nullable', 'string', 'max:100'],
            'is_enabled' => ['sometimes', 'boolean'],
            'is_test_channel' => ['sometimes', 'boolean'],
        ]);

        $this->assertRequiredCredentials($data['platform'], $data['credentials']);

        $channel = SocialChannel::create($data);

        return response()->json(['channel' => $this->payload($channel)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $channel = SocialChannel::findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            // Full replacement on rotate — merging old and new secret parts
            // invites stale halves.
            'credentials' => ['sometimes', 'array'],
            'credentials.*' => ['string', 'max:500'],
            'remote_account_id' => ['sometimes', 'nullable', 'string', 'max:100'],
            'is_enabled' => ['sometimes', 'boolean'],
            'is_test_channel' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('credentials', $data)) {
            $this->assertRequiredCredentials($channel->platform, $data['credentials']);
        }

        $channel->update($data);

        return response()->json(['channel' => $this->payload($channel->fresh())]);
    }

    public function destroy(int $id): JsonResponse
    {
        $channel = SocialChannel::findOrFail($id);
        // Deliveries reference the channel; disable + strip credentials
        // instead of deleting history.
        $channel->forceFill([
            'is_enabled' => false,
            'credentials' => null,
        ])->save();
        if (!$channel->deliveries()->exists()) {
            $channel->delete();
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Publish a small test post to exactly this channel — subject to the
     * same fail-closed environment guard as everything else.
     */
    public function testPost(Request $request, SocialPublisher $publisher, int $id): JsonResponse
    {
        $channel = SocialChannel::findOrFail($id);

        $post = SocialPost::create([
            'status' => SocialPost::STATUS_QUEUED,
            'snapshot' => [
                'caption' => 'Test post from Bake & Grill admin — please ignore.',
                'image_url' => $request->string('image_url')->toString() ?: null,
            ],
            'source' => 'channel_test',
            'source_ref' => 'channel:' . $channel->id,
            'business_date' => now(config('app.timezone', 'Indian/Maldives'))->toDateString(),
            'created_by' => $request->user()?->id,
        ]);

        $deliveries = $publisher->dispatch($post, [$channel->id]);
        if ($deliveries === []) {
            $post->forceFill(['status' => SocialPost::STATUS_FAILED])->save();

            return response()->json([
                'message' => 'Channel is disabled — enable it before sending a test post.',
            ], 422);
        }

        return response()->json(['post_id' => $post->id, 'delivery_id' => $deliveries[0]->id], 202);
    }

    /** @param array<string, mixed> $credentials */
    private function assertRequiredCredentials(string $platform, array $credentials): void
    {
        $required = $this->drivers->for($platform)->requiredCredentials();
        $missing = array_values(array_filter(
            $required,
            fn (string $key) => trim((string) ($credentials[$key] ?? '')) === '',
        ));
        if ($missing !== []) {
            abort(422, 'Missing credentials for ' . $platform . ': ' . implode(', ', $missing));
        }
    }

    /** @return array<string, mixed> */
    private function payload(SocialChannel $channel): array
    {
        return [
            'id' => $channel->id,
            'platform' => $channel->platform,
            'name' => $channel->name,
            'remote_account_id' => $channel->remote_account_id,
            'is_enabled' => $channel->is_enabled,
            'is_test_channel' => $channel->is_test_channel,
            'last_published_at' => $channel->last_published_at?->toIso8601String(),
            // Masked: which keys exist + last 4 chars. Never the values.
            'credential_summary' => $channel->credentialSummary(),
            'has_credentials' => ($channel->credentials ?? []) !== [],
            'recent_failures' => $channel->deliveries()
                ->whereIn('status', [SocialPostDelivery::STATUS_FAILED, SocialPostDelivery::STATUS_UNKNOWN])
                ->where('updated_at', '>=', now()->subDays(7))
                ->count(),
        ];
    }
}
