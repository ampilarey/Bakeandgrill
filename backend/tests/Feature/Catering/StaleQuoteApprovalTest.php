<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Domains\Catering\Services\CateringQuoteApprovalService;
use App\Models\CateringRequest;
use App\Models\GstSetting;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * A quote priced under one set of tax settings must not be charged under
 * another.
 *
 * The quote is priced when it is *sent*; the order is built when the customer
 * *approves*, days later, from live settings. Line prices are frozen on the
 * quote, so the drift is settings — the GST rate, tax-inclusive mode, whether
 * a fee is taxable. If they move, the customer pays the old figure against a
 * new total, and ConfirmCateringEventOnPaymentListener confirms on coverage of
 * the quoted amount rather than the order total: the event goes ahead with a
 * residual balance or an overpayment nobody chose. Refuse instead.
 */
class StaleQuoteApprovalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Approval initiates a real BML checkout. Fake the gateway so these
        // tests are about the guard, not the bank.
        \Illuminate\Support\Facades\Http::fake([
            '*' => \Illuminate\Support\Facades\Http::response([
                'id' => 'TXN-QUOTE-TEST',
                'url' => 'https://bml.test/pay/TXN-QUOTE-TEST',
                'qrCode' => null,
            ], 200),
        ]);
    }

    private function configureGst(int $rateBp): void
    {
        GstSetting::query()->updateOrCreate(['id' => 1], [
            'gst_registered' => true,
            'default_tax_rate_bp' => $rateBp,
            'tax_inclusive' => false,
            'currency' => 'MVR',
            'sector' => 'general',
            'accounting_basis' => 'hybrid',
            'seller_name' => 'Quote Test Seller',
        ]);
        app(\App\Domains\Gst\Services\GstSettingsService::class)->bust();
    }

    /** A quote for one MVR 100 item, with the payment amount already stamped. */
    private function quote(int $paymentLaar, bool $isDeposit = false): CateringRequest
    {
        $item = Item::factory()->create(['base_price' => 100, 'packaging_fee' => 0]);

        $request = CateringRequest::create([
            'reference' => 'EVT-STALE-1',
            'contact_name' => 'Test Customer',
            'phone' => '7778888',
            'event_date' => now()->addWeek()->toDateString(),
            'status' => 'awaiting_customer',
            'quote_token' => 'tok-' . uniqid(),
            'quote_sent_at' => now()->subDays(3),
            'quote_expires_at' => now()->addDays(4),
            'quote_payment_laar' => $paymentLaar,
            'quote_is_deposit' => $isDeposit,
            'quote_version' => 1,
        ]);

        $request->lines()->create([
            'item_id' => $item->id,
            'name' => $item->name,
            'quantity' => 1,
            'unit_price' => 100,
            'is_custom' => false,
        ]);

        return $request->fresh('lines');
    }

    public function test_a_quote_whose_tax_rate_moved_is_refused(): void
    {
        // THE test. Quoted at 8% (MVR 108), approved after the rate moved to
        // 16% (MVR 116). Charging 108 against a 116 order leaves MVR 8 owing
        // on a confirmed event.
        $this->configureGst(800);
        $quote = $this->quote(paymentLaar: 10800);

        $this->configureGst(1600);

        $this->expectException(ValidationException::class);

        try {
            app(CateringQuoteApprovalService::class)->approve($quote->quote_token);
        } finally {
            // Fail closed: no order, and the quote is still awaiting the
            // customer rather than half-converted.
            $this->assertNull($quote->fresh()->pos_order_id);
            $this->assertSame('awaiting_customer', $quote->fresh()->status);
        }
    }

    public function test_an_unchanged_quote_still_approves(): void
    {
        // The guard must not block the ordinary path — if this fails, catering
        // checkout is dead.
        $this->configureGst(800);
        $quote = $this->quote(paymentLaar: 10800);

        $result = app(CateringQuoteApprovalService::class)->approve($quote->quote_token);

        $this->assertSame(10800, (int) $result['order']->total_laar);
        $this->assertNotNull($result['payment_id']);
    }

    public function test_a_deposit_is_allowed_to_be_less_than_the_total(): void
    {
        // Taking part of a larger bill is the whole point of a deposit — only
        // a deposit exceeding the total is wrong.
        $this->configureGst(800);
        $quote = $this->quote(paymentLaar: 5000, isDeposit: true);

        $result = app(CateringQuoteApprovalService::class)->approve($quote->quote_token);

        $this->assertSame(10800, (int) $result['order']->total_laar);
    }

    public function test_a_deposit_larger_than_the_new_total_is_refused(): void
    {
        // Quoted a MVR 100 deposit against a MVR 108 event; the event is later
        // repriced smaller. Collecting more than the whole bill as a "deposit"
        // is an overpayment nobody asked for.
        $this->configureGst(800);
        $quote = $this->quote(paymentLaar: 10000, isDeposit: true);

        $quote->lines()->update(['unit_price' => 50]);

        $this->expectException(ValidationException::class);
        app(CateringQuoteApprovalService::class)->approve($quote->fresh('lines')->quote_token);
    }
}
