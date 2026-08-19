<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ContentDraft;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-08-19: "there is no way to discard saved draft in hero."
 *
 * Discard was all-or-nothing per app: abandoning one bad hero draft meant
 * throwing away every other unpublished change too. The endpoint now takes an
 * optional key so a single block can be reverted to what is live.
 */
class ContentDraftDiscardKeyTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'content-editor'],
            ['name' => 'Content Editor', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $role->permissions()->syncWithoutDetaching(Permission::query()->pluck('id'));

        return User::create([
            'name' => 'Draft Editor',
            'email' => 'draft-editor@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    private function draft(User $user, string $key, string $value = '[]'): ContentDraft
    {
        return ContentDraft::create([
            'user_id' => $user->id,
            'key' => $key,
            'scope' => 'website',
            'locale' => 'en',
            'value' => $value,
        ]);
    }

    public function test_discarding_one_key_leaves_the_other_drafts_alone(): void
    {
        $user = $this->editor();
        $this->draft($user, 'hero_slides', '[{"title":"Oops"}]');
        $this->draft($user, 'site_name', 'Half-typed name');
        Sanctum::actingAs($user, ['staff']);

        $this->deleteJson('/api/admin/content/drafts?locale=en&scope=website&key=hero_slides')
            ->assertOk()
            ->assertJsonPath('deleted', 1)
            ->assertJsonPath('key', 'hero_slides');

        $this->assertDatabaseMissing('content_drafts', ['user_id' => $user->id, 'key' => 'hero_slides']);
        $this->assertDatabaseHas('content_drafts', ['user_id' => $user->id, 'key' => 'site_name']);
    }

    public function test_omitting_the_key_still_discards_everything_as_before(): void
    {
        $user = $this->editor();
        $this->draft($user, 'hero_slides');
        $this->draft($user, 'site_name', 'Half-typed name');
        Sanctum::actingAs($user, ['staff']);

        $this->deleteJson('/api/admin/content/drafts?locale=en&scope=website')
            ->assertOk()
            ->assertJsonPath('deleted', 2);

        $this->assertDatabaseCount('content_drafts', 0);
    }

    public function test_an_unknown_key_is_rejected_rather_than_deleting_everything(): void
    {
        // The dangerous failure mode: a typo silently widening to "all drafts".
        $user = $this->editor();
        $this->draft($user, 'hero_slides');
        Sanctum::actingAs($user, ['staff']);

        $this->deleteJson('/api/admin/content/drafts?locale=en&key=not_a_real_key')
            ->assertNotFound();

        $this->assertDatabaseCount('content_drafts', 1);
    }

    public function test_one_editors_discard_never_touches_anothers_draft(): void
    {
        $mine = $this->editor();
        $theirs = User::create([
            'name' => 'Other Editor',
            'email' => 'other-editor@test.local',
            'password' => Hash::make('password'),
            'role_id' => $mine->role_id,
            'is_active' => true,
        ]);
        $this->draft($mine, 'hero_slides');
        $this->draft($theirs, 'hero_slides');

        Sanctum::actingAs($mine, ['staff']);
        $this->deleteJson('/api/admin/content/drafts?locale=en&key=hero_slides')->assertOk();

        $this->assertDatabaseMissing('content_drafts', ['user_id' => $mine->id]);
        $this->assertDatabaseHas('content_drafts', ['user_id' => $theirs->id]);
    }
}
