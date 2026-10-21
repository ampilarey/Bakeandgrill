<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Posters\PosterPurposes;
use App\Models\Item;
use App\Models\Poster;
use App\Models\PosterTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A poster made on a ready-made design (docs/POSTER_THEMES_HANDOFF.md § 5):
 * the catalogue and one theme's slots come from the API, its pictures stream
 * behind the sign-in, a themed poster keeps its words and photo choices by
 * slot id, and a saved template keeps the theme.
 */
class PosterThemeMakeTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_catalog_lists_the_designs_and_one_theme_comes_with_its_slots(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $catalog = $this->getJson('/api/posters/catalog')->assertOk();
        $this->assertCount(13, $catalog->json('themes.categories'));
        $this->assertCount(110, $catalog->json('themes.themes'));
        $this->assertSame('large', $catalog->json('themes.sizes.A3'));
        $this->assertSame('With item photo', $catalog->json('themes.styles.photo'));
        $first = $catalog->json('themes.themes.0');
        $this->assertSame('BG-001', $first['id']);
        $this->assertStringEndsWith('/api/posters/themes/bg001-flash-sale-pastries/preview-large.jpg', $first['preview_url']);
        $this->assertTrue(collect($catalog->json('purposes'))->contains('key', PosterPurposes::THEMED));

        $theme = $this->getJson('/api/posters/themes/bg012-value-meals-menu')->assertOk();
        $this->assertSame('BG-012', $theme->json('id'));
        $this->assertSame('t2', $theme->json('variants.large.text_slots.1.id'));
        $this->assertSame('MEAL DEALS', $theme->json('variants.large.text_slots.1.default'));
        $this->assertSame('headline', $theme->json('variants.large.text_slots.1.role_hint'));
        $this->assertSame('p1', $theme->json('variants.small.photo_slots.0.id'));
        $this->assertStringEndsWith('/placeholder-small-p1.png', $theme->json('variants.small.photo_slots.0.placeholder_url'));
        $this->assertStringEndsWith('/backdrop-large.svg', $theme->json('variants.large.urls.backdrop'));
        $this->assertNull($theme->json('variants.large.print_files'));
        $this->assertSame('j8', $theme->json('fonts.jakarta-800'));

        $this->getJson('/api/posters/themes/nope')->assertNotFound();
    }

    public function test_theme_pictures_stream_behind_the_sign_in_and_only_the_known_files(): void
    {
        $this->get('/api/posters/themes/bg012-value-meals-menu/preview-large.jpg')->assertStatus(401);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->get('/api/posters/themes/bg012-value-meals-menu/preview-large.jpg')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg');
        $this->get('/api/posters/themes/bg012-value-meals-menu/backdrop-small.svg')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/svg+xml');
        $this->get('/api/posters/themes/bg012-value-meals-menu/placeholder-large-p1.png')->assertOk();
        $this->get('/api/posters/themes/bg012-value-meals-menu/theme.json')->assertNotFound();
        $this->get('/api/posters/themes/bg012-value-meals-menu/backdrop-large.json.gz')->assertNotFound();
        $this->get('/api/posters/themes/nope/preview-large.jpg')->assertNotFound();

        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);
        $this->get('/api/posters/themes/bg012-value-meals-menu/preview-large.jpg')->assertStatus(403);
    }

    public function test_a_themed_poster_keeps_its_words_and_photo_choices_by_slot(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true]);

        $created = $this->postJson('/api/posters', [
            'name' => 'Meal deals',
            'template_key' => 'anything',
            'layout' => 'anything',
            'theme' => 'bg012-value-meals-menu',
            'sizes' => ['A4', 'A2'],
            'slots' => [
                't2' => 'TIKKA DEALS',
                // A blanked line is false: an empty string arrives as null, which means the design's own words.
                't18' => false,
                't17' => '',
                'p1' => ['item_id' => $item->id, 'use' => 'cutout'],
                'p2' => ['photo_path' => 'posters/photos/abcdefabcdefabcdefabcdef.jpg'],
                'p3' => null,
            ],
            'bindings' => ['item_id' => $item->id],
        ])->assertCreated();

        $this->assertSame('bg012-value-meals-menu', $created->json('theme'));
        $this->assertSame(PosterPurposes::THEMED, $created->json('template_key'));
        $this->assertSame(PosterPurposes::THEMED, $created->json('layout'));
        $this->assertFalse($created->json('landscape'));

        $poster = Poster::query()->findOrFail($created->json('id'));
        $this->assertSame('TIKKA DEALS', $poster->slots['t2']);
        $this->assertFalse($poster->slots['t18']);
        $this->assertNull($poster->slots['t17']);
        $this->assertSame(['item_id' => $item->id, 'use' => 'cutout'], $poster->slots['p1']);
        $this->assertSame('posters/photos/abcdefabcdefabcdefabcdef.jpg', $poster->slots['p2']['photo_path']);
        $this->assertNull($poster->slots['p3']);

        $shown = $this->getJson('/api/posters/' . $poster->id)->assertOk();
        $this->assertSame('bg012-value-meals-menu', $shown->json('theme'));
        $this->assertSame('TIKKA DEALS', $shown->json('slots.t2'));
        $this->assertSame('bg012-value-meals-menu', $this->getJson('/api/posters')->json('posters.0.theme'));

        // Another design keeps the same slot ids, so the words carry over; the template cannot be dropped.
        $this->putJson('/api/posters/' . $poster->id, ['theme' => 'bg001-flash-sale-pastries'])->assertOk();
        $this->assertSame('bg001-flash-sale-pastries', $poster->fresh()->theme);
        $this->putJson('/api/posters/' . $poster->id, ['theme' => null])->assertStatus(422);
        $this->putJson('/api/posters/' . $poster->id, ['landscape' => true])->assertStatus(422);
        $this->putJson('/api/posters/' . $poster->id, ['template_key' => 'happy_hour', 'layout' => 'price_card'])->assertStatus(422);

        $copy = $this->postJson('/api/posters/' . $poster->id . '/duplicate')->assertCreated();
        $this->assertSame('bg001-flash-sale-pastries', $copy->json('theme'));
        $this->assertSame('TIKKA DEALS', Poster::query()->findOrFail($copy->json('id'))->slots['t2']);
    }

    public function test_a_bad_template_choice_is_refused(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $base = ['name' => 'X', 'template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED, 'sizes' => ['A4']];

        $this->postJson('/api/posters', $base + ['theme' => 'bg999-nope'])->assertStatus(422);
        $this->postJson('/api/posters', $base)->assertStatus(422)->assertJsonPath('message', 'Pick a template.');
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'landscape' => true])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'slots' => ['p1' => 'not a choice']])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'slots' => ['p1' => ['colour' => 'red']]])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'slots' => ['t2' => ['no' => 'arrays']]])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'slots' => ['Bad Key!' => 'x']])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'slots' => ['t2' => str_repeat('x', 601)]])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['theme' => 'bg012-value-meals-menu', 'slots' => ['t2' => 'fine', 'p1' => ['item_id' => 3, 'use' => 'main']]])->assertCreated();
        $this->assertSame(0, Poster::query()->where('theme', 'bg999-nope')->count());

        // A classic poster is untouched by any of this.
        $this->postJson('/api/posters', [
            'name' => 'Notice', 'template_key' => 'plain_notice', 'layout' => 'notice', 'sizes' => ['A4'],
            'slots' => ['headline' => 'Open', 'photo_path' => ''],
        ])->assertCreated()->assertJsonPath('theme', null);
    }

    public function test_a_saved_template_keeps_the_theme_and_its_slots(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $saved = $this->postJson('/api/posters/templates', [
            'name' => 'Our meal deals',
            'template_key' => 'anything',
            'layout' => 'anything',
            'theme' => 'bg012-value-meals-menu',
            'language' => 'en',
            'slots' => ['t2' => 'TIKKA DEALS', 'p1' => ['item_id' => 4, 'use' => 'main']],
        ])->assertCreated();
        $this->assertSame('bg012-value-meals-menu', $saved->json('theme'));
        $this->assertSame(PosterPurposes::THEMED, $saved->json('template_key'));

        $row = PosterTemplate::query()->findOrFail($saved->json('id'));
        $this->assertSame('bg012-value-meals-menu', $row->theme);
        $this->assertSame(['item_id' => 4, 'use' => 'main'], $row->slots['p1']);

        $list = $this->getJson('/api/posters/templates')->assertOk();
        $this->assertSame('bg012-value-meals-menu', $list->json('0.theme'));

        // Restored into a new poster, the theme and the words come back as they were.
        $restored = $this->postJson('/api/posters', [
            'name' => $row->name,
            'template_key' => $row->template_key,
            'layout' => $row->layout,
            'theme' => $row->theme,
            'language' => $row->language,
            'sizes' => ['A5'],
            'slots' => $row->slots,
        ])->assertCreated();
        $this->assertSame('bg012-value-meals-menu', $restored->json('theme'));
        $this->assertSame('TIKKA DEALS', $restored->json('slots.t2'));

        $this->postJson('/api/posters/templates', ['name' => 'Bad', 'template_key' => 'x', 'layout' => 'x', 'theme' => 'bg999-nope'])->assertStatus(422);
        $this->postJson('/api/posters/templates', ['name' => 'Bad', 'template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED])->assertStatus(422);
    }
}
