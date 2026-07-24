<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Database\Seeders\SmsTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmsControlCenterControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        (new SmsTemplateSeeder)->run();

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner-sms-cc@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        $this->manager = User::create([
            'name' => 'Manager',
            'email' => 'mgr-sms-cc@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'manager')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_get_returns_all_types_and_state(): void
    {
        Sanctum::actingAs($this->owner, ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $res->assertJsonStructure([
            'global_kill_switch',
            'demo_mode',
            'types' => [
                ['key', 'label', 'category', 'enabled', 'always_on', 'suppressible', 'send_permission', 'last_30_days'],
            ],
        ]);

        $keys = collect($res->json('types'))->pluck('key');
        $this->assertTrue($keys->contains('auth_customer_otp'));
        $this->assertTrue($keys->contains('giftcard_delivery'));
        $this->assertFalse($res->json('global_kill_switch'));
    }

    public function test_patch_type_toggles_setting_and_audits(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->patchJson('/api/admin/sms/types/giftcard_delivery', ['enabled' => false])
            ->assertOk()
            ->assertJson(['key' => 'giftcard_delivery', 'enabled' => false]);

        $this->assertSame('false', SiteSetting::get('sms_giftcard_enabled'));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'sms.type.enabled.updated',
            'user_id' => $this->manager->id,
        ]);
    }

    public function test_patch_always_on_returns_422(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);

        $this->patchJson('/api/admin/sms/types/auth_customer_otp', ['enabled' => false])
            ->assertStatus(422);
    }

    public function test_kill_switch_is_owner_gated_and_audited(): void
    {
        Sanctum::actingAs($this->manager, ['staff']);
        $this->patchJson('/api/admin/sms/global-kill-switch', ['enabled' => true])
            ->assertForbidden();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson('/api/admin/sms/global-kill-switch', ['enabled' => true])
            ->assertOk()
            ->assertJson(['global_kill_switch' => true]);

        $this->assertSame('true', SiteSetting::get('sms_global_kill_switch'));
        $this->assertTrue(
            AuditLog::where('action', 'sms.global_kill_switch.updated')
                ->where('user_id', $this->owner->id)
                ->exists(),
        );
    }
}
