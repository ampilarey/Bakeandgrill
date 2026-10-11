<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-11: "Label permission is given but can not use."
 *
 * A cashier was given Print labels, typed their phone and PIN at the admin
 * sign-in, and read "You do not have permission to access the admin panel."
 * The admin door is a separate check, admin.access, which the stock staff and
 * kitchen roles do not hold. Labels exist only in the admin panel, so either
 * Labels permission now stands in for admin.access (PermissionCatalog::
 * SATISFIED_BY). The pages inside keep their own permissions.
 */
class LabelsPermissionAdminSignInTest extends TestCase
{
    use RefreshDatabase;

    private const REFUSAL = 'You do not have permission to access the admin panel.';

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    /** Sanctum runs the session middleware only for a request from the SPA. */
    private function fromAdmin(): static
    {
        return $this->withCredentials()->withHeader('Referer', 'http://localhost:8000/admin/');
    }

    private function staffMember(string $roleSlug, string $phone): User
    {
        return User::create([
            'name' => ucfirst($roleSlug) . ' ' . $phone,
            'email' => $roleSlug . '-' . $phone . '@example.com',
            'phone' => $phone,
            'password' => Hash::make('password123'),
            'pin_hash' => Hash::make('2468'),
            'role_id' => Role::where('slug', $roleSlug)->firstOrFail()->id,
            'is_active' => true,
        ]);
    }

    public function test_the_catalog_lets_either_labels_permission_stand_in_for_the_admin_door(): void
    {
        $this->assertSame(
            ['admin.access', 'labels.print', 'labels.manage'],
            PermissionCatalog::expandCheckSlugs('admin.access'),
        );
        // Still off for the stock roles that do not print labels.
        $this->assertNotContains('admin.access', PermissionCatalog::staffSlugs());
        $this->assertNotContains('admin.access', PermissionCatalog::kitchenStaffSlugs());
    }

    public function test_a_cashier_given_print_labels_signs_in_to_the_admin_panel_with_phone_and_pin(): void
    {
        $cashier = $this->staffMember('staff', '+9607779120');

        // The report: the refusal, word for word, before the grant.
        $refused = $this->fromAdmin()->postJson('/api/auth/staff/pin-login', [
            'username' => '7779120',
            'pin' => '2468',
            'intent' => 'admin',
        ]);
        $refused->assertStatus(422)->assertJsonValidationErrors(['pin']);
        $this->assertSame(self::REFUSAL, (string) $refused->json('errors.pin.0'));

        $cashier->grantPermission('labels.print');
        $this->app['auth']->forgetGuards();

        $this->fromAdmin()->postJson('/api/auth/staff/pin-login', [
            'username' => '7779120',
            'pin' => '2468',
            'intent' => 'admin',
        ])
            ->assertOk()
            ->assertJsonMissingPath('token')
            ->assertJsonPath('user.role', 'staff');

        $this->assertAuthenticatedAs($cashier, 'web');

        // What the admin app is told they may do: Labels, and the door.
        $slugs = $this->app->make(\App\Services\PermissionService::class)->grantedSlugs($cashier->fresh());
        $this->assertContains('labels.print', $slugs);
        $this->assertContains('admin.access', $slugs);
        $this->assertNotContains('labels.manage', $slugs, 'print does not imply manage');
    }

    public function test_a_cook_given_manage_label_settings_signs_in_too(): void
    {
        $cook = $this->staffMember('kitchen_staff', '+9607779121');
        $cook->grantPermission('labels.manage');

        $this->fromAdmin()->postJson('/api/auth/staff/pin-login', [
            'username' => '7779121',
            'pin' => '2468',
            'intent' => 'admin',
        ])->assertOk()->assertJsonPath('user.role', 'kitchen_staff');
    }

    public function test_the_password_sign_in_takes_the_same_door(): void
    {
        $cashier = $this->staffMember('staff', '+9607779122');

        $refused = $this->fromAdmin()->postJson('/api/auth/staff/login', [
            'phone' => '7779122',
            'password' => 'password123',
        ]);
        $refused->assertStatus(422);
        $this->assertSame(self::REFUSAL, (string) $refused->json('errors.phone.0'));

        $cashier->grantPermission('labels.print');
        $this->app['auth']->forgetGuards();

        $this->fromAdmin()->postJson('/api/auth/staff/login', [
            'phone' => '7779122',
            'password' => 'password123',
        ])->assertOk();
    }

    public function test_the_door_opens_but_not_the_rooms(): void
    {
        // Inside, every page still asks for its own permission: the Labels
        // routes answer, the ones for settings and staff do not.
        $cashier = $this->staffMember('staff', '+9607779123');
        $cashier->grantPermission('labels.print');

        Sanctum::actingAs($cashier->fresh(), ['staff']);
        $this->getJson('/api/labels/products')->assertOk();
        $this->getJson('/api/permissions')->assertForbidden();
        $this->getJson('/api/labels/brands')->assertOk();
        $this->postJson('/api/labels/brands', ['name' => 'Amma'])->assertForbidden();
    }

    public function test_the_person_s_card_shows_access_admin_panel_as_on(): void
    {
        // Owner, 2026-10-08: who may do something must see it. The grant that
        // opened the door shows on the person's card as "Access admin panel".
        $cashier = $this->staffMember('staff', '+9607779124');
        $cashier->grantPermission('labels.print');

        Sanctum::actingAs($this->staffMember('owner', '+9607779125'), ['staff']);
        $rows = collect($this->getJson("/api/users/{$cashier->id}/permissions")->assertOk()->json('permissions'))
            ->keyBy('slug');

        $this->assertTrue($rows['labels.print']['granted']);
        $this->assertSame('override', $rows['labels.print']['source']);
        $this->assertTrue($rows['admin.access']['granted']);
        $this->assertFalse($rows['admin.access']['role_default']);
    }

    public function test_a_cashier_without_a_labels_permission_is_still_kept_out(): void
    {
        $this->staffMember('staff', '+9607779126');

        $refused = $this->fromAdmin()->postJson('/api/auth/staff/pin-login', [
            'username' => '7779126',
            'pin' => '2468',
            'intent' => 'admin',
        ]);
        $refused->assertStatus(422);
        $this->assertSame(self::REFUSAL, (string) $refused->json('errors.pin.0'));
        $this->assertGuest('web');
    }
}
