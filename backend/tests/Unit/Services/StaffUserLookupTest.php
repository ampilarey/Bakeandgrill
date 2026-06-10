<?php

declare(strict_types=1);

namespace Tests\Unit\Services;

use App\Models\Role;
use App\Models\User;
use App\Services\StaffUserLookup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class StaffUserLookupTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function find_by_username_locates_inactive_user(): void
    {
        $role = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $user = User::create([
            'name' => 'Inactive',
            'email' => 'inactive@test.local',
            'phone' => '7779999',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'is_active' => false,
        ]);

        $found = StaffUserLookup::findByUsername('7779999');
        $this->assertNotNull($found);
        $this->assertSame($user->id, $found->id);

        $this->assertNull(StaffUserLookup::findActiveByUsername('7779999'));
    }

    #[Test]
    public function canonical_identity_key_collapses_phone_formats(): void
    {
        $this->assertSame(
            StaffUserLookup::canonicalIdentityKey('+960 777-1234'),
            StaffUserLookup::canonicalIdentityKey('7771234'),
        );
        $this->assertSame('email:owner@test.local', StaffUserLookup::canonicalIdentityKey('Owner@Test.Local'));
    }
}
