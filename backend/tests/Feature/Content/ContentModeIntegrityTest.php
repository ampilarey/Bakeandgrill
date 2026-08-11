<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ContentDraft;
use App\Models\ContentRevision;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentModeIntegrityTest extends TestCase
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
            'name' => 'Mode Owner',
            'email' => 'mode-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_share_copies_selected_source_to_shared_and_snapshots_history(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('business_phone', 'C shared', 'shared', 'en');
        SiteSetting::set('business_phone', 'A website', 'website', 'en');
        SiteSetting::set('business_phone', 'B order', 'order_app', 'en');

        $this->postJson('/api/admin/content/business_phone/share', [
            'locale' => 'en',
            'source' => 'website',
        ])->assertOk();

        $this->assertSame('A website', SiteSetting::getScoped('business_phone', 'shared', 'en'));
        $this->assertNull(SiteSetting::getScoped('business_phone', 'website', 'en'));
        $this->assertNull(SiteSetting::getScoped('business_phone', 'order_app', 'en'));

        $this->assertTrue(ContentRevision::query()
            ->where('key', 'business_phone')
            ->where('scope', 'shared')
            ->where('value', 'C shared')
            ->where('is_draft', false)
            ->exists());
        $this->assertTrue(ContentRevision::query()
            ->where('key', 'business_phone')
            ->where('scope', 'order_app')
            ->where('value', 'B order')
            ->where('is_draft', false)
            ->exists());
    }

    public function test_split_in_dv_copies_resolved_locale_fallback_content(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('business_phone', '+960 EN SHARED', 'shared', 'en');

        $this->postJson('/api/admin/content/business_phone/split', [
            'locale' => 'dv',
        ])->assertOk();

        $this->assertSame('+960 EN SHARED', SiteSetting::getScoped('business_phone', 'website', 'dv'));
        $this->assertSame('+960 EN SHARED', SiteSetting::getScoped('business_phone', 'order_app', 'dv'));
    }

    public function test_mode_change_rejects_current_user_drafts_without_action(): void
    {
        $user = $this->actingAsOwner();
        ContentDraft::query()->create([
            'user_id' => $user->id,
            'key' => 'business_phone',
            'scope' => 'website',
            'locale' => 'en',
            'value' => '+960 draft',
            'version' => 1,
        ]);

        $this->postJson('/api/admin/content/business_phone/share', [
            'locale' => 'en',
            'source' => 'website',
        ])->assertStatus(409)
            ->assertJsonPath('message', 'Unpublished drafts exist for this block. Publish or discard them before changing Same/Different mode.');

        $this->postJson('/api/admin/content/business_phone/share', [
            'locale' => 'en',
            'source' => 'website',
            'draft_action' => 'discard',
        ])->assertOk();

        $this->assertDatabaseMissing('content_drafts', [
            'user_id' => $user->id,
            'key' => 'business_phone',
            'locale' => 'en',
        ]);
    }
}
