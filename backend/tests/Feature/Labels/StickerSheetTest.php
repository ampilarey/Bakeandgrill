<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\StickerLayouts;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelPrint;
use App\Models\Media;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Label Hub, step 2: pack stickers (owner, 2026-10-04: "I want to print labels
 * like this", "add all options" for the label stock).
 */
class StickerSheetTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    private Item $patties;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-04 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        SiteSetting::set('business_website', 'bakeandgrill.mv');
        SiteSetting::set('business_address_line1', 'Kalaafaanu Hingun');
        SiteSetting::set('business_address_city', 'Malé');
        SiteSetting::set('business_landmark', 'Near H. Sahara');
        SiteSetting::set('site_tagline', 'Fresh Baked, Fire Grilled');
        \Illuminate\Support\Facades\Cache::flush();

        $this->bajiya = $this->makeItem(false, 0, [
            'name' => 'Bajiya', 'name_dv' => 'ބާޖިޔާ', 'label_enabled' => true, 'label_shelf_life_days' => 90,
            'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, spices, onion, garlic, chilli, lemon, curry leaves, smoked tuna',
            'label_ingredients_dv' => 'ފުށް، ލޮނު، ތެޔޮ، ހަވާދު، ފިޔާ، ލޮނުމެދު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް',
        ]);
        $this->patties = $this->makeItem(false, 0, [
            'name' => 'Patties', 'label_enabled' => true, 'label_ingredients_source' => 'manual',
            'label_ingredients' => 'Flour, salt, oil, onion, ginger, chilli, potato, black pepper, curry leaves, smoked tuna',
        ]);
        $this->attachLegacyArt();
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_a_sheet_link_is_signed_logged_and_prints_four_to_an_a4_page(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', [
            'items' => [['id' => $this->bajiya->id, 'copies' => 8]],
            'layout' => 'a4-4',
        ])->assertOk()
            ->assertJsonPath('summary.stickers', 8)
            ->assertJsonPath('summary.pages', 2)
            ->assertJsonPath('summary.design', 'full');

        $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
        $this->assertSame(8, substr_count($html, 'data-testid="sticker"'));
        $this->assertSame(2, substr_count($html, 'data-testid="labels-page"'));
        $this->assertStringContainsString('size: 210mm 297mm', $html);
        $this->assertStringContainsString('__ /__ /____', $html, 'dates blank for handwriting by default');
        $this->assertStringContainsString('Flour, salt, oil, spices', $html);
        $this->assertStringContainsString('KEEP FROZEN AT -18°C OR BELOW', $html);
        $this->assertStringContainsString('+960 912 0011', $html);

        $this->assertSame(1, LabelPrint::query()->count());
        $log = LabelPrint::query()->first();
        $this->assertSame('sticker_en', $log->kind);
        $this->assertSame(8, $log->copies);

        // The signature is the permission: no signature, or a changed query, is refused.
        $this->get('/labels/stickers?items=' . $this->bajiya->id . ':8')->assertForbidden();
        $this->get(str_replace('%3A8', '%3A80', $res->json('view_url')))->assertForbidden();
    }

    public function test_dates_fill_from_shelf_life_and_bad_dates_are_refused(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', [
            'items' => [['id' => $this->bajiya->id, 'copies' => 4], ['id' => $this->patties->id, 'copies' => 4]],
            'fill' => true,
            'batch' => 'B-1004',
            'qty' => 10,
        ])->assertOk();
        // Bajiya: 90 days from today; Patties has no shelf life, so its expiry stays blank.
        $this->assertSame('2027-01-02', $res->json('summary.products.0.exp'));
        $this->assertNull($res->json('summary.products.1.exp'));

        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertStringContainsString('04 / 10 / 2026', $html);
        $this->assertStringContainsString('02 / 01 / 2027', $html);
        $this->assertStringContainsString('BATCH NO: B-1004', $html);
        $this->assertStringContainsString('QTY: 10 PCS', $html);

        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 4]], 'fill' => true];
        $this->postJson('/api/labels/stickers/url', $one + ['mfg' => '2026-10-04', 'exp' => '2026-10-01'])->assertUnprocessable();
        $this->postJson('/api/labels/stickers/url', $one + ['mfg' => '2026-10-20'])->assertUnprocessable();
        $this->postJson('/api/labels/stickers/url', $one + ['mfg' => '2026-09-01', 'exp' => '2026-09-30'])
            ->assertUnprocessable()->assertJsonPath('message', 'The expiry date has already passed.');
    }

    public function test_every_label_stock_prints_its_count_per_page_and_its_page_size(): void
    {
        foreach (StickerLayouts::LAYOUTS as $key => $layout) {
            $body = ['items' => [['id' => $this->bajiya->id, 'copies' => $layout['cols'] * $layout['rows']]], 'layout' => $key];
            if ($key === 'single-custom') {
                $body += ['w' => 80, 'h' => 120];
            }
            $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();
            $html = (string) $this->get($res->json('view_url'))->assertOk()->getContent();
            $perPage = $layout['cols'] * $layout['rows'];
            $this->assertSame($perPage, substr_count($html, 'data-testid="sticker"'), $key);
            $this->assertSame(1, substr_count($html, 'data-testid="labels-page"'), $key);
            [$pw, $ph] = $key === 'single-custom' ? [80, 120] : $layout['page'];
            $this->assertStringContainsString('size: ' . rtrim(rtrim(number_format($pw, 3, '.', ''), '0'), '.') . 'mm ' . rtrim(rtrim(number_format($ph, 3, '.', ''), '0'), '.') . 'mm', $html, $key);

            $pdf = $this->get($res->json('pdf_url'))->assertOk();
            $this->assertStringStartsWith('%PDF', (string) $pdf->getContent(), $key);
            $this->assertSame(1, preg_match_all('#/Type\s*/Page[^s]#', (string) $pdf->getContent()), "{$key}: one page");
            $this->dump($key, $html, (string) $pdf->getContent());
        }

        // A custom 80 × 120 label scales the full design and centres it.
        $sheet = StickerLayouts::resolve('single-custom', 80, 120);
        $this->assertSame('full', $sheet['design']);
        $this->assertEqualsWithDelta(0.7619, $sheet['scale'], 0.001);
        $this->assertSame('mini', StickerLayouts::resolve('a4-12')['design']);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'single-custom', 'w' => 40, 'h' => 40])
            ->assertUnprocessable();
    }

    public function test_the_dhivehi_sheet_orders_thaana_for_the_pdf_and_not_for_the_browser(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 4]], 'lang' => 'dv'])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertStringContainsString('ހިމެނޭ ތަކެތި', $html, 'browser gets Thaana in stored order');
        $this->assertStringContainsString('direction:rtl', $html);
        $this->assertSame('sticker_dv', LabelPrint::query()->value('kind'));

        $pdf = $this->get($res->json('pdf_url'))->assertOk();
        $this->assertStringStartsWith('%PDF', (string) $pdf->getContent());
        $this->dump('dv-a4-4', $html, (string) $pdf->getContent());
        foreach (['a4-12', 'single-76x127'] as $layout) {
            $r = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'lang' => 'dv', 'layout' => $layout, 'fill' => true])->assertOk();
            $this->dump("dv-{$layout}", (string) $this->get($r->json('view_url'))->getContent(), (string) $this->get($r->json('pdf_url'))->getContent());
        }
    }

    public function test_without_hand_lettering_or_a_photo_the_name_is_typed_and_the_flame_stands_in(): void
    {
        $res = $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->patties->id, 'copies' => 1]]])->assertOk();
        $html = (string) $this->get($res->json('view_url'))->getContent();
        $this->assertMatchesRegularExpression('#f-dsi[^>]*>Patties</div>#', $html);
        $this->dump('typed-name', $html, (string) $this->get($res->json('pdf_url'))->getContent());
    }

    public function test_preview_links_are_not_logged_and_need_the_permission(): void
    {
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'preview' => true])->assertOk();
        $this->assertSame(0, LabelPrint::query()->count());

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->postJson('/api/labels/stickers/url', ['items' => [['id' => $this->bajiya->id, 'copies' => 1]]])->assertForbidden();
    }

    /** The original lettering and photo for Bajiya when the label project is on this machine. */
    private function attachLegacyArt(): void
    {
        $dir = getenv('LABEL_ASSETS') ?: '';
        if ($dir === '' || !is_file("{$dir}/bajiya_title.png")) {
            return;
        }
        Storage::fake('public');
        $ids = [];
        foreach (['title' => 'bajiya_title.png', 'photo' => 'bajiya_food.png'] as $slot => $file) {
            $path = "labels/{$file}";
            Storage::disk('public')->put($path, (string) file_get_contents("{$dir}/{$file}"));
            $ids[$slot] = Media::query()->create(['disk' => 'public', 'path' => $path, 'media_type' => 'image', 'mime_type' => 'image/png'])->id;
        }
        $this->bajiya->update(['label_title_media_id' => $ids['title'], 'label_photo_media_id' => $ids['photo']]);
    }

    private function dump(string $name, string $html, string $pdf): void
    {
        $dir = getenv('LABEL_SHEET_DUMP');
        if (!$dir) {
            return;
        }
        @mkdir($dir, 0777, true);
        file_put_contents("{$dir}/{$name}.html", $html);
        file_put_contents("{$dir}/{$name}.pdf", $pdf);
    }
}
