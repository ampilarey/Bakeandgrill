<?php

declare(strict_types=1);

namespace Tests\Feature\Telegram;

use App\Domains\Notifications\Contracts\SmsProviderInterface;
use App\Domains\Notifications\Support\NotificationChannels;
use App\Domains\Orders\Support\DiscountSettings;
use App\Models\Category;
use App\Models\Device;
use App\Models\DiscountApproval;
use App\Models\Item;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Mockery;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

/**
 * Discount approval by button (owner, 2026-10-07). The approver taps
 * Approve on Telegram; the till, which checks while its code screen is
 * open, confirms with no code. The code still works as before.
 */
class TelegramDiscountApprovalTest extends TestCase
{
    use FakesTelegram;
    use PreparesPosApi;
    use RefreshDatabase;

    private User $cashier;

    private User $manager;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        $this->roles();
        $this->fakeTelegram();
        $provider = Mockery::mock(SmsProviderInterface::class);
        $provider->shouldReceive('send')->andReturn([true, ['ok' => true], null]);
        $this->app->instance(SmsProviderInterface::class, $provider);

        $this->manager = $this->staff('manager', '+9607654321', 'Hassan');
        $this->cashier = $this->staff('staff', '+9607001001', 'Mariyam');
        $this->cashier->forceFill(['pin_hash' => Hash::make('1234')])->save();
        $this->cashier->grantPermission('promotions.discounts');
        $this->cashier->unsetRelation('permissions');

        $this->device = Device::create(['name' => 'Till', 'identifier' => 'TG-DISC-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-tg', 'is_active' => true]);
        $this->item = Item::create(['category_id' => $category->id, 'name' => 'Burger', 'base_price' => 100.00, 'sku' => 'TG-B001', 'is_active' => true, 'is_available' => true]);

        $this->preparePosApi($this->cashier, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);

        SiteSetting::set(DiscountSettings::APPROVAL_REQUIRED, 'true');
        SiteSetting::set(DiscountSettings::APPROVERS, json_encode([
            ['user_id' => $this->manager->id, 'phone' => '7654321', 'label' => 'Hassan'],
        ]));
        SiteSetting::bust();
    }

    private function order(): Order
    {
        $id = (int) $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated()->json('order.id');

        return Order::findOrFail($id);
    }

    private function ask(Order $order): int
    {
        $id = (int) $this->postJson("/api/orders/{$order->id}/discount/request-approval", ['discount_amount' => 10])->assertOk()->json('approval_id');
        DeferAfterResponse::flushTestingCallbacks();

        return $id;
    }

    public function test_approve_on_telegram_and_the_till_applies_it_without_a_code(): void
    {
        $bot = $this->bot();
        $this->link($bot, $this->manager, '5550002');
        $order = $this->order();
        $approvalId = $this->ask($order);

        $card = collect($this->sent('5550002'))->last();
        $this->assertStringContainsString('Discount MVR 10.00', $card['text']);
        $this->assertStringContainsString('Asked by Mariyam', $card['text']);
        $this->assertSame(['da:' . $approvalId, 'dd:' . $approvalId], array_column($card['reply_markup']['inline_keyboard'][0], 'callback_data'));

        $this->getJson("/api/orders/{$order->id}/discount/approval/{$approvalId}")->assertOk()->assertJsonPath('status', 'pending');

        $this->telegramButton($bot, '5550002', 'da:' . $approvalId)->assertOk();
        $this->getJson("/api/orders/{$order->id}/discount/approval/{$approvalId}")->assertOk()
            ->assertJsonPath('status', 'granted')
            ->assertJsonPath('decided_by_name', 'Hassan');

        // The till confirms with no code.
        $this->postJson("/api/orders/{$order->id}/discount/confirm", ['approval_id' => $approvalId, 'discount_amount' => 10])->assertOk();
        $this->assertSame(1000, (int) $order->fresh()->manual_discount_laar);
        $this->assertSame($this->manager->id, (int) $order->fresh()->manual_discount_approved_by);
        $row = DiscountApproval::findOrFail($approvalId);
        $this->assertSame('approved', $row->status);
        $this->assertSame($this->manager->id, (int) $row->decided_by);
    }

    public function test_decline_stops_the_till_and_a_code_cannot_be_used_after(): void
    {
        $bot = $this->bot();
        $this->link($bot, $this->manager, '5550002');
        $order = $this->order();
        $approvalId = $this->ask($order);

        $this->telegramButton($bot, '5550002', 'dd:' . $approvalId)->assertOk();
        $this->getJson("/api/orders/{$order->id}/discount/approval/{$approvalId}")->assertJsonPath('status', 'declined');
        $this->postJson("/api/orders/{$order->id}/discount/confirm", ['approval_id' => $approvalId])
            ->assertStatus(422)->assertJsonPath('message', 'The approver declined this discount.');
        $this->assertSame(0, (int) $order->fresh()->manual_discount_laar);
    }

    public function test_without_approval_the_till_still_needs_the_code(): void
    {
        $order = $this->order();
        $approvalId = $this->ask($order);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", ['approval_id' => $approvalId])
            ->assertStatus(422)->assertJsonPath('message', 'Enter the approval code, or wait for the approver to tap Approve.');
    }

    public function test_only_an_approver_it_went_to_can_approve(): void
    {
        $bot = $this->bot();
        $owner = $this->staff('owner', '+9607820288', 'Ahmed');
        $this->link($bot, $owner, '5550001');
        $order = $this->order();
        $approvalId = $this->ask($order);

        $this->telegramButton($bot, '5550001', 'da:' . $approvalId)->assertOk();
        $this->assertSame('pending', DiscountApproval::findOrFail($approvalId)->status);
    }

    public function test_an_approver_added_as_a_typed_number_gets_the_buttons(): void
    {
        SiteSetting::set(DiscountSettings::APPROVERS, json_encode([
            ['user_id' => null, 'phone' => '765 4321', 'label' => 'Manager phone'],
        ]));
        SiteSetting::bust();
        $bot = $this->bot();
        $this->link($bot, $this->manager, '5550002');
        $order = $this->order();
        $approvalId = $this->ask($order);

        $card = collect($this->sent('5550002'))->last();
        $this->assertSame(['da:' . $approvalId, 'dd:' . $approvalId], array_column($card['reply_markup']['inline_keyboard'][0] ?? [], 'callback_data'));

        $this->telegramButton($bot, '5550002', 'da:' . $approvalId)->assertOk();
        $this->postJson("/api/orders/{$order->id}/discount/confirm", ['approval_id' => $approvalId, 'discount_amount' => 10])->assertOk();
        $this->assertSame($this->manager->id, (int) $order->fresh()->manual_discount_approved_by);
    }

    public function test_an_approver_on_telegram_only_still_counts_as_sent(): void
    {
        NotificationChannels::setUser($this->manager, [NotificationChannels::TELEGRAM]);
        $bot = $this->bot();
        $this->link($bot, $this->manager, '5550002');
        $order = $this->order();

        $approvalId = $this->ask($order);

        $this->assertGreaterThan(0, $approvalId);
        $this->assertNotEmpty($this->sent('5550002'));
    }
}
