<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentDraftStore;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageLayoutDraft;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentPreviewTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Preview Owner',
            'email' => 'preview-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_preview_token_requires_staff_auth(): void
    {
        $this->postJson('/api/admin/content/preview-token', [
            'app' => 'website',
            'overrides' => ['business_phone' => '+960 DRAFT'],
        ])->assertUnauthorized();
    }

    public function test_draft_content_requires_valid_token(): void
    {
        $this->getJson('/api/content/preview?token=bogus')->assertForbidden();
    }

    public function test_preview_token_overlays_draft_not_published(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('business_phone', '+960 LIVE', 'shared');

        $res = $this->postJson('/api/admin/content/preview-token', [
            'app' => 'order_app',
            'locale' => 'en',
            'overrides' => ['business_phone' => '+960 DRAFT'],
        ])->assertOk()->json();

        $this->assertNotEmpty($res['token']);
        $this->assertNotEmpty($res['order_app_url']);

        $preview = $this->getJson('/api/content/preview?token=' . $res['token'])
            ->assertOk()
            ->json('content');

        $this->assertSame('+960 DRAFT', $preview['business_phone']);
        $this->assertSame('+960 LIVE', SiteSetting::getScoped('business_phone', 'shared'));
    }

    public function test_preview_token_include_layout_merges_page_layout_draft_blocks(): void
    {
        $user = $this->actingAsOwner();

        PageLayoutDraft::query()->create([
            'user_id' => $user->id,
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
            'payload' => [
                'blocks' => [[
                    'id' => -1,
                    'app' => 'website',
                    'page' => 'home',
                    'block_type' => 'rich_text',
                    'position' => 0,
                    'is_enabled' => true,
                    'content_mode' => 'own',
                    'settings' => ['heading' => 'Draft Layout Marker Heading', 'body' => '<p>draft body</p>'],
                ]],
            ],
        ]);

        $res = $this->postJson('/api/admin/content/preview-token', [
            'app' => 'website',
            'locale' => 'en',
            'overrides' => ['business_phone' => '+960 DRAFT'],
            'include_layout' => true,
        ])->assertOk()->json();

        $this->assertSame('rich_text', $res['token'] !== '' ? $this->mergedLayoutBlockType($res['token']) : null);

        $html = $this->get($res['website_url'])->assertOk()->getContent();
        $this->assertStringContainsString('Draft Layout Marker Heading', $html);
    }

    public function test_preview_token_without_include_layout_does_not_merge_page_blocks(): void
    {
        $user = $this->actingAsOwner();

        PageLayoutDraft::query()->create([
            'user_id' => $user->id,
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
            'payload' => [
                'blocks' => [[
                    'id' => -1,
                    'app' => 'website',
                    'page' => 'home',
                    'block_type' => 'rich_text',
                    'position' => 0,
                    'is_enabled' => true,
                    'content_mode' => 'own',
                    'settings' => ['heading' => 'Should Not Appear Without Flag', 'body' => ''],
                ]],
            ],
        ]);

        $res = $this->postJson('/api/admin/content/preview-token', [
            'app' => 'website',
            'locale' => 'en',
            'overrides' => ['business_phone' => '+960 DRAFT'],
        ])->assertOk()->json();

        $draft = ContentDraftStore::get($res['token']);
        $this->assertArrayNotHasKey('page_blocks', $draft['overrides'] ?? []);

        $html = $this->get($res['website_url'])->assertOk()->getContent();
        $this->assertStringNotContainsString('Should Not Appear Without Flag', $html);
    }

    private function mergedLayoutBlockType(string $token): ?string
    {
        $draft = ContentDraftStore::get($token);
        $blocks = $draft['overrides']['page_blocks']['website']['home'] ?? [];

        return $blocks[0]['block_type'] ?? null;
    }

    public function test_signed_website_preview_renders_draft(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('business_phone', '+960 LIVE', 'shared');

        $token = ContentDraftStore::put('website', 'en', [
            'business_phone' => '+960 PREVIEW PHONE',
            'hero_slides' => json_encode([[
                'title' => 'Draft Hero Title',
                'eyebrow' => 'Draft',
                'image' => '',
                'subtitle' => '',
                'cta_text' => 'Go',
                'cta_url' => '/order/',
                'cta2_text' => 'Menu',
                'cta2_url' => '/menu',
            ]]),
        ]);

        $url = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            'content.preview.website',
            now()->addMinutes(10),
            ['token' => $token],
        );

        $html = $this->get($url)->assertOk()->getContent();
        $this->assertStringContainsString('Draft Hero Title', $html);
        $this->assertStringContainsString('noindex', strtolower(implode(' ', $this->get($url)->headers->all('x-robots-tag'))));
    }

    public function test_website_preview_allows_same_origin_iframe(): void
    {
        $this->actingAsOwner();

        $token = ContentDraftStore::put('website', 'en', [
            'business_phone' => '+960 PREVIEW',
        ]);

        $url = \Illuminate\Support\Facades\URL::temporarySignedRoute(
            'content.preview.website',
            now()->addMinutes(10),
            ['token' => $token],
        );

        $response = $this->get($url)->assertOk();
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->assertStringContainsString("frame-ancestors 'self'", (string) $response->headers->get('Content-Security-Policy'));
    }

    public function test_order_preview_allows_same_origin_iframe(): void
    {
        $token = ContentDraftStore::put('order_app', 'en', [
            'business_phone' => '+960 ORDER PREVIEW',
        ]);

        // Hit the SPA catch-all (not the /order → /order/ redirect).
        $response = $this->get('/order/menu?previewToken=' . urlencode($token));
        // Order SPA shell may 200 (deployed) or 503 (missing dist) in CI — framing headers still apply.
        $this->assertContains($response->status(), [200, 503]);
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->assertStringContainsString("frame-ancestors 'self'", (string) $response->headers->get('Content-Security-Policy'));
    }

    public function test_public_home_still_denies_framing(): void
    {
        $response = $this->get('/')->assertOk();
        $response->assertHeader('X-Frame-Options', 'DENY');
        $this->assertStringContainsString("frame-ancestors 'none'", (string) $response->headers->get('Content-Security-Policy'));
    }

    public function test_signage_tv_path_allows_same_origin_iframe(): void
    {
        // SPA shell may 200 (deployed) or 503 (missing dist) in CI — framing headers still apply.
        $response = $this->get('/order/tv/default');
        $this->assertContains($response->status(), [200, 503]);
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->assertStringContainsString("frame-ancestors 'self'", (string) $response->headers->get('Content-Security-Policy'));
    }

    public function test_signage_tv_root_path_allows_same_origin_iframe(): void
    {
        $response = $this->get('/order/tv');
        $this->assertContains($response->status(), [200, 503]);
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $this->assertStringContainsString("frame-ancestors 'self'", (string) $response->headers->get('Content-Security-Policy'));
    }

    public function test_order_path_without_preview_token_still_denies_framing(): void
    {
        $response = $this->get('/order/menu');
        $this->assertContains($response->status(), [200, 503]);
        $response->assertHeader('X-Frame-Options', 'DENY');
        $this->assertStringContainsString("frame-ancestors 'none'", (string) $response->headers->get('Content-Security-Policy'));
    }
}
