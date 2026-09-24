<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Services\OrderCreationService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Middleware\RecordSocialVisit;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemShareEvent;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SocialChannel;
use App\Models\SocialComment;
use App\Models\SocialLinkVisit;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner's shortlist, 2026-09-24: the engagement half. A post's link is
 * tagged per delivery so visits and orders trace back to it; comments on
 * Facebook and Instagram posts land in an inbox with replies; the Share
 * buttons on the website and order app report what customers pass on.
 */
class SocialEngagementTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '111', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
    }

    private function item(): Item
    {
        $category = Category::create(['name' => 'Food', 'slug' => 'food-eng', 'is_active' => true]);

        return Item::create(['category_id' => $category->id, 'name' => 'Masroshi', 'base_price' => 12, 'is_active' => true, 'is_available' => true]);
    }

    private function published(?Item $item = null): SocialPostDelivery
    {
        $post = SocialPost::create([
            'status' => SocialPost::STATUS_PUBLISHED, 'source' => 'manual',
            'snapshot' => ['caption' => 'Try it: ' . ($item ? url('/menu/' . $item->id) : url('/menu')), 'link_url' => $item ? url('/menu/' . $item->id) : url('/menu'), 'item_id' => $item?->id],
            'published_at' => now()->subDay(),
        ]);

        return SocialPostDelivery::create([
            'social_post_id' => $post->id, 'social_channel_id' => $this->facebook->id,
            'status' => SocialPostDelivery::STATUS_PUBLISHED, 'provider_post_id' => '111_222', 'published_at' => now()->subDay(),
        ]);
    }

    // ── Tracked links ────────────────────────────────────────────────────────

    public function test_the_link_in_the_caption_is_tagged_with_the_delivery(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $item = $this->item();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Fresh today. Order: ' . url('/menu/' . $item->id),
            'item_id' => $item->id,
            'channel_ids' => [$this->facebook->id],
            'action' => 'now',
        ])->assertCreated();

        $delivery = SocialPostDelivery::firstOrFail();
        Http::assertSent(fn ($r) => str_contains($r->url(), '/111/photos') || str_contains($r->url(), '/111/feed')
            ? str_contains((string) ($r['message'] ?? ''), url('/menu/' . $item->id) . '?s=' . $delivery->id)
            : false);
        $this->assertStringNotContainsString('?s=', SocialPost::firstOrFail()->snapshot['caption'], 'the snapshot keeps the clean link');
    }

    public function test_a_visit_through_the_tagged_link_is_counted_once_an_hour_and_leaves_a_cookie(): void
    {
        $item = $this->item();
        $delivery = $this->published($item);

        $res = $this->get('/menu/' . $item->id . '?s=' . $delivery->id)->assertOk();
        $res->assertCookie(RecordSocialVisit::COOKIE, (string) $delivery->id);
        $this->get('/menu/' . $item->id . '?s=' . $delivery->id)->assertOk();
        $this->assertSame(1, SocialLinkVisit::count(), 'the same visitor within the hour counts once');

        $this->get('/menu/' . $item->id . '?s=999999')->assertOk();
        $this->get('/menu/' . $item->id . '?s=abc')->assertOk();
        $this->assertSame(1, SocialLinkVisit::count());
        $this->assertSame('menu/' . $item->id, SocialLinkVisit::firstOrFail()->path);
    }

    public function test_an_order_placed_with_the_cookie_is_attributed_and_the_counts_show_on_the_post(): void
    {
        $item = $this->item();
        $delivery = $this->published($item);
        SocialLinkVisit::create(['social_post_delivery_id' => $delivery->id, 'path' => 'menu/1', 'visitor_hash' => 'h', 'created_at' => now()]);

        // The customer's browser carries the cookie into checkout.
        $this->app->instance('request', Request::create('/api/orders', 'POST', [], [RecordSocialVisit::COOKIE => (string) $delivery->id]));
        $order = app(OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ], $this->makeStaff('staff'));
        $this->assertSame($delivery->id, $order->social_delivery_id);

        // A cookie pointing at a deleted delivery is ignored.
        $this->app->instance('request', Request::create('/api/orders', 'POST', [], [RecordSocialVisit::COOKIE => '424242']));
        $other = app(OrderCreationService::class)->createFromPayload(['type' => 'takeaway', 'items' => [['item_id' => $item->id, 'quantity' => 1]]], $this->makeStaff('staff'));
        $this->assertNull($other->social_delivery_id);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->getJson('/api/admin/social/posts')->assertOk();
        $this->assertSame(1, $res->json('posts.0.deliveries.0.visits'));
        $this->assertSame(1, $res->json('posts.0.deliveries.0.orders'));
    }

    // ── Comment inbox ────────────────────────────────────────────────────────

    public function test_comments_are_pulled_flagged_and_alerted_once_and_can_be_replied_to(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::bust();
        $sent = [];
        $sms = $this->createMock(SmsService::class);
        $sms->expects($this->once())->method('send')->willReturnCallback(function ($msg) use (&$sent) {
            $sent[] = $msg->message;

            return new SmsLog(['message' => $msg->message, 'to' => $msg->to, 'type' => 'system', 'status' => 'sent']);
        });
        $this->app->instance(SmsService::class, $sms);
        Http::fake([
            'graph.facebook.com/*/111_222/comments*' => Http::response(['data' => [
                ['id' => 'c1', 'from' => ['name' => 'Aisha'], 'message' => 'How much for a box of 10? 7771234', 'created_time' => '2026-09-24T08:00:00+0000'],
                ['id' => 'c2', 'from' => ['name' => 'Ibrahim'], 'message' => 'Looks great!', 'created_time' => '2026-09-24T07:00:00+0000'],
            ]], 200),
            'graph.facebook.com/*/c1/comments' => Http::response(['id' => 'c1_reply'], 200),
        ]);
        $this->published($this->item());

        $this->artisan('social:sync-comments')->expectsOutputToContain('2 new comments.')->assertSuccessful();
        $this->artisan('social:sync-comments')->expectsOutputToContain('0 new comments.')->assertSuccessful();

        $this->assertSame(2, SocialComment::count());
        $flagged = SocialComment::where('provider_comment_id', 'c1')->firstOrFail();
        $this->assertTrue($flagged->flagged, 'a price question with a phone number');
        $this->assertFalse(SocialComment::where('provider_comment_id', 'c2')->firstOrFail()->flagged);
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('1 new comment on your posts look', $sent[0]);

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $list = $this->getJson('/api/admin/social/comments?unread=1')->assertOk();
        $this->assertSame(2, $list->json('unread'));
        $this->assertSame('Aisha', $list->json('comments.0.author'));
        $this->assertSame('facebook', $list->json('comments.0.platform'));
        $this->assertTrue($list->json('comments.0.can_reply'));

        $reply = $this->postJson("/api/admin/social/comments/{$flagged->id}/reply", ['message' => 'MVR 120 for 10 — call us!'])->assertOk();
        $this->assertSame('MVR 120 for 10 — call us!', $reply->json('comment.reply_text'));
        $this->assertNotNull($reply->json('comment.replied_at'));
        $this->assertNotNull($reply->json('comment.read_at'), 'replying reads it');
        Http::assertSent(fn ($r) => str_contains($r->url(), '/c1/comments') && $r['message'] === 'MVR 120 for 10 — call us!');
        $this->assertSame('c1_reply', $flagged->fresh()->reply_provider_id);

        $this->postJson('/api/admin/social/comments/read-all')->assertOk()->assertJsonPath('unread', 0);
    }

    public function test_reply_needs_the_publish_permission_and_sync_can_be_asked_for(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['data' => []], 200)]);
        $delivery = $this->published();
        $comment = SocialComment::create(['social_post_delivery_id' => $delivery->id, 'provider_comment_id' => 'x', 'text' => 'hi']);

        $staff = $this->makeStaff('cashier');
        $staff->permissions()->attach(\App\Models\Permission::where('slug', 'social.view')->firstOrFail()->id, ['granted' => true]);
        Sanctum::actingAs($staff, ['staff']);
        $this->postJson("/api/admin/social/comments/{$comment->id}/reply", ['message' => 'no'])->assertStatus(403);
        $this->postJson('/api/admin/social/comments/sync')->assertOk()->assertJsonPath('new', 0);
        $this->postJson("/api/admin/social/comments/{$comment->id}/read")->assertOk();
        $this->assertNotNull($comment->fresh()->read_at);
    }

    // ── Share loop ───────────────────────────────────────────────────────────

    public function test_share_beacons_are_stored_and_the_hub_lists_the_most_shared(): void
    {
        $item = $this->item();
        $other = Item::create(['category_id' => $item->category_id, 'name' => 'Bajiya', 'base_price' => 3, 'is_active' => true, 'is_available' => true]);

        $this->postJson('/api/share-events', ['item_id' => $item->id, 'channel' => 'whatsapp'])->assertCreated();
        $this->postJson('/api/share-events', ['item_id' => $item->id, 'channel' => 'native', 'surface' => 'order'])->assertCreated();
        $this->postJson('/api/share-events', ['item_id' => $other->id, 'channel' => 'copy'])->assertCreated();
        $this->postJson('/api/share-events', ['category_id' => $item->category_id, 'channel' => 'telegram'])->assertCreated();
        $this->postJson('/api/share-events', ['item_id' => 999999, 'channel' => 'copy'])->assertNoContent();
        $this->postJson('/api/share-events', ['item_id' => $item->id, 'channel' => 'carrier-pigeon'])->assertStatus(422);
        $this->assertSame(4, ItemShareEvent::count());

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $top = $this->getJson('/api/admin/social/shares/top?days=30')->assertOk();
        $this->assertSame(4, $top->json('total'));
        $this->assertSame('Masroshi', $top->json('items.0.name'));
        $this->assertSame(2, $top->json('items.0.shares'));
        $this->assertFalse($top->json('items.0.is_featured'));
        $this->assertSame('Food', $top->json('categories.0.name'));
    }
}
