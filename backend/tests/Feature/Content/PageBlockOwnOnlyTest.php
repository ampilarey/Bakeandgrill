<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageBlock;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PageBlockOwnOnlyTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'page-block-own-only@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('9999'),
            'is_active' => true,
        ]);
        $this->owner->grantPermission('website.manage');
        Sanctum::actingAs($this->owner, ['staff']);
        HomeLayoutMigrator::migrate();
    }

    public function test_create_without_content_mode_defaults_to_own(): void
    {
        $response = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'settings' => ['heading' => 'Own default', 'body' => 'Body text.'],
        ])->assertCreated();

        $this->assertSame('own', $response->json('block.content_mode'));
        $this->assertFalse($response->json('block.supports_shared_content'));
    }

    public function test_content_mode_shared_returns_422(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'content_mode' => 'shared',
            'settings' => ['heading' => 'Nope', 'body' => 'Rejected.'],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['content_mode']);
    }

    public function test_publish_website_does_not_create_order_app_twin(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'settings' => ['heading' => 'Website only twin test', 'body' => 'No twin.'],
        ])->assertCreated();

        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
        ])->assertOk();

        $orderTwin = PageBlock::query()
            ->where('app', 'order_app')
            ->where('block_type', 'rich_text')
            ->first();

        $this->assertNull($orderTwin);
    }

    public function test_generic_website_block_not_in_order_app_public_list(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'settings' => ['heading' => 'Public isolation', 'body' => 'Order app should not see this.'],
        ])->assertCreated();

        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
        ])->assertOk();

        $websiteHeadings = collect($this->getJson('/api/page-blocks?app=website')->assertOk()->json('blocks'))
            ->where('block_type', 'rich_text')
            ->pluck('settings.heading')
            ->all();

        $orderHeadings = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'))
            ->where('block_type', 'rich_text')
            ->pluck('settings.heading')
            ->all();

        $this->assertContains('Public isolation', $websiteHeadings);
        $this->assertNotContains('Public isolation', $orderHeadings);
    }
}
