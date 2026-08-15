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
                ['key' => 'home_specials_title', 'scope' => 'website', 'value' => '111'],
            ],
        ])->assertOk();

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'website', 'value' => '222'],
            ],
        ])->assertOk();

        $this->assertSame('222', SiteSetting::getScoped('home_specials_title', 'website', 'en'));
        $this->assertDatabaseHas('content_revisions', [
            'key' => 'home_specials_title',
            'scope' => 'website',
            'locale' => 'en',
            'value' => '111',
        ]);

        $rev = ContentRevision::query()->where('key', 'home_specials_title')->where('scope', 'website')->latest('id')->first();
        $this->assertNotNull($rev);

        $this->postJson("/api/admin/content/home_specials_title/revisions/{$rev->id}/restore")
            ->assertOk();

        $this->assertSame('111', SiteSetting::getScoped('home_specials_title', 'website', 'en'));
    }

    public function test_scheduled_publish_applies_via_command(): void
    {
        $this->actingAsOwner();

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'locale' => 'en',
            'changes' => [
                ['key' => 'footer_text', 'scope' => 'website', 'value' => 'Scheduled footer blurb'],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('content_schedules', [
            'key' => 'footer_text',
            'status' => 'pending',
        ]);

        ContentSchedule::query()->where('key', 'footer_text')->update([
            'publish_at' => now()->subMinute(),
        ]);

        Artisan::call('content:publish-scheduled');

        $this->assertSame('Scheduled footer blurb', SiteSetting::getScoped('footer_text', 'website', 'en'));
        $this->assertSame('published', ContentSchedule::query()->where('key', 'footer_text')->value('status'));
    }

    public function test_locale_isolation_and_public_api(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'order_app', 'value' => 'Bake EN'],
            ],
        ])->assertOk();

        $this->putJson('/api/admin/content', [
            'locale' => 'dv',
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'order_app', 'locale' => 'dv', 'value' => 'Bake DV'],
            ],
        ])->assertOk();

        $en = $this->getJson('/api/content?app=order_app&locale=en')->assertOk()->json('content');
        $dv = $this->getJson('/api/content?app=order_app&locale=dv')->assertOk()->json('content');
        $this->assertSame('Bake EN', $en['home_specials_title'] ?? null);
        $this->assertSame('Bake DV', $dv['home_specials_title'] ?? null);
    }

    public function test_export_import_round_trip(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'website', 'value' => 'a@test.mv'],
            ],
        ])->assertOk();

        $bundle = $this->getJson('/api/admin/content/export?locale=en')->assertOk()->json();
        $this->assertNotEmpty($bundle['entries']);

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'website', 'value' => 'changed@test.mv'],
            ],
        ])->assertOk();

        $this->postJson('/api/admin/content/import', $bundle)->assertOk();
        $this->assertSame('a@test.mv', SiteSetting::getScoped('home_specials_title', 'website', 'en'));
    }

    public function test_export_can_filter_to_one_app_scope(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'home_specials_title', 'scope' => 'website', 'value' => 'Website Name'],
                ['key' => 'home_specials_title', 'scope' => 'order_app', 'value' => 'Order Name'],
            ],
        ])->assertOk();

        $website = $this->getJson('/api/admin/content/export?locale=en&scope=website')->assertOk()->json();
        $this->assertNotEmpty($website['entries']);
        foreach ($website['entries'] as $entry) {
            $this->assertSame('website', $entry['scope']);
        }
        $this->assertTrue(collect($website['entries'])->contains(
            fn (array $e): bool => $e['key'] === 'home_specials_title' && $e['value'] === 'Website Name',
        ));

        $order = $this->getJson('/api/admin/content/export?locale=en&scope=order_app')->assertOk()->json();
        foreach ($order['entries'] as $entry) {
            $this->assertSame('order_app', $entry['scope']);
        }
        $this->assertTrue(collect($order['entries'])->contains(
            fn (array $e): bool => $e['key'] === 'home_specials_title' && $e['value'] === 'Order Name',
        ));

        $this->getJson('/api/admin/content/export?locale=en&scope=shared')->assertStatus(422);
    }
}
