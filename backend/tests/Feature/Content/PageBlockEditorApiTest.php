<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageBlock;
use App\Models\PageLayoutDraft;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PageBlockEditorApiTest extends TestCase
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
            'email' => 'layout-editor@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('9999'),
            'is_active' => true,
        ]);
        $this->owner->grantPermission('website.manage');
        Sanctum::actingAs($this->owner, ['staff']);
        HomeLayoutMigrator::migrate();
    }

    public function test_layout_edit_in_draft_previews_without_changing_public_index(): void
    {
        $block = PageBlock::query()
            ->where('app', 'order_app')
            ->where('is_enabled', true)
            ->whereNotIn('block_type', ['mode_cards', 'brand_footer'])
            ->firstOrFail();

        $this->putJson("/api/admin/page-blocks/{$block->id}", [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 0,
            'is_enabled' => false,
        ])->assertOk()->assertJsonPath('version', 1);

        $public = $this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks');
        $this->assertTrue((bool) collect($public)->firstWhere('block_type', $block->block_type)['is_enabled']);

        $token = $this->postJson('/api/admin/page-blocks/preview-token', [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 1,
        ])->assertOk()->json('token');

        $preview = $this->getJson('/api/page-blocks?app=order_app&preview_token='.$token)
            ->assertOk()
            ->assertJsonPath('preview', true)
            ->json('blocks');

        $this->assertFalse((bool) collect($preview)->firstWhere('block_type', $block->block_type)['is_enabled']);

        $publicAgain = $this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks');
        $this->assertTrue((bool) collect($publicAgain)->firstWhere('block_type', $block->block_type)['is_enabled']);
    }

    public function test_publish_changes_public_index(): void
    {
        $block = PageBlock::query()
            ->where('app', 'order_app')
            ->where('is_enabled', true)
            ->whereNotIn('block_type', ['mode_cards', 'brand_footer'])
            ->firstOrFail();

        $this->putJson("/api/admin/page-blocks/{$block->id}", [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 0,
            'is_enabled' => false,
        ])->assertOk();

        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => 'order_app',
            'page' => 'home',
            'version' => 1,
        ])->assertOk()->assertJsonPath('draft', false);

        $types = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'))
            ->pluck('block_type')
            ->all();
        $this->assertNotContains($block->block_type, $types);
    }

    public function test_shared_generic_block_settings_publish_to_both_apps(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'content_mode' => 'shared',
            'settings' => ['heading' => 'Shared story', 'body' => 'One story for both.'],
        ])->assertCreated()->assertJsonPath('version', 1);

        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
        ])->assertOk();

        $website = collect($this->getJson('/api/page-blocks?app=website')->assertOk()->json('blocks'))
            ->firstWhere('block_type', 'rich_text');
        $order = collect($this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks'))
            ->firstWhere('block_type', 'rich_text');

        $this->assertSame('Shared story', $website['settings']['heading'] ?? null);
        $this->assertSame('Shared story', $order['settings']['heading'] ?? null);
        $this->assertSame($website['shared_content_id'], $order['shared_content_id']);
    }

    public function test_own_generic_block_only_publishes_to_one_app(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'content_mode' => 'own',
            'settings' => ['heading' => 'Website only', 'body' => 'No order app copy.'],
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

        $this->assertContains('Website only', $websiteHeadings);
        $this->assertNotContains('Website only', $orderHeadings);
    }

    public function test_delete_and_reorder_stay_unpublished_until_publish(): void
    {
        $before = collect($this->getJson('/api/page-blocks?app=website')->assertOk()->json('blocks'))
            ->pluck('block_type')
            ->all();
        $featured = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'featured')
            ->firstOrFail();

        $draft = $this->deleteJson("/api/admin/page-blocks/{$featured->id}", [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
        ])->assertOk()->json();

        $reversed = collect($draft['blocks'])->reverse()->values()->map(fn (array $block, int $i): array => [
            'id' => $block['id'],
            'position' => $i,
            'is_enabled' => (bool) $block['is_enabled'],
        ])->all();

        $this->putJson('/api/admin/page-blocks/reorder', [
            'app' => 'website',
            'page' => 'home',
            'version' => 1,
            'blocks' => $reversed,
        ])->assertOk();

        $this->assertSame(
            $before,
            collect($this->getJson('/api/page-blocks?app=website')->assertOk()->json('blocks'))->pluck('block_type')->all(),
        );

        $this->postJson('/api/admin/page-blocks/publish', [
            'app' => 'website',
            'page' => 'home',
            'version' => 2,
        ])->assertOk();

        $after = collect($this->getJson('/api/page-blocks?app=website')->assertOk()->json('blocks'))
            ->pluck('block_type')
            ->all();
        $this->assertNotContains('featured', $after);
        $this->assertNotSame($before, $after);
    }

    public function test_duplicate_singleton_store_returns_422(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'hero',
        ])->assertStatus(422);
    }

    public function test_second_user_cannot_overwrite_first_users_private_draft(): void
    {
        $hero = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'hero')
            ->firstOrFail();

        $this->putJson("/api/admin/page-blocks/{$hero->id}", [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'is_enabled' => false,
        ])->assertOk();

        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        $other = User::create([
            'name' => 'Second Owner',
            'email' => 'layout-editor-2@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1111'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($other, ['staff']);

        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'content_mode' => 'own',
            'settings' => ['heading' => 'Second edit'],
        ])->assertStatus(409);

        $this->assertSame(1, PageLayoutDraft::query()->count());
    }
}
