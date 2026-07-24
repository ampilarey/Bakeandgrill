<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Orders\Support\DiscountSettings;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Device;
use App\Models\DiscountApproval;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class DiscountApprovalOtpTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private User $staff;

    private User $manager;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $this->manager = User::create([
            'name' => 'Manager Approver',
            'email' => 'mgr-otp@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'manager')->value('id'),
            'phone' => '7654321',
            'is_active' => true,
        ]);

        $this->staff = User::create([
            'name' => 'Cashier OTP',
            'email' => 'staff-otp@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->value('id'),
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staff->grantPermission('promotions.discounts');
        $this->staff->unsetRelation('permissions');

        $this->device = Device::create([
            'name' => 'POS OTP',
            'identifier' => 'OTP-POS-1',
            'type' => 'pos',
            'is_active' => true,
        ]);
        $category = Category::create(['name' => 'Food', 'slug' => 'food-otp', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Burger',
            'base_price' => 100.00,
            'sku' => 'OTP-B001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->preparePosApi($this->staff, $this->device);
        $this->withHeader('X-Device-Identifier', $this->device->identifier);

        SiteSetting::set(DiscountSettings::APPROVAL_REQUIRED, 'true');
        SiteSetting::set(DiscountSettings::APPROVERS, json_encode([
            ['user_id' => $this->manager->id, 'phone' => '7654321', 'label' => 'Manager'],
            ['user_id' => null, 'phone' => '7777777', 'label' => 'Backup'],
        ]));
        SiteSetting::bust();
    }

    private function createOpenOrder(): Order
    {
        $create = $this->postJson('/api/orders', [
            'type' => 'takeaway',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        return Order::findOrFail((int) $create->json('order.id'));
    }

    public function test_request_sends_one_sms_per_approver(): void
    {
        $order = $this->createOpenOrder();

        $res = $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
            'discount_amount' => 10,
        ])->assertOk();

        $approvalId = (int) $res->json('approval_id');
        $this->assertGreaterThan(0, $approvalId);
        $this->assertNull($res->json('code'));

        $logs = SmsLog::where('type', 'discount_approval_otp')
            ->where('reference_id', (string) $approvalId)
            ->get();
        $this->assertCount(2, $logs);
        $this->assertTrue($logs->every(fn ($l) => in_array($l->status, ['sent', 'demo', 'queued'], true)));

        $this->assertDatabaseHas('discount_approvals', [
            'id' => $approvalId,
            'order_id' => $order->id,
            'discount_laar' => 1000,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'order.manual_discount.approval_requested',
        ]);
    }

    public function test_confirm_applies_discount_and_sets_approved_by(): void
    {
        $order = $this->createOpenOrder();
        $approvalId = (int) $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
            'discount_amount' => 15,
        ])->assertOk()->json('approval_id');

        DiscountApproval::where('id', $approvalId)->update([
            'code_hash' => Hash::make('4242'),
        ]);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", [
            'approval_id' => $approvalId,
            'code' => '4242',
            'discount_amount' => 15,
        ])->assertOk();

        $order->refresh();
        $this->assertSame(1500, (int) $order->manual_discount_laar);
        $this->assertSame($this->manager->id, (int) $order->manual_discount_approved_by);
        $this->assertSame('approved', DiscountApproval::find($approvalId)?->status);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'order.manual_discount.applied',
        ]);
    }

    public function test_wrong_code_increments_and_invalidates_after_max(): void
    {
        SiteSetting::set(DiscountSettings::MAX_ATTEMPTS, '3');
        SiteSetting::bust();

        $order = $this->createOpenOrder();
        $approvalId = (int) $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
            'discount_amount' => 10,
        ])->assertOk()->json('approval_id');

        DiscountApproval::where('id', $approvalId)->update([
            'code_hash' => Hash::make('9999'),
        ]);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", [
            'approval_id' => $approvalId,
            'code' => '0000',
        ])->assertStatus(422)->assertJsonFragment(['message' => 'Invalid code.']);

        $this->assertSame(1, (int) DiscountApproval::find($approvalId)?->attempts);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", [
            'approval_id' => $approvalId,
            'code' => '0001',
        ])->assertStatus(422);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", [
            'approval_id' => $approvalId,
            'code' => '0002',
        ])->assertStatus(422)->assertJsonFragment(['message' => 'Too many attempts. Request a new code.']);

        $this->assertSame('failed', DiscountApproval::find($approvalId)?->status);
    }

    public function test_expired_code_rejected(): void
    {
        $order = $this->createOpenOrder();
        $approvalId = (int) $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
            'discount_amount' => 10,
        ])->assertOk()->json('approval_id');

        DiscountApproval::where('id', $approvalId)->update([
            'code_hash' => Hash::make('1111'),
            'expires_at' => now()->subMinute(),
        ]);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", [
            'approval_id' => $approvalId,
            'code' => '1111',
        ])->assertStatus(422)->assertJsonFragment(['message' => 'Approval code expired.']);
    }

    public function test_amount_change_rejected(): void
    {
        $order = $this->createOpenOrder();
        $approvalId = (int) $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
            'discount_amount' => 10,
        ])->assertOk()->json('approval_id');

        DiscountApproval::where('id', $approvalId)->update([
            'code_hash' => Hash::make('2222'),
        ]);

        $this->postJson("/api/orders/{$order->id}/discount/confirm", [
            'approval_id' => $approvalId,
            'code' => '2222',
            'discount_amount' => 50,
        ])->assertStatus(422)->assertJsonFragment(['message' => 'Discount amount changed. Request a new approval code.']);
    }

    public function test_request_approval_is_rate_limited(): void
    {
        $order = $this->createOpenOrder();

        // Prior tests in this class may already have consumed part of the
        // throttle:5,1 budget — burn until we hit 429.
        $hit429 = false;
        for ($i = 0; $i < 20; $i++) {
            $status = $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
                'discount_amount' => 5,
            ])->status();
            if ($status === 429) {
                $hit429 = true;
                break;
            }
            $this->assertContains($status, [200, 422], 'Unexpected status before throttle');
        }

        $this->assertTrue($hit429, 'Expected throttle:5,1 to return 429');
    }

    public function test_when_approval_off_discount_applies_directly(): void
    {
        SiteSetting::set(DiscountSettings::APPROVAL_REQUIRED, 'false');
        SiteSetting::bust();

        $order = $this->createOpenOrder();

        $this->patchJson("/api/orders/{$order->id}/items", [
            'items' => [[
                'item_id' => $this->item->id,
                'name' => $this->item->name,
                'quantity' => 1,
            ]],
            'reprint_kitchen' => false,
            'discount_amount' => 20,
        ])->assertOk();

        $this->assertSame(2000, (int) Order::find($order->id)?->manual_discount_laar);
        $this->assertSame(0, DiscountApproval::count());
    }

    public function test_global_kill_switch_blocks_approval_sms(): void
    {
        SiteSetting::set(SmsTypeRegistry::GLOBAL_KILL_SWITCH, 'true');
        SiteSetting::bust();

        $order = $this->createOpenOrder();

        $this->postJson("/api/orders/{$order->id}/discount/request-approval", [
            'discount_amount' => 10,
        ])->assertStatus(422)->assertJsonFragment([
            'message' => 'Could not send approval SMS. Check SMS settings (global kill switch may be on).',
        ]);

        $this->assertTrue(
            SmsLog::where('type', 'discount_approval_otp')->where('status', 'disabled')->exists()
            || DiscountApproval::where('status', 'failed')->exists()
        );
    }
}
