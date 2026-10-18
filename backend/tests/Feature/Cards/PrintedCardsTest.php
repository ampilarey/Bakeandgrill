<?php

declare(strict_types=1);

namespace Tests\Feature\Cards;

use App\Domains\Cards\CardSheet;
use App\Domains\Cards\CardSource;
use App\Domains\Cards\CardSpec;
use App\Domains\Payments\Services\GiftCardIssueService;
use App\Models\CardPrint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Printed cards for any card printer (owner, 2026-10-18: a Matica 210, "should not limit to a specific card brand"). */
class PrintedCardsTest extends TestCase
{
    use RefreshDatabase;

    private function batch(array $headers, int $quantity = 3): int
    {
        return (int) $this->postJson('/api/admin/discount-cards/batches', [
            'name' => 'Opening week', 'type' => 'percentage', 'discount_value' => 20, 'quantity' => $quantity,
            'expires_at' => now()->addMonths(3)->toDateString(),
        ], $headers)->assertCreated()->json('batch.id');
    }

    public function test_every_page_of_the_card_pdf_is_one_cr80_card(): void
    {
        $headers = $this->staffHeaders($this->makeOwner());
        $id = $this->batch($headers);

        $res = $this->postJson('/api/admin/cards/pdf', [
            'settings' => ['kind' => 'discount', 'size' => 'cr80'],
            'source' => ['type' => 'discount_batch', 'id' => $id],
            'output' => 'card',
            'sides' => 'both',
        ], $headers)->assertOk();

        $this->assertSame('application/pdf', $res->headers->get('Content-Type'));
        $pdf = (string) $res->getContent();
        // Three cards, front and back: six pages, each 85.6 × 53.98 mm (242.6 × 153.0 pt).
        $this->assertSame(6, preg_match_all('#/Type\s*/Page[^s]#', $pdf));
        $this->assertMatchesRegularExpression('#/MediaBox\s*\[\s*0(\.0+)?\s+0(\.0+)?\s+242\.6\d*\s+153\.0\d*\s*\]#', $pdf);

        $print = CardPrint::query()->sole();
        $this->assertSame(['discount_batch', $id, 3, 'card', 'both'], [$print->source, $print->source_id, $print->cards, $print->output, $print->sides]);
    }

    public function test_each_card_of_a_batch_carries_its_own_code_and_a_qr_into_the_order_app(): void
    {
        $id = $this->batch($this->staffHeaders($this->makeOwner()), 2);
        $run = app(CardSource::class)->resolve(['type' => 'discount_batch', 'id' => $id]);

        $codes = array_column($run['entries'], 'code');
        $this->assertCount(2, array_unique($codes));
        $this->assertSame('20% OFF', $run['entries'][0]['value']);
        $this->assertSame(rtrim((string) config('app.url'), '/') . '/order/?promo=' . $codes[1], $run['entries'][1]['qr']);
        $this->assertSame([1, 2], array_column($run['entries'], 'number'));

        // A misprint is printed again on its own: card 2 of 2.
        $again = app(CardSource::class)->resolve(['type' => 'discount_batch', 'id' => $id, 'start' => 2, 'count' => 1]);
        $this->assertSame([$codes[1]], array_column($again['entries'], 'code'));
    }

    public function test_a4_sheets_fit_ten_cr80_cards_and_mirror_the_backs(): void
    {
        $this->assertSame([2, 5], CardSheet::grid(85.6, 53.98));

        $spec = CardSpec::clean(['kind' => 'plain']);
        $run = app(CardSource::class)->resolve(['type' => 'none', 'copies' => 3]);
        $sheet = app(CardSheet::class)->build($spec, $run, 'a4', 'both', true);
        $this->assertCount(2, $sheet['pages']);
        // The first card's back sits in the right-hand column, behind its front.
        $this->assertGreaterThan($sheet['pages'][0]['cards'][0]['x'], $sheet['pages'][1]['cards'][0]['x']);
        $this->assertNotEmpty($sheet['pages'][0]['marks']);
    }

    public function test_discount_cards_need_their_own_permission_and_gift_codes_must_be_real(): void
    {
        $owner = $this->staffHeaders($this->makeOwner());
        $id = $this->batch($owner);
        $this->app['auth']->forgetGuards(); // the owner's sign-in would carry over
        $manager = $this->staffHeaders($this->makeManager());

        $this->postJson('/api/admin/cards/pdf', [
            'settings' => ['kind' => 'discount'], 'source' => ['type' => 'discount_batch', 'id' => $id], 'output' => 'card', 'sides' => 'front',
        ], $manager)->assertForbidden();
        $this->app['auth']->forgetGuards();

        $this->postJson('/api/admin/cards/pdf', [
            'settings' => ['kind' => 'gift'], 'source' => ['type' => 'gift_card', 'code' => 'NOT-A-CARD'], 'output' => 'card', 'sides' => 'front',
        ], $owner)->assertUnprocessable();

        $plain = app(GiftCardIssueService::class)->issue(['amount' => 250, 'issued_to_customer_id' => null, 'purchased_by_customer_id' => null, 'expires_at' => null, 'paid_by' => 'complimentary', 'reference' => null, 'user_id' => null])['plain'];
        $run = app(CardSource::class)->resolve(['type' => 'gift_card', 'code' => $plain]);
        $this->assertSame('MVR 250.00', $run['entries'][0]['value']);
        $this->assertStringContainsString('/order/?gift=', (string) $run['entries'][0]['qr']);
    }

    public function test_designs_are_saved_clean_and_the_preview_draws_front_and_back(): void
    {
        $headers = $this->staffHeaders($this->makeOwner());
        $design = $this->postJson('/api/admin/cards/designs', [
            'name' => 'Opening week',
            'settings' => ['kind' => 'discount', 'template' => 'nonsense', 'size' => 'custom', 'w' => 500, 'h' => 10, 'photo' => 'https://evil.example/x.png'],
        ], $headers)->assertCreated()->json('design.settings');
        $this->assertSame('classic', $design['template']);
        $this->assertSame([140.0, 30.0], [(float) $design['w'], (float) $design['h']]);
        $this->assertSame('', $design['photo']);

        $html = $this->postJson('/api/admin/cards/preview', ['settings' => ['kind' => 'loyalty']], $headers)->assertOk()->json('html');
        $this->assertSame(2, substr_count($html, 'class="page'));
        $this->assertStringContainsString('FREE', $html);
    }
}
