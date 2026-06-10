<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ActivateStaffUserCommandTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function staff_activate_re_enables_inactive_user_outside_production(): void
    {
        $this->assertFalse(app()->isProduction());

        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $user = User::create([
            'name' => 'Sleeping Staff',
            'email' => 'sleeping@test.local',
            'phone' => '7654321',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => false,
        ]);

        $this->artisan('staff:activate', ['login' => $user->email])
            ->assertSuccessful();

        $this->assertTrue($user->fresh()->is_active);
    }

    #[Test]
    public function staff_activate_refuses_in_production_without_flag(): void
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        User::create([
            'name' => 'Prod Staff',
            'email' => 'prod-staff@test.local',
            'phone' => '7654322',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => false,
        ]);

        $this->app->detectEnvironment(fn () => 'production');

        $this->artisan('staff:activate', ['login' => 'prod-staff@test.local'])
            ->assertFailed();
    }
}
