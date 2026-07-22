<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentCopyResolvedTest extends TestCase
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
            'name' => 'Content Owner',
            'email' => 'content-copy-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_copy_from_seed_only_app_uses_resolved_shared_value(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('business_phone', '+960 SHARED SEED', 'shared');
        $this->assertNull(SiteSetting::getScoped('business_phone', 'website'));
        $this->assertNull(SiteSetting::getScoped('business_phone', 'order_app'));

        $this->postJson('/api/admin/content/business_phone/copy', [
            'from' => 'website',
            'to' => 'order_app',
            'locale' => 'en',
        ])->assertOk();

        $this->assertSame('+960 SHARED SEED', SiteSetting::getScoped('business_phone', 'order_app'));
        $this->assertNull(SiteSetting::getScoped('business_phone', 'website'));
    }

    public function test_copy_from_app_override_beats_shared(): void
    {
        $this->actingAsOwner();

        SiteSetting::set('business_phone', '+960 SHARED', 'shared');
        SiteSetting::set('business_phone', '+960 WEB ONLY', 'website');

        $this->postJson('/api/admin/content/business_phone/copy', [
            'from' => 'website',
            'to' => 'order_app',
        ])->assertOk();

        $this->assertSame('+960 WEB ONLY', SiteSetting::getScoped('business_phone', 'order_app'));
    }
}
