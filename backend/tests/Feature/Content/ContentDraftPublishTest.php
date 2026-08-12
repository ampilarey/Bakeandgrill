<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ContentDraft;
use App\Models\ContentRevision;
use App\Models\ContentSchedule;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\ContentSanitizer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ContentDraftPublishTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(string $email = 'draft-owner@test.local', string $name = 'Draft Owner'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    public function test_wysiwyg_html_is_sanitized_on_draft_autosave(): void
    {
        $this->actingAsOwner();

        $this->putJson('/api/admin/content/drafts', [
            'locale' => 'en',
            'changes' => [
                [
                    'key' => 'cta_band_headline',
                    'scope' => 'website',
                    'value' => 'Hi <script>alert(1)</script><b>there</b><img src=x onerror=1>',
                ],
            ],
        ])->assertOk()->assertJsonPath('message', 'Draft saved.');

        $draft = ContentDraft::query()
            ->where('key', 'cta_band_headline')
            ->first();

        $this->assertNotNull($draft);
        $this->assertStringNotContainsString('<script', (string) $draft->value);
        $this->assertStringNotContainsString('<img', (string) $draft->value);
        $this->assertStringContainsString('<strong>there</strong>', (string) $draft->value);

        // Live setting must remain untouched.
        $this->assertTrue(
            SiteSetting::getScoped('cta_band_headline', 'website') === null
            || SiteSetting::getScoped('cta_band_headline', 'website') === ''
            || !str_contains((string) SiteSetting::getScoped('cta_band_headline', 'website'), 'there'),
        );
    }

    public function test_autosave_persists_draft_and_publish_promotes_and_busts_cache(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('cta_band_headline', 'Live headline', 'website', 'en');
        Cache::put('site_settings.all', ['cta_band_headline' => 'stale'], 60);

        $this->putJson('/api/admin/content/drafts', [
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Draft <em>headline</em>'],
            ],
        ])->assertOk();

        $this->getJson('/api/admin/content/drafts?scope=website&locale=en')
            ->assertOk()
            ->assertJsonPath('drafts.cta_band_headline', ContentSanitizer::clean('Draft <em>headline</em>'));

        $this->assertSame('Live headline', SiteSetting::getScoped('cta_band_headline', 'website', 'en'));

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Draft <em>headline</em>'],
            ],
        ])->assertOk()->assertJsonPath('message', 'Content published.');

        $this->assertSame(
            ContentSanitizer::clean('Draft <em>headline</em>'),
            SiteSetting::getScoped('cta_band_headline', 'website', 'en'),
        );

        $this->assertFalse(
            ContentDraft::query()
                ->where('key', 'cta_band_headline')
                ->where('scope', 'website')
                ->exists(),
        );

        // Cache bust: SiteSetting::bust() clears the all-settings cache key.
        $this->assertFalse(Cache::has('site_settings.all'));
    }

    public function test_history_excludes_draft_rows(): void
    {
        $this->actingAsOwner();
        SiteSetting::set('cta_band_headline', 'A', 'website', 'en');

        $this->putJson('/api/admin/content/drafts', [
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Draft only'],
            ],
        ])->assertOk();

        $this->putJson('/api/admin/content', [
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Published B'],
            ],
        ])->assertOk();

        $revs = $this->getJson('/api/admin/content/cta_band_headline/revisions?scope=website&locale=en')
            ->assertOk()
            ->json('revisions');

        foreach ($revs as $rev) {
            $this->assertNotSame('Draft only', $rev['value'] ?? null);
        }
    }

    public function test_user_drafts_are_private_and_other_users_do_not_clear_them_on_publish(): void
    {
        $userA = $this->actingAsOwner('draft-a@test.local', 'Draft A');

        $this->putJson('/api/admin/content/drafts', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Private A draft'],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('content_drafts', [
            'user_id' => $userA->id,
            'key' => 'cta_band_headline',
            'scope' => 'website',
            'locale' => 'en',
            'value' => 'Private A draft',
        ]);

        $userB = $this->actingAsOwner('draft-b@test.local', 'Draft B');

        $this->getJson('/api/admin/content/drafts?scope=website&locale=en')
            ->assertOk()
            ->assertJsonPath('drafts', []);

        $this->putJson('/api/admin/content', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'User B publish'],
            ],
        ])->assertOk();

        $this->assertSame('User B publish', SiteSetting::getScoped('cta_band_headline', 'website', 'en'));
        $this->assertDatabaseHas('content_drafts', [
            'user_id' => $userA->id,
            'key' => 'cta_band_headline',
            'scope' => 'website',
            'locale' => 'en',
            'value' => 'Private A draft',
        ]);
        $this->assertDatabaseMissing('content_drafts', [
            'user_id' => $userB->id,
            'key' => 'cta_band_headline',
            'scope' => 'website',
            'locale' => 'en',
        ]);
    }

    public function test_discard_drafts_requires_staff_auth(): void
    {
        $this->deleteJson('/api/admin/content/drafts')->assertUnauthorized();
    }

    public function test_discard_drafts_removes_all_scopes_for_current_user_and_locale(): void
    {
        $user = $this->actingAsOwner();

        $this->putJson('/api/admin/content/drafts', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Draft website'],
                ['key' => 'cta_band_headline', 'scope' => 'shared', 'value' => 'Draft shared'],
            ],
        ])->assertOk();
        $this->putJson('/api/admin/content/drafts', [
            'locale' => 'dv',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Draft DV'],
            ],
        ])->assertOk();

        $this->deleteJson('/api/admin/content/drafts', ['locale' => 'en'])
            ->assertOk()
            ->assertJsonPath('deleted', 2)
            ->assertJsonPath('locale', 'en');

        $this->assertDatabaseMissing('content_drafts', ['user_id' => $user->id, 'locale' => 'en']);
        // DV locale draft is untouched — discard is scoped to the requested locale.
        $this->assertDatabaseHas('content_drafts', ['user_id' => $user->id, 'locale' => 'dv']);
    }

    public function test_discard_drafts_can_be_scoped_to_one_app(): void
    {
        $user = $this->actingAsOwner();

        $this->putJson('/api/admin/content/drafts', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Draft website'],
                ['key' => 'cta_band_headline', 'scope' => 'shared', 'value' => 'Draft shared'],
            ],
        ])->assertOk();

        $this->deleteJson('/api/admin/content/drafts', ['locale' => 'en', 'scope' => 'website'])
            ->assertOk()
            ->assertJsonPath('deleted', 1)
            ->assertJsonPath('scope', 'website');

        $this->assertDatabaseMissing('content_drafts', [
            'user_id' => $user->id,
            'scope' => 'website',
            'locale' => 'en',
        ]);
        $this->assertDatabaseHas('content_drafts', [
            'user_id' => $user->id,
            'scope' => 'shared',
            'locale' => 'en',
        ]);
    }

    public function test_discard_drafts_does_not_touch_other_users_drafts(): void
    {
        $userA = $this->actingAsOwner('discard-a@test.local', 'Discard A');
        $this->putJson('/api/admin/content/drafts', [
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'A draft'],
            ],
        ])->assertOk();

        $userB = $this->actingAsOwner('discard-b@test.local', 'Discard B');
        $this->putJson('/api/admin/content/drafts', [
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'B draft'],
            ],
        ])->assertOk();

        $this->deleteJson('/api/admin/content/drafts')->assertOk();

        $this->assertDatabaseMissing('content_drafts', ['user_id' => $userB->id]);
        $this->assertDatabaseHas('content_drafts', ['user_id' => $userA->id]);
    }

    public function test_schedule_clears_matching_content_drafts_for_current_user(): void
    {
        $user = $this->actingAsOwner();

        $this->putJson('/api/admin/content/drafts', [
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Scheduled draft'],
                ['key' => 'site_tagline', 'scope' => 'shared', 'value' => 'Keep this draft'],
            ],
        ])->assertOk();

        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'locale' => 'en',
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'Scheduled draft'],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('drafts_cleared', 1);

        $this->assertDatabaseMissing('content_drafts', [
            'user_id' => $user->id,
            'key' => 'cta_band_headline',
            'scope' => 'website',
            'locale' => 'en',
        ]);
        // Unrelated draft stays until publish/discard.
        $this->assertDatabaseHas('content_drafts', [
            'user_id' => $user->id,
            'key' => 'site_tagline',
            'scope' => 'shared',
            'locale' => 'en',
        ]);
        $this->assertSame(1, ContentSchedule::query()->where('key', 'cta_band_headline')->count());
    }

    public function test_schedule_does_not_clear_other_users_drafts(): void
    {
        $userA = $this->actingAsOwner('schedule-a@test.local', 'Schedule A');
        $this->putJson('/api/admin/content/drafts', [
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'A draft'],
            ],
        ])->assertOk();

        $this->actingAsOwner('schedule-b@test.local', 'Schedule B');
        $this->postJson('/api/admin/content/schedule', [
            'publish_at' => now()->addHour()->toIso8601String(),
            'changes' => [
                ['key' => 'cta_band_headline', 'scope' => 'website', 'value' => 'B schedule'],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('content_drafts', [
            'user_id' => $userA->id,
            'key' => 'cta_band_headline',
            'value' => 'A draft',
        ]);
    }
}
