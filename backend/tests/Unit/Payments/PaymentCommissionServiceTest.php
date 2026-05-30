<?php

declare(strict_types=1);

namespace Tests\Unit\Payments;

use App\Domains\Payments\Services\PaymentCommissionService;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentCommissionServiceTest extends TestCase
{
    use RefreshDatabase;

    private PaymentCommissionService $service;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(PaymentCommissionService::class);
        $this->owner = $this->makeOwner(['email' => 'owner@pc-unit.test']);
        $this->seedCommissionSettings(true, 250, 300);
    }

    private function seedCommissionSettings(bool $enabled, int $posBp, int $gatewayBp): void
    {
        SiteSetting::set('payment_commission_enabled', $enabled ? '1' : '0');
        SiteSetting::set('payment_commission_pos_card_rate_bp', (string) $posBp);
        SiteSetting::set('payment_commission_online_gateway_rate_bp', (string) $gatewayBp);
        SiteSetting::bust();
    }

    public function test_resolves_pos_card_channel(): void
    {
        $payment = new Payment(['method' => 'card', 'gateway' => null]);

        $this->assertSame(PaymentCommissionService::CHANNEL_POS_CARD, $this->service->resolveChannel($payment));
    }

    public function test_resolves_online_gateway_when_bml_gateway_set(): void
    {
        $payment = new Payment(['method' => 'card', 'gateway' => 'bml']);

        $this->assertSame(PaymentCommissionService::CHANNEL_ONLINE_GATEWAY, $this->service->resolveChannel($payment));
    }

    public function test_cash_is_not_commissionable(): void
    {
        $payment = new Payment(['method' => 'cash']);

        $this->assertNull($this->service->resolveChannel($payment));
        $this->assertFalse($this->service->isCommissionable($payment));
    }

    public function test_calculate_commission_uses_floor(): void
    {
        $this->assertSame(249, $this->service->calculateCommissionLaar(9999, 250));
        $this->assertSame(250, $this->service->calculateCommissionLaar(10000, 250));
    }

    public function test_apply_to_payment_snapshots_different_channel_rates(): void
    {
        $posPayment = Payment::create([
            'order_id' => $this->makePaidOrder($this->owner)->id,
            'method' => 'card',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'paid',
            'processed_at' => now(),
            'collected_by_user_id' => $this->owner->id,
        ]);

        $gatewayPayment = Payment::create([
            'order_id' => $this->makePaidOrder($this->owner)->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'confirmed',
            'processed_at' => now(),
            'collected_by_user_id' => $this->owner->id,
        ]);

        $this->service->applyToPayment($posPayment);
        $this->service->applyToPayment($gatewayPayment);

        $posPayment->refresh();
        $gatewayPayment->refresh();

        $this->assertSame(PaymentCommissionService::CHANNEL_POS_CARD, $posPayment->commission_channel);
        $this->assertSame(250, $posPayment->commission_rate_bp);
        $this->assertSame(250, $posPayment->commission_laar);

        $this->assertSame(PaymentCommissionService::CHANNEL_ONLINE_GATEWAY, $gatewayPayment->commission_channel);
        $this->assertSame(300, $gatewayPayment->commission_rate_bp);
        $this->assertSame(300, $gatewayPayment->commission_laar);

        $this->assertNotNull(Expense::where('payment_id', $posPayment->id)->first());
        $this->assertNotNull(Expense::where('payment_id', $gatewayPayment->id)->first());
    }

    public function test_apply_is_idempotent(): void
    {
        $payment = Payment::create([
            'order_id' => $this->makePaidOrder()->id,
            'method' => 'card',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        $this->service->applyToPayment($payment);
        $payment->refresh();

        $this->seedCommissionSettings(true, 500, 500);
        $this->service->applyToPayment($payment->fresh());
        $payment->refresh();

        $this->assertSame(250, $payment->commission_rate_bp);
        $this->assertSame(250, $payment->commission_laar);
    }

    public function test_disabled_master_toggle_skips_commission(): void
    {
        $this->seedCommissionSettings(false, 250, 250);

        $payment = Payment::create([
            'order_id' => $this->makePaidOrder()->id,
            'method' => 'card',
            'amount' => 100,
            'amount_laar' => 10000,
            'status' => 'paid',
            'processed_at' => now(),
        ]);

        $this->service->applyToPayment($payment);
        $payment->refresh();

        $this->assertNull($payment->commission_channel);
        $this->assertSame(0, $payment->commission_laar);
    }
}
