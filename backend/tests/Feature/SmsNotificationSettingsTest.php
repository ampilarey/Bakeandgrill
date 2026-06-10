<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SmsNotificationSettingsTest extends TestCase
{
    use RefreshDatabase;

    private User $staffUser;
    private Order $order;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'sms-notif-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'SMS Notif Item',
            'base_price' => 50.0,
            'sku' => 'SN-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@smsnotif.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create(['name' => 'SN POS', 'identifier' => 'SN-POS', 'type' => 'pos', 'is_active' => true]);

        $this->customer = Customer::create([
            'name' => 'SMS Customer',
            'phone' => '+9607890123',
        ]);

        $this->order = Order::create([
            'order_number' => 'SN-1001',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 50,
            'total' => 50,
            'user_id' => $this->staffUser->id,
            'customer_id' => $this->customer->id,
        ]);
        OrderItem::create([
            'order_id' => $this->order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'unit_price' => 50,
            'quantity' => 1,
            'total_price' => 50,
        ]);
    }

    public function test_payment_confirmation_skipped_when_toggle_disabled(): void
    {
        SiteSetting::set('sms_customer_payment_confirmed_enabled', 'false');

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $this->postJson("/api/orders/{$this->order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 50.00]],
            'print_receipt' => false,
        ])->assertOk();

        $this->assertDatabaseMissing('sms_logs', [
            'idempotency_key' => 'order:paid:confirm:' . $this->order->order_number,
        ]);
    }

    public function test_send_bill_returns_422_when_disabled(): void
    {
        SiteSetting::set('sms_pos_send_bill_enabled', 'false');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'SMS disabled in Admin → Settings → Notifications.']);

        $this->assertDatabaseCount('sms_logs', 0);
    }

    public function test_send_bill_without_phone_still_returns_link_when_sms_disabled(): void
    {
        SiteSetting::set('sms_pos_send_bill_enabled', 'false');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $res = $this->postJson("/api/orders/{$this->order->id}/send-bill", [])
            ->assertOk();

        $this->assertStringContainsString('/invoices/', $res->json('link'));
        $this->assertDatabaseCount('sms_logs', 0);
    }

    public function test_send_pay_link_returns_422_when_disabled(): void
    {
        SiteSetting::set('sms_pos_send_pay_link_enabled', 'false');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/orders/{$this->order->id}/send-pay-link")
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'SMS disabled in Admin → Settings → Notifications.']);
    }

    public function test_receipt_resend_returns_422_when_disabled(): void
    {
        SiteSetting::set('sms_pos_receipt_resend_enabled', 'false');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/receipts/{$this->order->id}/send", [
            'channel' => 'sms',
            'recipient' => '+9607890123',
        ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'SMS disabled in Admin → Settings → Notifications.']);
    }

    public function test_custom_template_body_is_used_for_send_bill(): void
    {
        SmsTemplate::where('slug', 'customer_send_bill')->update([
            'body' => 'CUSTOM BILL {{invoice_number}} {{total}} {{invoice_url}}',
        ]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson("/api/orders/{$this->order->id}/send-bill", ['phone' => '+9607890123'])
            ->assertOk();

        $log = SmsLog::query()->where('reference_type', 'invoice')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertStringContainsString('CUSTOM BILL', $log->message);
    }

    public function test_template_preview_returns_placeholder_labels(): void
    {
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'slug' => 'owner', 'is_active' => true]);
        $owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@smsnotif.test',
            'password' => Hash::make('password'),
            'role_id' => $ownerRole->id,
            'is_active' => true,
        ]);

        Sanctum::actingAs($owner, ['staff']);
        $template = SmsTemplate::where('slug', 'customer_send_bill')->firstOrFail();

        $this->postJson("/api/admin/sms/templates/{$template->id}/preview")
            ->assertOk()
            ->assertJsonStructure(['preview', 'variables']);

        $this->assertStringContainsString(
            '[INVOICE_NUMBER]',
            (string) $this->postJson("/api/admin/sms/templates/{$template->id}/preview")->json('preview'),
        );
    }
}
