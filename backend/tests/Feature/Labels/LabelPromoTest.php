<?php

declare(strict_types=1);

namespace Tests\Feature\Labels;

use App\Domains\Labels\BatchLink;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\LabelJob;
use App\Models\LabelPrint;
use App\Models\SiteSetting;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Promotion stickers (2026-10-12): a was → now flash or a short line
 * ("2 FOR 1") on the full and the compact sticker.
 */
class LabelPromoTest extends TestCase
{
    use RefreshDatabase;

    private Item $bajiya;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        CarbonImmutable::setTestNow('2026-10-12 09:00:00');
        SiteSetting::set('business_phone', '+960 912 0011');
        Cache::flush();
        $this->bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'base_price' => 25, 'label_enabled' => true, 'label_shelf_life_days' => 90, 'label_show_price' => true]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    private function sheet(array $body): string
    {
        $res = $this->postJson('/api/labels/stickers/url', $body)->assertOk();

        return (string) $this->get($res->json('view_url'))->assertOk()->getContent();
    }

    public function test_a_was_now_flash_strikes_the_old_price_and_makes_the_new_one_the_price_on_the_sticker(): void
    {
        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 1]]];
        $plain = $this->sheet($one + ['layout' => 'a4-4']);
        $this->assertSame(1, substr_count($plain, 'MVR 25.00'), 'the menu price on the quantity line');

        $html = $this->sheet($one + ['layout' => 'a4-4', 'promo' => 'was_now', 'promo_was' => 25, 'promo_now' => 20]);
        $this->assertSame(1, substr_count($html, '>MVR 25.00<'), 'the old price, once, in the flash');
        $this->assertSame(2, substr_count($html, '>MVR 20.00<'), 'the new price in the flash and on the quantity line');
        $this->assertStringContainsString('>NOW<', $html);
        $this->assertStringContainsString('background:#B74B0C;border-radius:2.5mm', $html, 'the rust badge');

        // Without an old price the flash says NOW and the price alone.
        $html = $this->sheet($one + ['layout' => 'a4-4', 'promo' => 'was_now', 'promo_now' => 20]);
        $this->assertStringNotContainsString('>MVR 25.00<', $html);
        $this->assertSame(2, substr_count($html, '>MVR 20.00<'));
    }

    public function test_a_text_flash_prints_its_words_on_the_full_and_compact_stickers_only(): void
    {
        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'promo' => 'text', 'promo_text' => '2 for 1'];
        $this->assertStringContainsString('>2 FOR 1<', $this->sheet($one + ['layout' => 'a4-4']));
        $compact = $this->sheet($one + ['layout' => 'a4-8']);
        $this->assertStringContainsString('>2 FOR 1<', $compact);
        parse_str((string) parse_url((string) $this->postJson('/api/labels/stickers/url', $one + ['layout' => 'a4-8'])->json('view_url'), PHP_URL_QUERY), $q);
        $this->assertStringNotContainsString(BatchLink::qr(explode(':', $q['b'])[1]), $compact, 'the flash takes the batch QR\'s place in the compact band');
        $this->assertStringNotContainsString('2 FOR 1', $this->sheet($one + ['layout' => 'single-custom', 'w' => 40, 'h' => 60]), 'no room on a small label');
        // Two lines of words fit the badge too.
        $html = $this->sheet(array_merge($one, ['layout' => 'a4-4', 'promo_text' => 'Buy 2 get 1 free']));
        $this->assertMatchesRegularExpression('#>BUY 2 GET( 1)?</div>#', $html, 'the first line');
        $this->assertMatchesRegularExpression('#>(1 )?FREE</div>#', $html, 'the second');
    }

    public function test_a_flash_is_checked_and_kept_by_the_saved_label_and_the_log(): void
    {
        $one = ['items' => [['id' => $this->bajiya->id, 'copies' => 1]], 'layout' => 'a4-4'];
        $this->postJson('/api/labels/stickers/url', $one + ['promo' => 'was_now'])->assertStatus(422)->assertJsonPath('message', 'Type the new price for the Was → Now flash.');
        $this->postJson('/api/labels/stickers/url', $one + ['promo' => 'was_now', 'promo_was' => 20, 'promo_now' => 25])->assertStatus(422)->assertJsonPath('message', 'The old price must be higher than the new one.');
        $this->postJson('/api/labels/stickers/url', $one + ['promo' => 'text'])->assertStatus(422)->assertJsonPath('message', 'Type the words for the promotion flash.');
        $this->postJson('/api/labels/stickers/url', $one + ['promo' => 'bogus'])->assertUnprocessable();

        $this->postJson('/api/labels/stickers/url', $one + ['promo' => 'text', 'promo_text' => 'Special offer'])->assertOk();
        $job = LabelJob::query()->latest('id')->firstOrFail();
        $this->assertSame('text', $job->request['promo']);
        $this->assertSame('Special offer', $job->request['promo_text']);
        $this->assertSame(['promo' => 'Special offer'], LabelPrint::query()->latest('id')->value('details'));
        $this->assertStringContainsString('>SPECIAL OFFER<', (string) $this->get($this->postJson("/api/labels/jobs/{$job->id}/print")->assertOk()->json('view_url'))->getContent());
    }
}
