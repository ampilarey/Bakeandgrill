<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SocialChannel;
use App\Models\SocialPostDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Viber Channel driver (plan §2a / phase 5): webhook-before-post flow,
 * status-code error classification, and the signature-verified webhook
 * endpoint.
 */
class ViberChannelTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'viber-auth-token-abc123';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
    }

    private function channel(): SocialChannel
    {
        return SocialChannel::create([
            'platform' => 'viber',
            'name' => 'BG Viber',
            'credentials' => ['auth_token' => self::TOKEN, 'sender_id' => 'super-admin-01'],
            'is_enabled' => true,
            'is_test_channel' => true,
        ]);
    }

    public function test_publish_registers_the_webhook_then_posts(): void
    {
        Http::fake([
            'chatapi.viber.com/pa/set_webhook' => Http::response(['status' => 0, 'status_message' => 'ok'], 200),
            'chatapi.viber.com/pa/post' => Http::response(['status' => 0, 'message_token' => '5916993'], 200),
        ]);
        $channel = $this->channel();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Fresh hedhikaa now!',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->status);
        $this->assertSame('5916993', $delivery->provider_post_id);

        Http::assertSent(fn ($r) => str_contains($r->url(), '/pa/set_webhook')
            && $r->hasHeader('X-Viber-Auth-Token', self::TOKEN)
            && str_contains((string) $r['url'], '/api/social/viber/webhook'));
        Http::assertSent(fn ($r) => str_contains($r->url(), '/pa/post')
            && $r['from'] === 'super-admin-01'
            && $r['type'] === 'text');
    }

    public function test_invalid_token_is_a_hard_auth_failure(): void
    {
        Http::fake([
            'chatapi.viber.com/*' => Http::response(['status' => 2, 'status_message' => 'invalidAuthToken'], 200),
        ]);
        $channel = $this->channel();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'x',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_FAILED, $delivery->status);
        $this->assertSame(SocialPostDelivery::ERROR_AUTH, $delivery->error_class);
        $this->assertStringNotContainsString(self::TOKEN, (string) $delivery->error_message);
    }

    public function test_photo_posts_send_the_media_url(): void
    {
        Http::fake([
            'chatapi.viber.com/pa/set_webhook' => Http::response(['status' => 0], 200),
            'chatapi.viber.com/pa/post' => Http::response(['status' => 0, 'message_token' => 't1'], 200),
        ]);
        $channel = $this->channel();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Special today',
            'image_url' => 'https://bakeandgrill.mv/storage/m.jpg',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        Http::assertSent(fn ($r) => str_contains($r->url(), '/pa/post')
            && $r['type'] === 'picture'
            && $r['media'] === 'https://bakeandgrill.mv/storage/m.jpg');
    }

    // ── Webhook endpoint ─────────────────────────────────────────────────────

    public function test_webhook_accepts_a_correctly_signed_request(): void
    {
        $this->channel();
        $body = json_encode(['event' => 'webhook', 'timestamp' => 1]);

        $this->call('POST', '/api/social/viber/webhook', [], [], [], [
            'HTTP_X-Viber-Content-Signature' => hash_hmac('sha256', (string) $body, self::TOKEN),
            'CONTENT_TYPE' => 'application/json',
        ], (string) $body)->assertOk()->assertJson(['status' => 0]);
    }

    public function test_webhook_rejects_bad_or_missing_signatures(): void
    {
        $this->channel();
        $body = (string) json_encode(['event' => 'webhook']);

        $this->call('POST', '/api/social/viber/webhook', [], [], [], [
            'HTTP_X-Viber-Content-Signature' => hash_hmac('sha256', $body, 'wrong-token'),
            'CONTENT_TYPE' => 'application/json',
        ], $body)->assertStatus(403);

        $this->call('POST', '/api/social/viber/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
        ], $body)->assertStatus(403);
    }

    public function test_webhook_response_never_leaks_the_token(): void
    {
        $this->channel();
        $body = (string) json_encode(['event' => 'webhook']);

        $res = $this->call('POST', '/api/social/viber/webhook', [], [], [], [
            'HTTP_X-Viber-Content-Signature' => hash_hmac('sha256', $body, self::TOKEN),
            'CONTENT_TYPE' => 'application/json',
        ], $body);

        $this->assertStringNotContainsString(self::TOKEN, $res->getContent());
    }
}
