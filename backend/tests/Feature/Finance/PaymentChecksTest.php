<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Order;
use App\Models\Payment;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\BusinessDay;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-28: a QR customer types the bill amount themselves and the
 * cashier keys the card machine by hand, so each QR and card payment is ticked
 * against MPOS or the slip in Admin. The cashier cannot see MPOS.
 */
class PaymentChecksTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        Sanctum::actingAs($this->owner, ['staff']);
        SiteSetting::set('payment_check_start_date', $this->day(10));
    }

    private function day(int $daysAgo): string
    {
        return Carbon::parse(BusinessDay::todayYmd())->subDays($daysAgo)->toDateString();
    }

    private function payment(string $method, float $amount, int $daysAgo = 0, array $order = [], string $status = 'paid'): Payment
    {
        $o = Order::factory()->paid()->create(['total' => $amount] + $order);
        [$start] = BusinessDay::bounds($this->day($daysAgo));

        return Payment::create([
            'order_id' => $o->id, 'method' => $method, 'amount' => $amount, 'amount_laar' => (int) round($amount * 100),
            'status' => $status, 'processed_at' => $start->copy()->addHours(12), 'idempotency_key' => 'check-' . uniqid(),
        ]);
    }

    private function list(array $q = []): \Illuminate\Testing\TestResponse
    {
        return $this->getJson('/api/settlements/payment-checks?' . http_build_query($q + ['from' => $this->day(5), 'to' => $this->day(0)]));
    }

    public function test_lists_only_paid_qr_and_card_payments_not_yet_checked(): void
    {
        $qr = $this->payment('qr', 155);
        $card = $this->payment('card_pos', 40);
        $this->payment('cash', 25);
        $this->payment('bank_transfer', 60);
        $this->payment('qr', 99, 0, [], 'failed');
        $this->payment('qr', 70, 20); // before the start date

        $res = $this->list()->assertOk();
        $this->assertEqualsCanonicalizing([$qr->id, $card->id], array_column($res->json('payments'), 'id'));
        $res->assertJsonPath('summary.unchecked.count', 2)
            ->assertJsonPath('summary.unchecked.laar', 19500)
            ->assertJsonPath('summary.qr.laar', 15500)
            ->assertJsonPath('summary.card.laar', 4000);
    }

    public function test_matches_and_different_record_what_was_seen_without_changing_the_payment(): void
    {
        $a = $this->payment('qr', 155);
        $b = $this->payment('card', 40);

        $this->postJson("/api/settlements/payment-checks/{$a->id}", ['result' => 'matched'])->assertOk()
            ->assertJsonPath('payment.check.status', 'matched')->assertJsonPath('payment.check.diff_laar', 0);
        $this->postJson("/api/settlements/payment-checks/{$b->id}", ['result' => 'different', 'seen' => 4, 'reference' => '1234', 'note' => 'Keyed 4 not 40'])->assertOk()
            ->assertJsonPath('payment.check.diff_laar', -3600)->assertJsonPath('payment.check.by', $this->owner->name);

        $this->assertSame(4000, $b->fresh()->amount_laar);
        $this->list()->assertJsonPath('summary.unchecked.count', 0)->assertJsonCount(0, 'payments');
        $this->list(['state' => 'different'])->assertJsonPath('payments.0.id', $b->id)
            ->assertJsonPath('payments.0.check.reference', '1234')
            ->assertJsonPath('summary.different.diff_laar', -3600)
            ->assertJsonPath('summary.matched.count', 1);
        $this->list(['q' => '1234', 'state' => 'all'])->assertJsonCount(1, 'payments');
    }

    public function test_different_needs_an_amount_that_differs(): void
    {
        $p = $this->payment('qr', 50);
        $this->postJson("/api/settlements/payment-checks/{$p->id}", ['result' => 'different'])->assertStatus(422);
        $this->postJson("/api/settlements/payment-checks/{$p->id}", ['result' => 'different', 'seen' => 50])->assertStatus(422);
        $cash = $this->payment('cash', 50);
        $this->postJson("/api/settlements/payment-checks/{$cash->id}", ['result' => 'matched'])->assertStatus(422);
    }

    public function test_undo_and_bulk_matches(): void
    {
        $a = $this->payment('qr', 10);
        $b = $this->payment('qr', 20);
        $c = $this->payment('cash', 30);
        $this->postJson('/api/settlements/payment-checks/bulk', ['ids' => [$a->id, $b->id, $c->id]])->assertOk()->assertJsonPath('marked', 2);
        $this->deleteJson("/api/settlements/payment-checks/{$a->id}")->assertOk()->assertJsonPath('payment.check', null);
        $this->list()->assertJsonPath('payments.0.id', $a->id)->assertJsonCount(1, 'payments');
    }

    public function test_filters_by_method_cashier_station_and_amount(): void
    {
        $ali = $this->makeStaff('cashier', ['name' => 'Ali']);
        $device = \App\Models\Device::factory()->create(['name' => 'Till 2']);
        $mine = $this->payment('card', 120, 1, ['user_id' => $ali->id, 'device_id' => $device->id]);
        $this->payment('qr', 15, 1);

        $this->list(['method' => 'card'])->assertJsonCount(1, 'payments')->assertJsonPath('payments.0.cashier', 'Ali')->assertJsonPath('payments.0.station', 'Till 2');
        $this->list(['user_id' => $ali->id])->assertJsonPath('payments.0.id', $mine->id)->assertJsonCount(1, 'payments');
        $this->list(['device_id' => $device->id])->assertJsonCount(1, 'payments');
        $this->list(['min' => 100])->assertJsonCount(1, 'payments');
        $this->list(['max' => 20, 'sort' => 'amount_asc'])->assertJsonCount(1, 'payments');
        $res = $this->list();
        $this->assertContains('Ali', array_column($res->json('choices.staff'), 'name'));
        $this->assertContains('Till 2', array_column($res->json('choices.stations'), 'name'));
    }

    public function test_needs_attention_counts_unchecked_payments_from_before_today(): void
    {
        $this->payment('qr', 10, 0);
        $this->payment('card', 10, 1);
        $rows = collect($this->getJson('/api/admin/inbox')->assertOk()->json('rows'))->keyBy('key');
        $this->assertSame(1, $rows['payment_checks']['count']);
        $this->assertSame('/finance/settlements?view=checks', $rows['payment_checks']['link']);
    }

    public function test_needs_the_settlements_permission(): void
    {
        Sanctum::actingAs($this->makeStaff('cashier'), ['staff']);
        $this->list()->assertForbidden();
    }
}
