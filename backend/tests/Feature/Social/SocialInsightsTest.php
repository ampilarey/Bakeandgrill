<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Social Hub audit, 2026-09-24: "no way to know which posts work". Likes,
 * comments and shares are fetched for published Facebook and Instagram
 * deliveries; Telegram and Viber have nothing to fetch and are left alone.
 */
class SocialInsightsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function published(string $platform, array $credentials, string $providerId, ?string $publishedAt = null): SocialPostDelivery
    {
        $channel = SocialChannel::create([
            'platform' => $platform, 'name' => ucfirst($platform),
            'credentials' => $credentials, 'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $post = SocialPost::create(['status' => SocialPost::STATUS_PUBLISHED, 'snapshot' => ['caption' => 'x'], 'source' => 'manual']);

        return SocialPostDelivery::create([
            'social_post_id' => $post->id,
            'social_channel_id' => $channel->id,
            'status' => SocialPostDelivery::STATUS_PUBLISHED,
            'provider_post_id' => $providerId,
            'published_at' => $publishedAt ?? now()->subDay(),
        ]);
    }

    public function test_facebook_and_instagram_numbers_are_stored_and_the_rest_left_alone(): void
    {
        Http::fake([
            'graph.facebook.com/*/111_222*' => Http::response([
                'likes' => ['summary' => ['total_count' => 12]],
                'comments' => ['summary' => ['total_count' => 3]],
                'shares' => ['count' => 2],
            ], 200),
            'graph.facebook.com/*/MEDIA-7*' => Http::response(['like_count' => 40, 'comments_count' => 5], 200),
        ]);
        $fb = $this->published('facebook', ['page_id' => '111', 'access_token' => 'FB-SECRET'], '111_222');
        $ig = $this->published('instagram', ['ig_user_id' => '9', 'access_token' => 'IG-SECRET'], 'MEDIA-7');
        $tg = $this->published('telegram', ['bot_token' => '1:a', 'chat_id' => '@bg'], '42');
        $stale = $this->published('facebook', ['page_id' => '111', 'access_token' => 'FB-SECRET'], '111_222', now()->subDays(45)->toDateTimeString());

        $this->artisan('social:refresh-insights')->expectsOutputToContain('Refreshed insights for 2 deliveries.')->assertSuccessful();

        $this->assertSame(['likes' => 12, 'comments' => 3, 'shares' => 2], $fb->fresh()->insights);
        $this->assertNotNull($fb->fresh()->insights_at);
        $this->assertSame(['likes' => 40, 'comments' => 5], $ig->fresh()->insights);
        $this->assertNull($tg->fresh()->insights);
        $this->assertNull($stale->fresh()->insights, 'older than a month: not refreshed by the daily job');
        Http::assertNotSent(fn ($r) => str_contains($r->url(), 'telegram'));
    }

    public function test_a_platform_error_leaves_the_delivery_untouched(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['code' => 190, 'message' => 'expired']], 400)]);
        $fb = $this->published('facebook', ['page_id' => '111', 'access_token' => 'FB-SECRET'], '111_222');

        $this->artisan('social:refresh-insights')->assertSuccessful();

        $this->assertNull($fb->fresh()->insights);
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $fb->fresh()->status);
    }

    public function test_the_posts_tab_can_refresh_one_post_and_sees_the_numbers(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'likes' => ['summary' => ['total_count' => 7]],
                'comments' => ['summary' => ['total_count' => 1]],
            ], 200),
        ]);
        $fb = $this->published('facebook', ['page_id' => '111', 'access_token' => 'FB-SECRET'], '111_222');
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $res = $this->postJson("/api/admin/social/posts/{$fb->social_post_id}/insights")->assertOk();

        $this->assertSame(['likes' => 7, 'comments' => 1, 'shares' => 0], $res->json('post.deliveries.0.insights'));
        $this->assertNotNull($res->json('post.deliveries.0.insights_at'));
        $this->assertStringNotContainsString('FB-SECRET', $res->getContent());
        $this->assertSame(7, $this->getJson('/api/admin/social/posts')->json('posts.0.deliveries.0.insights.likes'));
    }
}
