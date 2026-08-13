<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentShareSplitRemovedTest extends TestCase
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
            'name' => 'Owner',
            'email' => 'share-removed@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_share_split_and_copy_endpoints_are_gone(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/admin/content/business_phone/share', [
            'locale' => 'en',
            'source' => 'shared',
        ])->assertNotFound();

        $this->postJson('/api/admin/content/business_phone/split', [
            'locale' => 'en',
        ])->assertNotFound();

        $this->postJson('/api/admin/content/business_phone/copy', [
            'from' => 'website',
            'to' => 'order_app',
        ])->assertNotFound();
    }
}
