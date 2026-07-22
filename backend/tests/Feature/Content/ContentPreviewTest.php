<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentDraftStore;
use App\Domains\Permissions\PermissionCatalogSync;
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

    private function actingAsOwner(): void
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
}
