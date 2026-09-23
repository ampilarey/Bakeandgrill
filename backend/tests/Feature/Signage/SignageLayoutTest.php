<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageLayout;
use App\Domains\Signage\Services\SignageResolver;
use App\Models\Role;
use App\Models\SignageGroup;
use App\Models\SignageScreen;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-23: "setting different layout for the tv in admin app".
 * A look per group and per screen, group under screen, off by default.
 */
final class SignageLayoutTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    private function owner(): User
    {
        return User::create([
            'name' => 'Owner',
            'email' => 'owner-layout@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_no_look_means_no_layout_in_the_config(): void
    {
        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v1');
        $this->assertNull($cfg['layout']);
    }

    public function test_the_screen_s_look_sits_on_the_group_s(): void
    {
        $group = SignageGroup::query()->firstOrFail();
        $group->update(['layout' => ['preset' => 'classic', 'columns' => 3, 'show_thumbs' => false]]);
        $screen = SignageScreen::query()->where('slug', 'default')->firstOrFail();
        $screen->update(['layout' => ['show_thumbs' => true, 'dhivehi_first' => true]]);

        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v1');

        $this->assertSame(
            ['preset' => 'classic', 'columns' => 3, 'show_thumbs' => true, 'dhivehi_first' => true],
            $cfg['layout'],
        );
    }

    public function test_a_screen_that_picks_its_own_preset_does_not_inherit_the_group_s_knobs(): void
    {
        $this->assertSame(
            ['preset' => 'photo_grid', 'rows_per_slide' => 6],
            SignageLayout::merge(['preset' => 'price_board', 'columns' => 3], ['preset' => 'photo_grid', 'rows_per_slide' => 6]),
        );
        // Same preset: the knobs layer.
        $this->assertSame(
            ['preset' => 'classic', 'columns' => 3, 'rows_per_slide' => 10],
            SignageLayout::merge(['preset' => 'classic', 'columns' => 3], ['rows_per_slide' => 10]),
        );
        $this->assertNull(SignageLayout::merge(null, []));
    }

    public function test_admin_saves_a_look_on_a_screen_and_on_a_group(): void
    {
        Sanctum::actingAs($this->owner(), ['staff']);
        $screen = SignageScreen::query()->where('slug', 'default')->firstOrFail();
        $group = SignageGroup::query()->firstOrFail();

        $this->putJson("/api/admin/signage/screens/{$screen->id}", [
            'layout' => ['preset' => 'magazine', 'category_ids' => ['8', 9], 'columns' => '', 'dhivehi_first' => true],
        ])->assertOk()
            ->assertJsonPath('data.layout.preset', 'magazine')
            ->assertJsonPath('data.layout.category_ids', [8, 9])
            ->assertJsonPath('data.layout.dhivehi_first', true)
            ->assertJsonMissingPath('data.layout.columns');

        $this->putJson("/api/admin/signage/groups/{$group->id}", [
            'layout' => ['preset' => 'price_board'],
            'theme' => ['primary' => '#C0392B'],
        ])->assertOk()
            ->assertJsonPath('data.layout.preset', 'price_board')
            ->assertJsonPath('data.theme.primary', '#C0392B');

        $this->getJson('/api/admin/signage')->assertOk()
            ->assertJsonPath('screens.0.layout.preset', 'magazine')
            ->assertJsonPath('groups.0.layout.preset', 'price_board');

        // Clearing the look puts the screen back on the playlist's own settings.
        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => []])->assertOk()
            ->assertJsonPath('data.layout', null);
    }

    public function test_day_parts_and_sleep_are_saved_cleaned_and_checked(): void
    {
        Sanctum::actingAs($this->owner(), ['staff']);
        $screen = SignageScreen::query()->where('slug', 'default')->firstOrFail();

        $res = $this->putJson("/api/admin/signage/screens/{$screen->id}", [
            'layout' => [
                'dayparts' => [
                    ['id' => 'bf', 'label' => 'Breakfast', 'category_ids' => ['4'], 'preset' => '', 'schedule' => ['windows' => [['start' => '06:00', 'end' => '10:59']]]],
                    ['id' => 'x', 'label' => '   ', 'category_ids' => [5]],
                    ['id' => 'lunch', 'label' => 'Lunch', 'category_ids' => [5], 'preset' => 'photo_grid', 'schedule' => ['days' => [1, 2], 'windows' => [['start' => '11:00', 'end' => '14:59']]]],
                ],
                'sleep' => ['enabled' => true, 'off' => '23:00', 'on' => '06:45', 'days' => []],
            ],
        ])->assertOk();

        $layout = $res->json('data.layout');
        $this->assertCount(2, $layout['dayparts'], 'a day part with no label is dropped');
        $this->assertSame([4], $layout['dayparts'][0]['category_ids']);
        $this->assertArrayNotHasKey('preset', $layout['dayparts'][0], 'an empty preset means "keep the look"');
        $this->assertSame('photo_grid', $layout['dayparts'][1]['preset']);
        $this->assertSame(['enabled' => true, 'off' => '23:00', 'on' => '06:45', 'days' => []], $layout['sleep']);
        $this->assertArrayNotHasKey('preset', $layout, 'day parts do not force a preset on the look');

        // Reaches the board through the resolver.
        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v2');
        $this->assertSame('Breakfast', $cfg['layout']['dayparts'][0]['label']);
        $this->assertTrue($cfg['layout']['sleep']['enabled']);

        // A blank sleep goes away; a bad time or preset is refused.
        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => ['sleep' => ['enabled' => false, 'off' => '', 'on' => '']]])
            ->assertOk()->assertJsonPath('data.layout', null);
        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => ['sleep' => ['enabled' => true, 'off' => '11pm', 'on' => '06:45']]])
            ->assertStatus(422);
        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => ['dayparts' => [['label' => 'X', 'preset' => 'neon']]]])
            ->assertStatus(422);
    }

    public function test_an_unknown_preset_or_column_count_is_refused(): void
    {
        Sanctum::actingAs($this->owner(), ['staff']);
        $screen = SignageScreen::query()->where('slug', 'default')->firstOrFail();

        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => ['preset' => 'neon']])->assertStatus(422);
        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => ['columns' => 9]])->assertStatus(422);
        $this->putJson("/api/admin/signage/screens/{$screen->id}", ['layout' => ['card_style' => 'hex']])->assertStatus(422);
    }
}
