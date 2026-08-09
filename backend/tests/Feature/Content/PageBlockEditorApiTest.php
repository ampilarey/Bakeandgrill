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
