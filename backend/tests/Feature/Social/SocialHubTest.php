<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Social Hub core (docs/SOCIAL_SHARING_PLAN.md §2). The load-bearing pieces:
 * the fail-closed environment guard, write-only encrypted credentials,
 * owner-only channel management, delivery idempotency, and honest error
 * classification. Platform HTTP is always faked — no real calls.
 */
class SocialHubTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.ig_poll_delay' => 0]);
    }

    private function channel(array $attrs = []): SocialChannel
    {
        return SocialChannel::create(array_merge([
            'platform' => 'facebook',
            'name' => 'Main Page',
            'credentials' => ['page_id' => '111222', 'access_token' => 'FB-SECRET-TOKEN-9999'],
            'is_enabled' => true,
            // Tests run outside production: default to the state the guard
            // allows so publish tests exercise the drivers.
            'is_test_channel' => true,
        ], $attrs));
    }

    private function allowPublishing(): void
    {
        config(['social.publish_allowed' => true]);
    }

    private function actingAsOwner(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function actingAsManager(): void
    {
        Sanctum::actingAs($this->makeManager(), ['staff']);
    }

    // ── Permissions ─────────────────────────────────────────────────────────

    public function test_plain_staff_get_403_everywhere(): void
    {
        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);

        $this->getJson('/api/admin/social/posts')->assertStatus(403);
        $this->getJson('/api/admin/social/channels')->assertStatus(403);
    }

    public function test_manager_sees_posts_but_not_channels(): void
    {
        // social.view/compose/schedule/publish are manager-grantable;
        // social.channels.manage (the tokens) is owner-only.
        $this->actingAsManager();

        $this->getJson('/api/admin/social/posts')->assertOk();
        $this->getJson('/api/admin/social/channels')->assertStatus(403);
    }

    public function test_owner_manages_channels(): void
    {
        $this->actingAsOwner();

        $this->getJson('/api/admin/social/channels')->assertOk();
    }

    // ── Secrets ─────────────────────────────────────────────────────────────

    public function test_credentials_are_write_only_and_masked(): void
    {
        $this->actingAsOwner();

        $res = $this->postJson('/api/admin/social/channels', [
            'platform' => 'telegram',
            'name' => 'BG Channel',
            'credentials' => ['bot_token' => '12345:AAA-VERY-SECRET-BOT-TOKEN', 'chat_id' => '@bakeandgrill'],
        ])->assertCreated();

        // Never the raw token — in the create response or in the listing.
        $this->assertStringNotContainsString('VERY-SECRET-BOT-TOKEN', $res->getContent());
        $list = $this->getJson('/api/admin/social/channels')->assertOk();
        $this->assertStringNotContainsString('VERY-SECRET-BOT-TOKEN', $list->getContent());
        $this->assertSame('••••OKEN', $list->json('channels.0.credential_summary.bot_token'));
    }

    public function test_credentials_are_encrypted_at_rest(): void
    {
        $channel = $this->channel();

        $raw = (string) DB::table('social_channels')->where('id', $channel->id)->value('credentials');
        $this->assertStringNotContainsString('FB-SECRET-TOKEN-9999', $raw);
        $this->assertSame('FB-SECRET-TOKEN-9999', $channel->fresh()->credential('access_token'));
    }

    public function test_missing_required_credentials_are_rejected(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/channels', [
            'platform' => 'facebook',
            'name' => 'Broken',
            'credentials' => ['page_id' => '1'],
        ])->assertStatus(422);
    }

    // ── Environment guard (fail closed) ─────────────────────────────────────

    public function test_guard_refuses_non_test_channels_outside_production(): void
    {
        Http::fake();
        $this->allowPublishing();
        $channel = $this->channel(['is_test_channel' => false]);
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Hello',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_SKIPPED, $delivery->status);
        $this->assertSame(SocialPostDelivery::ERROR_ENVIRONMENT_GUARD, $delivery->error_class);
        $this->assertSame(SocialPost::STATUS_FAILED, SocialPost::firstOrFail()->status);
        Http::assertNothingSent();
    }

    public function test_guard_refuses_when_flag_is_off_even_for_test_channels(): void
    {
        Http::fake();
        config(['social.publish_allowed' => false]);
        $channel = $this->channel(); // is_test_channel = true
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Hello',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $this->assertSame(SocialPostDelivery::STATUS_SKIPPED, SocialPostDelivery::firstOrFail()->status);
        Http::assertNothingSent();
    }

    // ── Publishing (faked platforms) ────────────────────────────────────────

    public function test_facebook_photo_post_publishes(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response(['post_id' => '111222_333'], 200),
        ]);
        $this->allowPublishing();
        $channel = $this->channel();
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Fresh masroshi!',
            'image_url' => 'https://bakeandgrill.mv/storage/item.jpg',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->status);
        $this->assertSame('111222_333', $delivery->provider_post_id);
        $this->assertSame(SocialPost::STATUS_PUBLISHED, SocialPost::firstOrFail()->status);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), '/111222/photos')
                && $request['url'] === 'https://bakeandgrill.mv/storage/item.jpg';
        });
    }

    public function test_instagram_container_flow_publishes(): void
    {
        Http::fake([
            '*/999888/media' => Http::response(['id' => 'CONTAINER-1'], 200),
            '*/CONTAINER-1*' => Http::response(['status_code' => 'FINISHED'], 200),
            '*/999888/media_publish' => Http::response(['id' => 'MEDIA-77'], 200),
            '*/MEDIA-77*' => Http::response(['permalink' => 'https://instagram.com/p/x'], 200),
        ]);
        $this->allowPublishing();
        $channel = $this->channel([
            'platform' => 'instagram',
            'name' => 'IG',
            'credentials' => ['ig_user_id' => '999888', 'access_token' => 'IG-TOKEN'],
        ]);
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Fresh from the grill',
            'image_url' => 'https://bakeandgrill.mv/storage/item.jpg',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->status);
        $this->assertSame('MEDIA-77', $delivery->provider_post_id);
        $this->assertSame('CONTAINER-1', $delivery->provider_container_id);
        $this->assertSame('https://instagram.com/p/x', $delivery->permalink);
    }

    public function test_instagram_requires_an_image(): void
    {
        $this->allowPublishing();
        $channel = $this->channel([
            'platform' => 'instagram',
            'name' => 'IG',
            'credentials' => ['ig_user_id' => '999888', 'access_token' => 'IG-TOKEN'],
        ]);
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'No image here',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertStatus(422);
    }

    public function test_telegram_post_publishes(): void
    {
        Http::fake([
            'api.telegram.org/*' => Http::response([
                'ok' => true,
                'result' => ['message_id' => 42, 'chat' => ['username' => 'bakeandgrill']],
            ], 200),
        ]);
        $this->allowPublishing();
        $channel = $this->channel([
            'platform' => 'telegram',
            'name' => 'TG',
            'credentials' => ['bot_token' => '1:abc', 'chat_id' => '@bakeandgrill'],
        ]);
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Special today',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->status);
        $this->assertSame('https://t.me/bakeandgrill/42', $delivery->permalink);
    }

    // ── Error classification & unknown outcomes ─────────────────────────────

    public function test_expired_token_is_a_hard_auth_failure(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response([
                'error' => ['code' => 190, 'message' => 'Error validating access token'],
            ], 400),
        ]);
        $this->allowPublishing();
        $channel = $this->channel();
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Will fail',
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_FAILED, $delivery->status);
        $this->assertSame(SocialPostDelivery::ERROR_AUTH, $delivery->error_class);
        // The token itself never leaks into the stored error.
        $this->assertStringNotContainsString('FB-SECRET-TOKEN-9999', (string) $delivery->error_message);
        $this->assertSame(SocialPost::STATUS_FAILED, SocialPost::firstOrFail()->status);
    }

    public function test_unknown_outcome_reconciles_instead_of_reposting(): void
    {
        // An interrupted IG publish left a container id and status unknown.
        // The retry must ask Instagram what happened — and when the answer
        // is PUBLISHED, confirm without creating any new media.
        $this->allowPublishing();
        $channel = $this->channel([
            'platform' => 'instagram',
            'name' => 'IG',
            'credentials' => ['ig_user_id' => '999888', 'access_token' => 'IG-TOKEN'],
        ]);
        $post = SocialPost::create([
            'status' => SocialPost::STATUS_QUEUED,
            'snapshot' => ['caption' => 'x', 'image_url' => 'https://bakeandgrill.mv/i.jpg'],
            'source' => 'manual',
        ]);
        $delivery = SocialPostDelivery::create([
            'social_post_id' => $post->id,
            'social_channel_id' => $channel->id,
            'status' => SocialPostDelivery::STATUS_UNKNOWN,
            'provider_container_id' => 'CONTAINER-9',
        ]);

        Http::fake([
            '*/CONTAINER-9*' => Http::response(['status_code' => 'PUBLISHED'], 200),
        ]);

        app(\App\Domains\Social\Services\SocialPublisher::class)->deliver($delivery);

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->fresh()->status);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/media_publish'));
        Http::assertNotSent(fn ($request) => str_ends_with(parse_url($request->url(), PHP_URL_PATH) ?? '', '/999888/media'));
    }

    // ── Idempotency ─────────────────────────────────────────────────────────

    public function test_automated_dispatch_is_idempotent_per_dedupe_key(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->allowPublishing();
        $channel = $this->channel();
        $post = SocialPost::create([
            'status' => SocialPost::STATUS_QUEUED,
            'snapshot' => ['caption' => 'auto', 'image_url' => null],
            'source' => 'auto_special',
            'source_ref' => 'special:5',
            'business_date' => '2026-08-28',
        ]);

        $publisher = app(\App\Domains\Social\Services\SocialPublisher::class);
        $first = $publisher->dispatch($post, [$channel->id], 'auto_special:5:2026-08-28');
        $second = $publisher->dispatch($post, [$channel->id], 'auto_special:5:2026-08-28');

        $this->assertCount(1, $first);
        $this->assertCount(0, $second, 'a second dispatch for the same automation/date/channel must be a no-op');
        $this->assertSame(1, SocialPostDelivery::count());
    }

    public function test_published_delivery_never_republishes(): void
    {
        Http::fake();
        $this->allowPublishing();
        $channel = $this->channel();
        $post = SocialPost::create([
            'status' => SocialPost::STATUS_PUBLISHED,
            'snapshot' => ['caption' => 'done'],
            'source' => 'manual',
        ]);
        $delivery = SocialPostDelivery::create([
            'social_post_id' => $post->id,
            'social_channel_id' => $channel->id,
            'status' => SocialPostDelivery::STATUS_PUBLISHED,
            'provider_post_id' => 'p9',
        ]);

        app(\App\Domains\Social\Services\SocialPublisher::class)->deliver($delivery);

        Http::assertNothingSent();
    }

    // ── Snapshot & scheduling ────────────────────────────────────────────────

    public function test_snapshot_freezes_item_price_and_link(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->allowPublishing();
        $channel = $this->channel();
        $item = \App\Models\Item::factory()->create(['base_price' => 45, 'name' => 'Masroshi']);
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Masroshi MVR 45',
            'image_url' => 'https://bakeandgrill.mv/storage/m.jpg',
            'item_id' => $item->id,
            'channel_ids' => [$channel->id],
            'action' => 'now',
        ])->assertCreated();

        $snapshot = SocialPost::firstOrFail()->snapshot;
        $this->assertSame(45.0, (float) $snapshot['price']);
        $this->assertSame(url('/menu/' . $item->id), $snapshot['link_url']);

        // Changing the item later never touches the frozen snapshot.
        $item->update(['base_price' => 60]);
        $this->assertSame(45.0, (float) SocialPost::firstOrFail()->snapshot['price']);
    }

    public function test_scheduled_post_fires_via_the_console_command(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->allowPublishing();
        $channel = $this->channel();
        $this->actingAsOwner();

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Later today',
            'channel_ids' => [$channel->id],
            'action' => 'schedule',
            'scheduled_at' => now()->addMinute()->toDateTimeString(),
        ])->assertCreated();

        $this->assertSame(SocialPost::STATUS_SCHEDULED, SocialPost::firstOrFail()->status);
        Http::assertNothingSent();

        $this->travel(2)->minutes();
        $this->artisan('social:publish-due')->assertSuccessful();

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status);
        $this->assertSame(SocialPost::STATUS_PUBLISHED, SocialPost::firstOrFail()->status);
    }

    public function test_cancel_stops_a_scheduled_post(): void
    {
        $channel = $this->channel();
        $this->actingAsOwner();

        $id = $this->postJson('/api/admin/social/posts', [
            'caption' => 'Never mind',
            'channel_ids' => [$channel->id],
            'action' => 'schedule',
            'scheduled_at' => now()->addHour()->toDateTimeString(),
        ])->assertCreated()->json('post.id');

        $this->postJson("/api/admin/social/posts/{$id}/cancel")->assertOk();

        Http::fake();
        $this->travel(2)->hours();
        $this->artisan('social:publish-due')->assertSuccessful();
        Http::assertNothingSent();
        $this->assertSame(SocialPostDelivery::STATUS_CANCELLED, SocialPostDelivery::firstOrFail()->status);
    }
}
