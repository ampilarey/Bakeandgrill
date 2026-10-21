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
        $this->assertCount(149, $catalog->json('themes.themes'));
        $this->assertSame('large', $catalog->json('themes.sizes.A3'));
        $this->assertSame('tv', $catalog->json('themes.sizes.TV4K'));
        $this->assertSame(['print' => 'Print', 'screen' => 'TV screens'], $catalog->json('themes.kinds'));
        $this->assertSame(['A5', 'A4', 'A3', 'A2'], $catalog->json('sizes'));
        $this->assertSame(['TV', 'TV4K', 'TVP'], array_column($catalog->json('screen_sizes'), 'key'));
        $this->assertSame([1920, 1080], $catalog->json('screen_sizes.0.px'));
        $this->assertSame('print', $catalog->json('themes.themes.0.kind'));
        $this->assertSame([420, 594], $catalog->json('themes.themes.0.aspect'));
        $tvRow = collect($catalog->json('themes.themes'))->firstWhere('key', 'tv007-donuts-buy1get1');
        $this->assertSame('screen', $tvRow['kind']);
        $this->assertSame([1920, 1080], $tvRow['aspect']);
        $this->assertStringEndsWith('/api/posters/themes/tv007-donuts-buy1get1/preview-tv.jpg', $tvRow['preview_url']);
        $this->assertStringEndsWith('/preview-tvp.jpg', $tvRow['preview_small_url']);
        $this->assertSame(3, collect($catalog->json('themes.categories'))->firstWhere('key', 'disc')['counts']['screen']);
        $this->assertSame('With item photo', $catalog->json('themes.styles.photo'));
        $this->assertStringEndsWith('/fonts/pdf/Anton-400.ttf', $catalog->json('themes.font_urls.anton'));
        $this->assertStringEndsWith('/fonts/pdf/Fraunces-900-Italic.ttf', $catalog->json('themes.font_urls.fri9'));
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
        // The backdrop split at its three photo markers: four layers, each a whole SVG, no marker left in.
        $whole = (string) file_get_contents((string) \App\Domains\Posters\PosterThemes::file('bg012-value-meals-menu', 'backdrop-large.svg'));
        $layers = [];
        for ($i = 0; $i < 4; $i++) {
            $layer = $this->get("/api/posters/themes/bg012-value-meals-menu/backdrop-large-{$i}.svg")
                ->assertOk()
                ->assertHeader('Content-Type', 'image/svg+xml');
            $layers[] = (string) $layer->getContent();
            $this->assertStringStartsWith('<svg', $layers[$i]);
            $this->assertStringEndsWith('</svg>', rtrim($layers[$i]));
            $this->assertStringNotContainsString('__photo_marker', $layers[$i]);
        }
        $this->assertSame(3, substr_count($whole, '__photo_marker'));
        $this->assertStringContainsString('<defs>', $layers[0]);
        $this->assertStringContainsString('<defs>', $layers[3], 'every layer keeps the head with its gradients');
        $this->assertGreaterThan(strlen($layers[3]), strlen($layers[0]), 'the first layer carries most of the art');
        $this->get('/api/posters/themes/bg012-value-meals-menu/backdrop-large-4.svg')->assertNotFound();
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

    public function test_the_preview_shows_the_edited_words_and_photo_at_a2_and_a5(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true]);
        $im = imagecreatetruecolor(1200, 900);
        imagefilledrectangle($im, 0, 0, 1199, 899, (int) imagecolorallocate($im, 180, 60, 20));
        $tmp = tempnam(sys_get_temp_dir(), 'bg-photo') . '.jpg';
        imagejpeg($im, $tmp, 90);
        imagedestroy($im);
        $upload = $this->post('/api/posters/photo', ['photo' => new \Illuminate\Http\UploadedFile($tmp, 'dish.jpg', 'image/jpeg', null, true)])->assertCreated();
        $photoPath = (string) $upload->json('photo_path');

        $draft = [
            'name' => 'Meal deals',
            'template_key' => PosterPurposes::THEMED,
            'layout' => PosterPurposes::THEMED,
            'theme' => 'bg012-value-meals-menu',
            'sizes' => ['A2'],
            'slots' => ['t2' => 'TIKKA DEALS', 'p1' => ['photo_path' => $photoPath]],
            'bindings' => ['item_id' => $item->id],
        ];
        foreach (['A2' => 'large', 'A5' => 'small'] as $size => $variant) {
            $draft['sizes'] = [$size];
            $preview = $this->postJson('/api/posters/preview', $draft)->assertOk();
            $this->assertSame($variant, $preview->json('sheet.theme.variant'), $size);
            $this->assertSame('bg012-value-meals-menu', $preview->json('sheet.theme.key'));
            $this->assertStringEndsWith("/backdrop-{$variant}.svg", $preview->json('sheet.theme.backdrop_url'));
            $this->assertSame(['p1', 'p2', 'p3'], $preview->json('sheet.theme.photo_order'));
            $this->assertCount(4, $preview->json('sheet.theme.layer_urls'));
            $this->assertStringEndsWith("/backdrop-{$variant}-3.svg", $preview->json('sheet.theme.layer_urls.3'));
            $pieces = collect($preview->json('sheet.pieces'));
            $t2 = $pieces->first(fn (array $p): bool => $p['type'] === 'text' && ($p['slot'] ?? '') === 't2');
            $this->assertSame('TIKKA DEALS', $t2['text'], $size);
            $this->assertArrayNotHasKey('cmyk', $t2);
            $this->assertSame('#FFF3DC', $t2['hex']);
            $p1 = $pieces->first(fn (array $p): bool => $p['type'] === 'photo' && ($p['slot'] ?? '') === 'p1');
            $this->assertSame('upload', $p1['source'], $size);
            $this->assertStringEndsWith('/api/posters/photo/' . basename($photoPath), $p1['src']);
            $this->assertArrayNotHasKey('path', $p1);
            $this->assertArrayNotHasKey('clip_ops', $p1);
            $this->assertStringStartsWith('M ', $p1['clip_d']);
            $p2 = $pieces->first(fn (array $p): bool => $p['type'] === 'photo' && ($p['slot'] ?? '') === 'p2');
            $this->assertSame('placeholder', $p2['source']);
            $this->assertStringEndsWith("/placeholder-{$variant}-p2.png", $p2['src']);
            $backdrop = $pieces->first(fn (array $p): bool => $p['type'] === 'backdrop');
            $this->assertArrayNotHasKey('items', $backdrop, 'the artwork stays on the server; the page draws the SVG');
            // The first price slot takes the dish's live price in the design's own format.
            $t6 = $pieces->first(fn (array $p): bool => $p['type'] === 'text' && ($p['slot'] ?? '') === 't6');
            $this->assertSame('85', $t6['text'], $size);
            $this->assertTrue($t6['auto']);
            $this->assertSame('85', $preview->json('content.price') === 'MVR 85.00' ? '85' : $t6['text']);
        }
        $this->get('/api/posters/photo/' . basename($photoPath))->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $this->get('/api/posters/photo/' . str_repeat('0', 24) . '.jpg')->assertNotFound();
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

    public function test_a_saved_template_keeps_its_sizes_and_what_it_was_bound_to(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true]);

        $saved = $this->postJson('/api/posters/templates', [
            'name' => 'Tikka on the wall',
            'template_key' => 'anything',
            'layout' => 'anything',
            'theme' => 'bg012-value-meals-menu',
            'sizes' => ['A2', 'A3'],
            'bindings' => ['item_id' => $item->id, 'promotion_id' => null],
            'slots' => ['t2' => 'TIKKA DEALS'],
        ])->assertCreated();
        $this->assertSame(['A2', 'A3'], $saved->json('sizes'));
        $this->assertSame($item->id, $saved->json('bindings.item_id'));
        $row = PosterTemplate::query()->findOrFail($saved->json('id'));
        $this->assertSame(['A2', 'A3'], $row->sizes);
        $this->assertSame($item->id, $row->bindings['item_id']);
        $this->assertSame(['A2', 'A3'], $this->getJson('/api/posters/templates')->json('0.sizes'));

        // A template's sizes are of its design's kind, and a TV template keeps its screens.
        $this->postJson('/api/posters/templates', ['name' => 'Bad', 'template_key' => 'x', 'layout' => 'x', 'theme' => 'bg012-value-meals-menu', 'sizes' => ['TV']])->assertStatus(422);
        $this->postJson('/api/posters/templates', ['name' => 'Bad', 'template_key' => 'x', 'layout' => 'x', 'theme' => 'bg012-value-meals-menu', 'sizes' => ['A9']])->assertStatus(422);
        $tv = $this->postJson('/api/posters/templates', ['name' => 'Donuts on the TV', 'template_key' => 'x', 'layout' => 'x', 'theme' => 'tv007-donuts-buy1get1', 'sizes' => ['TV', 'TVP']])->assertCreated();
        $this->assertSame(['TV', 'TVP'], $tv->json('sizes'));

        // A template with none saved (from before 2026-10-22) still lists and restores.
        $old = PosterTemplate::query()->create(['name' => 'Old', 'template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED, 'theme' => 'bg001-flash-sale-pastries', 'slots' => []]);
        $this->assertNull($old->fresh()->sizes);
        $this->getJson('/api/posters/templates')->assertOk();
    }

    public function test_a_locked_template_is_kept_as_it_is_until_it_is_unlocked(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/posters/templates', [
            'name' => 'House style', 'template_key' => 'x', 'layout' => 'x', 'theme' => 'bg012-value-meals-menu', 'slots' => ['t2' => 'OURS'],
        ])->assertCreated()->json('id');
        $this->putJson("/api/posters/templates/{$id}", ['locked' => true])->assertOk()->assertJsonPath('locked', true);

        $this->putJson("/api/posters/templates/{$id}", ['name' => 'Changed'])->assertStatus(422);
        $this->putJson("/api/posters/templates/{$id}", ['slots' => ['t2' => 'THEIRS']])->assertStatus(422);
        $this->deleteJson("/api/posters/templates/{$id}")->assertStatus(422);
        $this->assertSame('OURS', PosterTemplate::query()->findOrFail($id)->slots['t2']);

        // An unlock in the same change goes through, and so does everything after it.
        $this->putJson("/api/posters/templates/{$id}", ['locked' => false, 'name' => 'Changed'])->assertOk()->assertJsonPath('name', 'Changed');
        $this->deleteJson("/api/posters/templates/{$id}")->assertOk();
        $this->assertNull(PosterTemplate::query()->find($id));
    }

    public function test_deleting_a_poster_removes_the_photos_only_it_used(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $upload = function (): string {
            $im = imagecreatetruecolor(400, 300);
            $tmp = tempnam(sys_get_temp_dir(), 'bg-photo') . '.jpg';
            imagejpeg($im, $tmp, 80);
            imagedestroy($im);

            return (string) $this->post('/api/posters/photo', ['photo' => new \Illuminate\Http\UploadedFile($tmp, 'dish.jpg', 'image/jpeg', null, true)])->assertCreated()->json('photo_path');
        };
        $mine = $upload();
        $shared = $upload();
        $base = ['template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED, 'theme' => 'bg012-value-meals-menu', 'sizes' => ['A4']];
        $one = $this->postJson('/api/posters', $base + ['name' => 'One', 'slots' => ['p1' => ['photo_path' => $mine], 'p2' => ['photo_path' => $shared]]])->assertCreated()->json('id');
        $this->postJson('/api/posters', $base + ['name' => 'Two', 'slots' => ['p1' => ['photo_path' => $shared]]])->assertCreated();
        $this->assertFileExists(storage_path('app/' . $mine));
        $this->assertFileExists(storage_path('app/' . $shared));

        $this->deleteJson("/api/posters/{$one}")->assertOk();
        $this->assertFileDoesNotExist(storage_path('app/' . $mine), 'a template photo slot\'s upload goes with its only poster');
        $this->assertFileExists(storage_path('app/' . $shared), 'a photo another poster still uses stays');
        @unlink(storage_path('app/' . $shared));
    }

    public function test_a_tv_template_shows_on_screens_and_a_print_one_on_paper(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['name' => 'Chicken tikka', 'base_price' => 85, 'is_active' => true]);
        $base = ['template_key' => PosterPurposes::THEMED, 'layout' => PosterPurposes::THEMED];

        // A TV design starts on a Full HD screen when no size is given.
        $created = $this->postJson('/api/posters', $base + ['name' => 'Donuts', 'theme' => 'tv007-donuts-buy1get1', 'slots' => ['t2' => 'TWO FOR ONE']])->assertCreated();
        $this->assertSame(['TV'], $created->json('sizes'));
        $this->assertSame('tv007-donuts-buy1get1', $created->json('theme'));
        $id = (int) $created->json('id');

        // Its sizes are screens, in any mix; paper is refused, as a screen is for a print design or a classic layout.
        $this->putJson("/api/posters/{$id}", ['sizes' => ['TV', 'TV4K', 'TVP']])->assertOk();
        $this->assertSame(['TV', 'TV4K', 'TVP'], Poster::query()->findOrFail($id)->sizes);
        $this->putJson("/api/posters/{$id}", ['sizes' => ['A4']])->assertStatus(422)->assertJsonPath('message', 'A TV template shows on a screen: pick TV, 4K or portrait TV.');
        $this->putJson("/api/posters/{$id}", ['sizes' => ['TV', 'A2']])->assertStatus(422);
        $this->putJson("/api/posters/{$id}", ['sizes' => ['XL']])->assertStatus(422);
        $this->postJson('/api/posters', $base + ['name' => 'X', 'theme' => 'bg012-value-meals-menu', 'sizes' => ['TV']])->assertStatus(422)->assertJsonPath('message', 'A print template prints on paper: pick A2 to A5.');
        $this->postJson('/api/posters', ['name' => 'Notice', 'template_key' => 'plain_notice', 'layout' => 'notice', 'sizes' => ['TV']])->assertStatus(422)->assertJsonPath('message', 'Classic layouts print on paper. Pick a TV template for a screen.');
        // A change of design across kinds needs sizes of the new kind in the same change.
        $this->putJson("/api/posters/{$id}", ['theme' => 'bg012-value-meals-menu'])->assertStatus(422);
        $this->putJson("/api/posters/{$id}", ['theme' => 'bg012-value-meals-menu', 'sizes' => ['A3']])->assertOk();
        $this->putJson("/api/posters/{$id}", ['theme' => 'tv007-donuts-buy1get1', 'sizes' => ['TVP']])->assertOk();

        // The preview follows the screen: its page is the screen's pixels and its variant its orientation.
        $draft = $base + ['name' => 'Donuts', 'theme' => 'tv007-donuts-buy1get1', 'slots' => ['t2' => 'TWO FOR ONE'], 'bindings' => ['item_id' => $item->id]];
        foreach (['TV' => ['tv', [1920, 1080]], 'TV4K' => ['tv', [3840, 2160]], 'TVP' => ['tvp', [1080, 1920]]] as $size => [$variant, $px]) {
            $preview = $this->postJson('/api/posters/preview', $draft + ['sizes' => [$size]])->assertOk();
            $this->assertSame($variant, $preview->json('sheet.theme.variant'), $size);
            $this->assertSame('screen', $preview->json('sheet.theme.kind'), $size);
            $this->assertSame($px, $preview->json('sheet.theme.px'), $size);
            $this->assertSame((float) $px[0], (float) $preview->json('sheet.w'), $size);
            $this->assertSame((float) $px[1], (float) $preview->json('sheet.h'), $size);
            $this->assertStringEndsWith("/backdrop-{$variant}.svg", $preview->json('sheet.theme.backdrop_url'), $size);
            $this->assertStringEndsWith("/backdrop-{$variant}-1.svg", $preview->json('sheet.theme.layer_urls.1'), $size);
            $pieces = collect($preview->json('sheet.pieces'));
            $t2 = $pieces->first(fn (array $p): bool => $p['type'] === 'text' && ($p['slot'] ?? '') === 't2');
            $this->assertSame('TWO FOR ONE', $t2['text'], $size);
            $p1 = $pieces->first(fn (array $p): bool => $p['type'] === 'photo' && ($p['slot'] ?? '') === 'p1');
            $this->assertSame('placeholder', $p1['source'], $size . ': the dish has no photo, the design\'s stands in');
            $this->assertStringEndsWith("/placeholder-{$variant}-p1.png", $p1['src'], $size);
            $ids = collect($preview->json('preflight'))->pluck('id')->unique()->values()->all();
            $this->assertNotContains('ink', $ids, $size);
            $this->assertNotContains('contrast', $ids, $size);
            $this->assertNotContains('keepout', $ids, $size);
            $this->assertNotContains('white', $ids, $size);
            $this->assertSame('ok', collect($preview->json('preflight'))->firstWhere('id', 'safe')['level'], $size);
            $this->assertSame('ok', collect($preview->json('preflight'))->firstWhere('id', 'type')['level'], $size);
        }
        $this->get('/api/posters/themes/tv007-donuts-buy1get1/backdrop-tv-1.svg')->assertOk()->assertHeader('Content-Type', 'image/svg+xml');
        $this->get('/api/posters/themes/tv007-donuts-buy1get1/preview-tvp.jpg')->assertOk();
        $theme = $this->getJson('/api/posters/themes/tv007-donuts-buy1get1')->assertOk();
        $this->assertSame('screen', $theme->json('kind'));
        $this->assertSame(['tv', 'tvp'], array_keys($theme->json('variants')));
        $this->assertSame(24, (int) $theme->json('variants.tv.canvas.min_text_units'));
    }
}
