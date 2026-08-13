<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ContentRevision;
use App\Models\ContentSchedule;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentBacklogTest extends TestCase
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
            'name' => 'Backlog Owner',
            'email' => 'content-backlog@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_update_creates_revision_and_restore_works(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'business_phone', 'scope' => 'website', 'value' => '111'],
            ],
        ])->assertOk();

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'business_phone', 'scope' => 'website', 'value' => '222'],
            ],
        ])->assertOk();

        $this->assertSame('222', SiteSetting::getScoped('business_phone', 'website', 'en'));
        $this->assertDatabaseHas('content_revisions', [
            'key' => 'business_phone',
            'scope' => 'website',
            'locale' => 'en',
            'value' => '111',
        ]);

        $rev = ContentRevision::query()->where('key', 'business_phone')->where('scope', 'website')->latest('id')->first();
        $this->assertNotNull($rev);

        $this->postJson("/api/admin/content/business_phone/revisions/{$rev->id}/restore")
            ->assertOk();

        $this->assertSame('111', SiteSetting::getScoped('business_phone', 'website', 'en'));
    }

    public function test_scheduled_publish_applies_via_command(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'locale' => 'en',
            'changes' => [
                ['key' => 'site_tagline', 'scope' => 'website', 'value' => 'Scheduled tagline'],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('content_schedules', [
            'key' => 'site_tagline',
            'status' => 'pending',
        ]);

        ContentSchedule::query()->where('key', 'site_tagline')->update([
            'publish_at' => now()->subMinute(),
        ]);

        Artisan::call('content:publish-scheduled');

        $this->assertSame('Scheduled tagline', SiteSetting::getScoped('site_tagline', 'website', 'en'));
        $this->assertSame('published', ContentSchedule::query()->where('key', 'site_tagline')->value('status'));
    }

    public function test_locale_isolation_and_public_api(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'site_name', 'scope' => 'order_app', 'value' => 'Bake EN'],
            ],
        ])->assertOk();

        $this->putJson('/api/admin/content', [
            'locale' => 'dv',
            'changes' => [
                ['key' => 'site_name', 'scope' => 'order_app', 'locale' => 'dv', 'value' => 'Bake DV'],
            ],
        ])->assertOk();

        $en = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $dv = $this->getJson('/api/content?app=order_app&locale=dv')->assertOk()->json('content');
        $this->assertSame('Bake EN', $en['site_name'] ?? null);
        $this->assertSame('Bake DV', $dv['site_name'] ?? null);
    }

    public function test_export_import_round_trip(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'business_email', 'scope' => 'website', 'value' => 'a@test.mv'],
            ],
        ])->assertOk();

        $bundle = $this->getJson('/api/admin/content/export?locale=en')->assertOk()->json();
        $this->assertNotEmpty($bundle['entries']);

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'business_email', 'scope' => 'website', 'value' => 'changed@test.mv'],
            ],
        ])->assertOk();

        $this->postJson('/api/admin/content/import', $bundle)->assertOk();
        $this->assertSame('a@test.mv', SiteSetting::getScoped('business_email', 'website', 'en'));
    }
}
