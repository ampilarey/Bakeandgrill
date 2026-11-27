<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\LabelTheme;
use App\Domains\Labels\StickerDesign;
use App\Models\CustomLabel;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-27: "add more nice themes to each template and custom labels also". A label keeps a theme, and
 * every design is drawn in it: the rust gives way to the theme's colour, the paper and the codes stay as they are.
 */
class LabelThemeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => 'Owner']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['staff']);
    }

    /** @return array<string, mixed> */
    private function at(float $w, float $h, string $layout = 'single-custom'): array
    {
        return ['layout' => $layout, 'w' => $w, 'h' => $h, 'lang' => 'en', 'fill' => true];
    }

    public function test_the_themes_are_offered_and_each_has_every_colour(): void
    {
        $themes = collect($this->getJson('/api/labels/layouts')->assertOk()->json('themes'))->keyBy('key');
        $this->assertSame('Rust', $themes['rust']['name']);
        $this->assertGreaterThanOrEqual(10, $themes->count());
        foreach (LabelTheme::THEMES as $key => $t) {
            foreach (['accent', 'tint', 'dark', 'border', 'muted', 'on_dark', 'soft', 'on_accent', 'on_accent_soft'] as $c) {
                $this->assertMatchesRegularExpression('/^#[0-9A-F]{6}$/', $t[$c], "$key $c");
            }
        }
    }

    public function test_a_custom_label_keeps_its_theme_and_every_design_prints_in_it(): void
    {
        $id = $this->postJson('/api/labels/custom', ['name' => 'Garlic Sauce', 'label_ingredients' => 'Garlic, oil, salt.', 'label_storage' => 'chilled', 'label_theme' => 'forest'])->assertCreated()->json('data.id');
        $this->assertSame('forest', CustomLabel::findOrFail($id)->label_theme);
        $this->assertSame('forest', $this->getJson('/api/labels/custom')->assertOk()->json('data.0.label_theme'));

        $forest = LabelTheme::THEMES['forest']['accent'];
        foreach ([[105, 148.5, 'single-105x148'], [99, 70.5, 'single-custom'], [60, 40, 'single-custom'], [180, 40, 'single-custom']] as [$w, $h, $layout]) {
            $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]]] + $this->at($w, $h, $layout))->assertOk();
            $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
            $drawn = substr($html, (int) strpos($html, 'class="sticker'));
            $this->assertStringContainsStringIgnoringCase($forest, $drawn, "{$w} × {$h}");
            $this->assertStringNotContainsStringIgnoringCase(StickerDesign::PRIMARY, $drawn, "{$w} × {$h} still has the rust");
            $this->assertStringStartsWith('%PDF', (string) $this->get($res->json('pdf_url'))->assertOk()->getContent());
        }
        // A round one too.
        $round = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'layout' => 'single-round-custom', 'w' => 60, 'lang' => 'en', 'fill' => true])->assertOk();
        $this->assertStringContainsStringIgnoringCase($forest, (string) $this->get($round->json('view_url'))->getContent());

        // The usual rust is kept as no theme at all, and an unknown one is refused.
        $this->putJson("/api/labels/custom/{$id}", ['label_theme' => 'rust'])->assertOk();
        $this->assertNull(CustomLabel::findOrFail($id)->label_theme);
        $this->putJson("/api/labels/custom/{$id}", ['label_theme' => 'neon'])->assertStatus(422);
    }

    public function test_the_editors_draft_and_a_template_carry_the_theme(): void
    {
        $draft = $this->postJson('/api/labels/custom/preview', ['name' => 'Sauce', 'label_theme' => 'ocean'] + $this->at(99, 70.5))->assertOk();
        $this->assertStringContainsStringIgnoringCase(LabelTheme::THEMES['ocean']['accent'], (string) $this->get($draft->json('one_url'))->assertOk()->getContent());

        $t = $this->postJson('/api/labels/templates', ['name' => 'Blue sauces', 'fields' => ['label_storage' => 'chilled', 'label_theme' => 'ocean']])->assertCreated();
        $this->assertSame('ocean', $t->json('data.fields.label_theme'));
    }

    /** The jar template in every theme: drawn, and written out for a look when LABEL_DUMP names a folder. */
    public function test_the_jar_template_prints_in_every_theme(): void
    {
        $t = collect($this->getJson('/api/labels/templates')->assertOk()->json('builtin'))->keyBy('id')['rihaakuru-jar'];
        $dir = getenv('LABEL_DUMP') ?: '';
        foreach (array_keys(LabelTheme::THEMES) as $theme) {
            $id = $this->postJson('/api/labels/custom', ['name' => "Rihaakuru {$theme}", 'name_dv' => $t['product_dv'], 'label_photo_media_id' => $t['photo']['id'], 'label_barcode' => '200000012345', 'label_theme' => $theme] + $t['fields'])->assertCreated()->json('data.id');
            $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]], 'lang' => 'both'] + $this->at(240, 60))->assertOk();
            $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
            $this->assertStringContainsStringIgnoringCase(LabelTheme::THEMES[$theme]['accent'], $html, $theme);
            if ($dir !== '' && is_dir($dir)) {
                file_put_contents("{$dir}/theme-{$theme}.html", $html);
            }
        }
    }

    public function test_black_and_white_prints_nothing_but_black(): void
    {
        $id = $this->postJson('/api/labels/custom', ['name' => 'Sauce', 'label_ingredients' => 'Garlic.', 'label_theme' => 'mono'])->assertCreated()->json('data.id');
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $id, 'kind' => 'custom', 'copies' => 1]]] + $this->at(99, 70.5))->assertOk();
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $drawn = substr($html, (int) strpos($html, 'class="sticker'));
        preg_match_all('/(?:color|background(?:-color)?):\s*(#[0-9A-Fa-f]{6})/', $drawn, $m);
        $this->assertNotEmpty($m[1]);
        foreach (array_unique(array_map('strtoupper', $m[1])) as $c) {
            $this->assertContains($c, ['#000000', '#FFFFFF', StickerDesign::CREAM, StickerDesign::TEXT], $c);
        }
    }
}
