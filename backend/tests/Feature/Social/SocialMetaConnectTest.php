<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SocialChannel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "Connect with Facebook" (2026-09-24): the owner logs in, picks the Page,
 * and the long-lived Page token plus the linked Instagram account become
 * channels. State is unguessable, short-lived, bound to the user; tokens
 * never appear in any response or redirect.
 */
class SocialMetaConnectTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.meta_app_id' => 'APP-1', 'social.meta_app_secret' => 'APP-SECRET']);
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'USER-TOKEN-LONG', 'expires_in' => 5184000], 200),
            'graph.facebook.com/*/me/accounts*' => Http::response(['data' => [
                ['id' => '111', 'name' => 'Bake & Grill', 'access_token' => 'PAGE-TOKEN-111', 'instagram_business_account' => ['id' => '999', 'username' => 'bakeandgrill.mv']],
                ['id' => '222', 'name' => 'Side Project', 'access_token' => 'PAGE-TOKEN-222'],
            ]], 200),
            'graph.facebook.com/*/debug_token*' => Http::response(['data' => ['is_valid' => true, 'expires_at' => 0]], 200),
            'graph.facebook.com/*/111*' => Http::response(['id' => '111', 'name' => 'Bake & Grill'], 200),
            'graph.facebook.com/*/999*' => Http::response(['id' => '999', 'username' => 'bakeandgrill.mv'], 200),
        ]);
    }

    private function stateFromRedirect(string $url): string
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $q);

        return (string) ($q['state'] ?? '');
    }

    public function test_the_whole_flow_creates_facebook_and_instagram_channels_without_leaking_tokens(): void
    {
        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);

        $this->assertTrue($this->getJson('/api/admin/social/channels')->json('meta_connect.available'));

        $url = $this->getJson('/api/admin/social/meta/connect')->assertOk()->json('redirect_url');
        $this->assertStringStartsWith('https://www.facebook.com/', $url);
        $this->assertStringContainsString('client_id=APP-1', $url);
        $this->assertStringContainsString(rawurlencode(url('/social/meta/callback')), $url);
        $state = $this->stateFromRedirect($url);
        $this->assertSame(40, strlen($state));

        // Facebook sends the browser back: the public route stores the pages and bounces to admin.
        $back = $this->get('/social/meta/callback?state='.$state.'&code=CODE-1');
        $back->assertRedirect(url('/admin/social').'?meta_connect='.$state);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'oauth/access_token') && str_contains($r->url(), 'code=CODE-1'));
        Http::assertSent(fn ($r) => str_contains($r->url(), 'fb_exchange_token=USER-TOKEN-LONG'));

        $pending = $this->getJson('/api/admin/social/meta/pending?state='.$state)->assertOk();
        $this->assertCount(2, $pending->json('pages'));
        $this->assertSame('bakeandgrill.mv', $pending->json('pages.0.instagram.username'));
        $this->assertNull($pending->json('pages.1.instagram'));
        $this->assertStringNotContainsString('PAGE-TOKEN', $pending->getContent());
        $this->assertStringNotContainsString('USER-TOKEN', $pending->getContent());

        $res = $this->postJson('/api/admin/social/meta/finish', [
            'state' => $state, 'page_id' => '111', 'facebook' => true, 'instagram' => true, 'is_test_channel' => true,
        ])->assertOk();
        $this->assertCount(2, $res->json('channel_ids'));

        $fb = SocialChannel::where('platform', 'facebook')->firstOrFail();
        $this->assertSame('111', $fb->remote_account_id);
        $this->assertSame('Bake & Grill', $fb->name);
        $this->assertSame('PAGE-TOKEN-111', $fb->credential('access_token'));
        $this->assertTrue($fb->is_enabled);
        $this->assertTrue($fb->is_test_channel);
        $this->assertSame('ok', $fb->health['status'], 'checked straight away');

        $ig = SocialChannel::where('platform', 'instagram')->firstOrFail();
        $this->assertSame('999', $ig->credential('ig_user_id'));
        $this->assertSame('PAGE-TOKEN-111', $ig->credential('access_token'));
        $this->assertSame('@bakeandgrill.mv', $ig->name);

        // The state is spent.
        $this->getJson('/api/admin/social/meta/pending?state='.$state)->assertStatus(422);
    }

    public function test_reconnecting_a_known_page_replaces_the_token_in_place(): void
    {
        $existing = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'My Page (old name)', 'remote_account_id' => '111',
            'credentials' => ['page_id' => '111', 'access_token' => 'OLD'], 'is_enabled' => false,
            'health' => ['status' => 'error', 'message' => 'expired', 'checked_at' => now()->toIso8601String()],
        ]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $state = $this->stateFromRedirect($this->getJson('/api/admin/social/meta/connect')->json('redirect_url'));
        $this->get('/social/meta/callback?state='.$state.'&code=C');

        $this->assertTrue($this->getJson('/api/admin/social/meta/pending?state='.$state)->json('pages.0.already.facebook'));
        $this->postJson('/api/admin/social/meta/finish', ['state' => $state, 'page_id' => '111', 'facebook' => true])->assertOk();

        $this->assertSame(1, SocialChannel::where('platform', 'facebook')->count());
        $fresh = $existing->fresh();
        $this->assertSame('PAGE-TOKEN-111', $fresh->credential('access_token'));
        $this->assertSame('My Page (old name)', $fresh->name, 'the owner\'s name for it stays');
        $this->assertTrue($fresh->is_enabled);
        $this->assertSame('ok', $fresh->health['status']);
    }

    public function test_state_is_bound_to_the_user_and_the_callback_handles_refusals(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $state = $this->stateFromRedirect($this->getJson('/api/admin/social/meta/connect')->json('redirect_url'));

        // The user said no on Facebook's side.
        $this->get('/social/meta/callback?error=access_denied&error_description=Permissions+error&state='.$state)
            ->assertRedirect(url('/admin/social').'?meta_error='.rawurlencode('Permissions error'));

        // An unknown state cannot be completed.
        $this->get('/social/meta/callback?state=nope&code=C')
            ->assertRedirect(url('/admin/social').'?meta_error='.rawurlencode('This connect link has expired. Start again from the Channels tab.'));

        // Another owner cannot finish this user's session.
        $this->get('/social/meta/callback?state='.$state.'&code=C');
        Sanctum::actingAs($this->makeOwner(['email' => 'other@test.com']), ['staff']);
        $this->getJson('/api/admin/social/meta/pending?state='.$state)->assertStatus(422);
        $this->postJson('/api/admin/social/meta/finish', ['state' => $state, 'page_id' => '111'])->assertStatus(422);
        $this->assertSame(0, SocialChannel::count());
    }

    public function test_without_an_app_the_button_is_off_and_start_says_why(): void
    {
        config(['social.meta_app_id' => null, 'social.meta_app_secret' => null]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->assertFalse($this->getJson('/api/admin/social/channels')->json('meta_connect.available'));
        $res = $this->getJson('/api/admin/social/meta/connect')->assertStatus(422);
        $this->assertStringContainsString('SOCIAL_META_APP_ID', $res->json('message'));
    }

    public function test_managers_cannot_start_a_connect(): void
    {
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->getJson('/api/admin/social/meta/connect')->assertStatus(403);
    }
}
