<?php

declare(strict_types=1);

namespace Tests\Feature\Payments;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Device;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-03: "for a QR payment he selected card, can the admin
 * correct it?" The method changes in place, the amount does not, the old
 * method is kept, and the drawer follows when cash is involved.
 */
class CorrectTenderTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Shift $shift;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->cashier = $this->makeStaff('staff', ['name' => 'Hassan']);
        $device = Device::create(['name' => 'Front till', 'identifier' => 'pos-ct-test', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $this->shift = Shift::create(['user_id' => $this->cashier->id, 'device_id' => $device->id, 'opened_at' => now()->subHour(), 'opening_cash' => 100]);
    }

    private function paidOrder(string $method = 'card', float $amount = 85): array
    {
        $order = Order::factory()->create(['status' => 'completed', 'payment_status' => 'paid', 'paid_at' => now(), 'total' => $amount]);
        $payment = Payment::create([
            'order_id' => $order->id, 'collected_by_user_id' => $this->cashier->id, 'shift_id' => $this->shift->id,
            'method' => $method, 'currency' => 'MVR', 'amount' => $amount, 'amount_laar' => (int) round($amount * 100),
            'status' => 'paid', 'processed_at' => now(),
        ]);

        return [$order, $payment];
    }

    public function test_the_owner_corrects_card_to_qr_and_it_is_kept_and_audited(): void
    {
        [$order, $payment] = $this->paidOrder('card');
        Sanctum::actingAs($this->makeOwner(['name' => 'Ahmed']), ['staff']);

        $res = $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", [
            'method' => 'qr', 'reason' => 'Customer paid by QR, cashier tapped card',
        ])->assertOk();
        $this->assertSame('Tender corrected: card → qr.', $res->json('message'));
        $this->assertSame('qr', $res->json('order.payments.0.method'));

        $payment->refresh();
        $this->assertSame('qr', $payment->method);
        $this->assertSame('card', $payment->original_method);
        $this->assertSame(85.0, (float) $payment->amount, 'the amount never changes');
        $this->assertNotNull($payment->tender_corrected_at);
        $this->assertSame('Customer paid by QR, cashier tapped card', $payment->tender_correction_reason);

        $log = AuditLog::where('action', 'payment.tender_corrected')->firstOrFail();
        $this->assertSame('card', $log->old_values['method']);
        $this->assertSame('qr', $log->new_values['method']);
        $this->assertSame($order->id, $log->meta['order_id']);

        // A second correction keeps the very first method as the original.
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'bank_transfer', 'reason' => 'Actually a transfer'])->assertOk();
        $this->assertSame('card', $payment->fresh()->original_method);
    }

    public function test_cash_corrections_move_the_open_drawer_and_annotate_a_closed_shift(): void
    {
        [$order, $payment] = $this->paidOrder('card', 50);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $before = (float) $this->getJson("/api/shifts/{$this->shift->id}/summary")->assertOk()->json('cash_drawer.expected_cash');
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'cash', 'reason' => 'Paid in cash'])->assertOk();
        $after = (float) $this->getJson("/api/shifts/{$this->shift->id}/summary")->assertOk()->json('cash_drawer.expected_cash');
        $this->assertSame($before + 50.0, $after, 'cash now expected in the drawer');

        $this->shift->update(['closed_at' => now(), 'closing_cash' => 150, 'expected_cash' => 150, 'variance' => 0]);
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'card', 'reason' => 'Sorry, it was card'])->assertOk();
        $this->assertStringContainsString("[Tender corrected after close: order #{$order->order_number} MVR 50.00 cash → card by", (string) $this->shift->fresh()->notes);
        $this->assertSame(150.0, (float) $this->shift->fresh()->expected_cash, 'a counted shift is not rewritten');
    }

    public function test_cashiers_and_managers_cannot_correct_without_the_permission_and_a_grant_opens_it(): void
    {
        [$order, $payment] = $this->paidOrder('card');

        // Owner, 2026-10-03: "add this to admin only" — not even the cashier's own open shift.
        Sanctum::actingAs($this->cashier, ['staff']);
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'qr', 'reason' => 'Wrong button'])->assertForbidden();

        $manager = $this->makeManager(['phone' => '+9607770009']);
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($manager, ['staff']);
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'qr', 'reason' => 'Wrong button'])->assertForbidden();

        // The owner grants it to the Manager role; the grant survives a deploy.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->makeOwner(['phone' => '+9607770008']), ['staff']);
        $this->putJson('/api/roles/manager/permissions', ['permissions' => ['payments.correct_tender' => true]])->assertOk();
        PermissionCatalogSync::sync();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($manager->fresh(), ['staff']);
        $manager->fresh()->unsetRelation('role');
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'qr', 'reason' => 'Wrong button'])->assertOk();
        $this->assertSame('qr', $payment->fresh()->method);
    }

    public function test_only_plain_tenders_on_settled_payments_can_be_corrected(): void
    {
        [$order, $payment] = $this->paidOrder('house_account');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/orders/{$order->id}/payments/{$payment->id}/correct-tender", ['method' => 'cash', 'reason' => 'Nope'])->assertStatus(422);

        [$order2, $payment2] = $this->paidOrder('card');
        $this->postJson("/api/orders/{$order2->id}/payments/{$payment2->id}/correct-tender", ['method' => 'card', 'reason' => 'Same'])->assertStatus(422);
        $this->postJson("/api/orders/{$order2->id}/payments/{$payment2->id}/correct-tender", ['method' => 'gift_card', 'reason' => 'Nope'])->assertStatus(422);
        $this->postJson("/api/orders/{$order2->id}/payments/{$payment2->id}/correct-tender", ['method' => 'qr'])->assertStatus(422);

        $payment2->update(['status' => 'refunded']);
        $this->postJson("/api/orders/{$order2->id}/payments/{$payment2->id}/correct-tender", ['method' => 'qr', 'reason' => 'Late'])->assertStatus(422);
    }
}
