<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmsPermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    private function staffWith(array $slugs): User
    {
        $role = Role::where('slug', 'staff')->firstOrFail();
        $user = User::create([
            'name' => 'SMS Tester',
            'email' => 'sms-perm-' . uniqid() . '@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        foreach ($slugs as $slug) {
            $user->grantPermission($slug);
        }

        return $user;
    }

    public function test_logs_view_only_cannot_send_campaigns_or_edit_settings(): void
    {
        $user = $this->staffWith(['sms.logs.view']);
        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/admin/sms/logs')->assertOk();
        $this->getJson('/api/admin/sms/control-center')->assertOk();

        $this->postJson('/api/admin/sms/campaigns', [
            'name' => 'Blast',
            'message' => 'Hello',
            'audience' => 'all',
        ])->assertForbidden();

        $this->patchJson('/api/admin/sms/types/giftcard_delivery', ['enabled' => false])
            ->assertForbidden();

        $this->patchJson('/api/admin/sms/global-kill-switch', ['enabled' => true])
            ->assertForbidden();

        // Create a template to PATCH
        $tplId = \App\Models\SmsTemplate::create([
            'name' => 'T',
            'slug' => 'tmp-perm-test',
            'body' => 'hi',
            'type' => 'custom',
            'is_system' => false,
        ])->id;

        $this->patchJson('/api/admin/sms/templates/' . $tplId, ['body' => 'bye'])
            ->assertForbidden();
    }

    public function test_legacy_integrations_sms_retains_full_access(): void
    {
        $user = $this->staffWith(['integrations.sms']);
        Sanctum::actingAs($user, ['staff']);

        $this->getJson('/api/admin/sms/logs')->assertOk();
        $this->getJson('/api/admin/sms/campaigns')->assertOk();
        $this->getJson('/api/admin/sms/templates')->assertOk();
        $this->getJson('/api/admin/sms/contacts')->assertOk();
        $this->getJson('/api/admin/sms/scheduled')->assertOk();
        $this->patchJson('/api/admin/sms/types/giftcard_delivery', ['enabled' => false])
            ->assertOk();
    }
}
