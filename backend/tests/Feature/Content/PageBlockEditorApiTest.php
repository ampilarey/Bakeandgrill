<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Domains\Content\ContentDraftStore;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageBlock;
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

    /**
     * A partial PUT must never touch fields that were not in the request.
     * Regression: update() used to run the raw request through validator
     * defaults, so PUT {is_enabled:false} reset position to 0 and settings
     * to [] — turning a section off jumped it to the top and blanked it.
     */
    public function test_partial_put_with_only_is_enabled_preserves_position_settings_and_content_mode(): void
    {
        $block = PageBlock::query()->where('app', 'website')->where('block_type', 'specials')->firstOrFail();
        $block->update(['position' => 7, 'settings' => ['headline' => 'Keep me'], 'content_mode' => 'shared']);

        $this->putJson("/api/admin/page-blocks/{$block->id}", ['is_enabled' => false])->assertOk();

        $fresh = $block->fresh();
        $this->assertFalse((bool) $fresh->is_enabled);
        $this->assertSame(7, (int) $fresh->position, 'Partial PUT must not reset position.');
        $this->assertSame(['headline' => 'Keep me'], $fresh->settings, 'Partial PUT must not blank settings.');
        $this->assertSame('shared', $fresh->content_mode);
    }

    public function test_partial_put_with_only_content_mode_preserves_position_settings_and_is_enabled(): void
    {
        $block = PageBlock::query()->where('app', 'website')->where('block_type', 'specials')->firstOrFail();
        $block->update([
            'position' => 3,
            'is_enabled' => false,
            'settings' => ['headline' => 'Keep me'],
            'content_mode' => 'shared',
        ]);

        $this->putJson("/api/admin/page-blocks/{$block->id}", ['content_mode' => 'own'])->assertOk();

        $fresh = $block->fresh();
        $this->assertSame('own', $fresh->content_mode);
        $this->assertFalse((bool) $fresh->is_enabled, 'Changing content mode must not silently republish a disabled block.');
        $this->assertSame(3, (int) $fresh->position);
        // shared → own copies shared content in as a starting point, but the
        // block's own existing settings must survive the merge.
        $this->assertSame('Keep me', $fresh->settings['headline'] ?? null);
    }

    public function test_partial_put_with_only_position_preserves_is_enabled_and_settings(): void
    {
        $block = PageBlock::query()->where('app', 'website')->where('block_type', 'specials')->firstOrFail();
        $block->update(['is_enabled' => false, 'settings' => ['headline' => 'Keep me']]);

        $this->putJson("/api/admin/page-blocks/{$block->id}", ['position' => 5])->assertOk();

        $fresh = $block->fresh();
        $this->assertSame(5, (int) $fresh->position);
        $this->assertFalse((bool) $fresh->is_enabled, 'Moving a disabled block must not re-enable it.');
        $this->assertSame(['headline' => 'Keep me'], $fresh->settings);
    }

    public function test_partial_put_with_settings_replaces_settings_and_nothing_else(): void
    {
        $block = PageBlock::query()->where('app', 'website')->where('block_type', 'specials')->firstOrFail();
        $block->update(['position' => 4, 'is_enabled' => false, 'settings' => ['headline' => 'Old']]);

        $this->putJson("/api/admin/page-blocks/{$block->id}", ['settings' => ['headline' => 'New']])->assertOk();

        $fresh = $block->fresh();
        $this->assertSame(['headline' => 'New'], $fresh->settings);
        $this->assertSame(4, (int) $fresh->position);
        $this->assertFalse((bool) $fresh->is_enabled);
    }

    public function test_store_with_explicit_position_zero_lands_the_block_first(): void
    {
        // Make room at the top, the way a client inserting at position 0 would.
        PageBlock::query()->where('app', 'order_app')->where('page', 'home')->increment('position');

        $res = $this->postJson('/api/admin/page-blocks', [
            'app' => 'order_app',
            'block_type' => 'promo_carousel',
            'position' => 0,
        ])->assertCreated();

        $this->assertSame(0, (int) $res->json('block.position'), 'Explicit position 0 must not be replaced by max+1.');

        $first = $this->getJson('/api/admin/page-blocks?app=order_app')->assertOk()->json('blocks.0');
        $this->assertSame('promo_carousel', $first['block_type']);
    }

    public function test_reorder_payload_missing_a_block_is_rejected_and_changes_nothing(): void
    {
        $before = PageBlock::query()->where('app', 'order_app')->orderBy('position')
            ->get(['id', 'position', 'is_enabled'])->toArray();

        $blocks = PageBlock::query()->where('app', 'order_app')->orderBy('position')->get();
        $partial = $blocks->slice(0, $blocks->count() - 1)->values();

        $this->putJson('/api/admin/page-blocks/reorder', [
            'app' => 'order_app',
            'page' => 'home',
            'blocks' => $partial->map(fn (PageBlock $b, int $i) => [
                'id' => $b->id,
                'position' => $i,
                'is_enabled' => (bool) $b->is_enabled,
            ])->all(),
        ])->assertStatus(422);

        $this->assertSame(
            $before,
            PageBlock::query()->where('app', 'order_app')->orderBy('position')
                ->get(['id', 'position', 'is_enabled'])->toArray(),
            'A rejected reorder must leave every block untouched.',
        );
    }

    public function test_reordering_one_app_does_not_affect_the_other(): void
    {
        $websiteBefore = PageBlock::query()->where('app', 'website')->orderBy('position')->pluck('block_type')->all();
        $orderBefore = PageBlock::query()->where('app', 'order_app')->orderBy('position')->get();
        $reversed = $orderBefore->reverse()->values();

        $this->putJson('/api/admin/page-blocks/reorder', [
            'app' => 'order_app',
            'page' => 'home',
            'blocks' => $reversed->map(fn (PageBlock $b, int $i) => [
                'id' => $b->id,
                'position' => $i,
                'is_enabled' => (bool) $b->is_enabled,
            ])->all(),
        ])->assertOk();

        $this->assertSame(
            $websiteBefore,
            PageBlock::query()->where('app', 'website')->orderBy('position')->pluck('block_type')->all(),
        );
        $this->assertSame(
            $reversed->pluck('block_type')->all(),
            PageBlock::query()->where('app', 'order_app')->orderBy('position')->pluck('block_type')->all(),
        );
    }

    public function test_shared_to_own_copies_values_rather_than_emptying(): void
    {
        $hero = PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'hero')
            ->firstOrFail();
        $this->assertSame('shared', $hero->content_mode);

        $res = $this->putJson("/api/admin/page-blocks/{$hero->id}", [
            'content_mode' => 'own',
        ])->assertOk();

        $settings = $res->json('block.settings');
        $this->assertIsArray($settings);
        $this->assertArrayHasKey('_copied_from_shared', $settings);
        $this->assertArrayHasKey('hero_slides', $settings['_copied_from_shared']);
        $this->assertSame('own', $hero->fresh()->content_mode);
    }

    public function test_preview_token_serves_draft_layout_without_changing_public(): void
    {
        $public = $this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks');

        $draftBlocks = collect($public)->map(function (array $b) {
            if ($b['block_type'] === 'specials') {
                $b['is_enabled'] = false;
            }

            return $b;
        })->values()->all();

        $token = $this->postJson('/api/admin/page-blocks/preview-token', [
            'app' => 'order_app',
            'page' => 'home',
            'blocks' => $draftBlocks,
        ])->assertOk()->json('token');

        $preview = $this->getJson('/api/page-blocks?app=order_app&preview_token='.$token)
            ->assertOk()
            ->assertJsonPath('preview', true)
            ->json('blocks');

        $specials = collect($preview)->firstWhere('block_type', 'specials');
        $this->assertFalse((bool) ($specials['is_enabled'] ?? true));

        // Public page unchanged.
        $publicAgain = $this->getJson('/api/page-blocks?app=order_app')->assertOk()->json('blocks');
        $this->assertSame(
            collect($public)->map(fn ($b) => [$b['block_type'], $b['is_enabled']])->all(),
            collect($publicAgain)->map(fn ($b) => [$b['block_type'], $b['is_enabled']])->all(),
        );

        ContentDraftStore::forget($token);
    }
}
