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

    public function test_shared_content_mode_rejected_on_create(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'content_mode' => 'shared',
            'settings' => ['heading' => 'Shared story', 'body' => 'One story for both.'],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['content_mode']);
    }

    public function test_create_without_content_mode_defaults_to_own(): void
    {
        $response = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'rich_text',
            'settings' => ['heading' => 'Default own', 'body' => 'Own by default.'],
        ])->assertCreated();

        $this->assertSame('own', $response->json('block.content_mode'));
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
        $res = $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'hero',
            'settings' => [
                'show_mobile' => true,
                'placement_mobile' => 'header',
                'show_desktop' => false,
                'placement_desktop' => 'home',
            ],
        ])->assertStatus(422);

        $message = (string) data_get($res->json(), 'errors.block_type.0', '');
        $this->assertStringContainsString('singleton', strtolower($message));
    }

    public function test_duplicate_prayer_bar_on_same_surface_via_api_is_rejected(): void
    {
        // prayer_bar already seeded on website home — a second create must 422
        // even when placement settings target a specific device/surface.
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'version' => 0,
            'block_type' => 'prayer_bar',
            'settings' => [
                'show_mobile' => true,
                'placement_mobile' => 'header',
                'show_desktop' => true,
                'placement_desktop' => 'header',
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['block_type']);
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
