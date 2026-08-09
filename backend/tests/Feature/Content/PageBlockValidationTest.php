<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\PageBlock;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PageBlockValidationTest extends TestCase
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
            'email' => 'page-blocks-owner@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('9999'),
            'is_active' => true,
        ]);
        $this->owner->grantPermission('website.manage');
        Sanctum::actingAs($this->owner, ['staff']);
    }

    public function test_rejects_block_type_not_permitted_in_app(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'mode_cards',
        ])->assertStatus(422);
    }

    public function test_rejects_unknown_block_type(): void
    {
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'spaceship',
        ])->assertStatus(422);
    }

    public function test_cannot_delete_or_disable_non_removable_mode_cards(): void
    {
        $block = PageBlock::create([
            'app' => 'order_app',
            'page' => 'home',
            'block_type' => 'mode_cards',
            'position' => 1,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => [],
        ]);

        $this->deleteJson("/api/admin/page-blocks/{$block->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['block_type' => ['These cards are the only way into ordering. Removing them would remove checkout.']]);

        $this->putJson("/api/admin/page-blocks/{$block->id}", [
            'is_enabled' => false,
        ])->assertStatus(422);

        $this->putJson('/api/admin/page-blocks/reorder', [
            'app' => 'order_app',
            'page' => 'home',
            'blocks' => [
                ['id' => $block->id, 'position' => 0, 'is_enabled' => false],
            ],
        ])->assertStatus(422);

        $this->assertTrue($block->fresh()->is_enabled);
    }

    public function test_cannot_delete_brand_footer(): void
    {
        $block = PageBlock::create([
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'brand_footer',
            'position' => 99,
            'is_enabled' => true,
            'content_mode' => 'shared',
            'settings' => [],
        ]);

        $this->deleteJson("/api/admin/page-blocks/{$block->id}")->assertStatus(422);
    }

    public function test_settings_must_match_schema_when_defined(): void
    {
        // hero has empty schema — still creatable
        $this->postJson('/api/admin/page-blocks', [
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'hero',
            'settings' => ['anything' => true],
        ])->assertCreated();
    }
}
