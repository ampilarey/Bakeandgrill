<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Sms\Services\StaffNotificationRoutingService;
use App\Models\Order;
use App\Models\Role;
use App\Models\SmsContact;
use App\Models\StaffNotificationPref;
use App\Models\StaffSchedule;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffNotificationRoutingTest extends TestCase
{
    use RefreshDatabase;

    private StaffNotificationRoutingService $router;

    protected function setUp(): void
    {
        parent::setUp();
        $this->router = app(StaffNotificationRoutingService::class);
        Carbon::setTestNow(Carbon::parse('2026-04-20 10:00:00')); // Monday 10:00
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow(null);
        parent::tearDown();
    }

    private function makeRole(string $slug): Role
    {
        return Role::firstOrCreate(['slug' => $slug], ['name' => ucfirst($slug)]);
    }

    private function makeSmsStaff(Role $role, string $phone): User
    {
        return User::create([
            'name'      => 'Staff ' . $phone,
            'email'     => $phone . '@test.mv',
            'phone'     => $phone,
            'password'  => bcrypt('secret'),
            'role_id'   => $role->id,
            'is_active' => true,
        ]);
    }

    private function makeSmsOrder(string $type = 'takeaway'): Order
    {
        return Order::create([
            'order_number' => 'BG-TEST-' . uniqid(),
            'type'         => $type,
            'status'       => 'pending',
            'total'        => 100,
            'total_laar'   => 10000,
        ]);
    }

    private function putOnShift(User $user, Carbon $at): void
    {
        StaffSchedule::create([
            'user_id'     => $user->id,
            'date'        => $at->toDateString(),
            'shift_start' => '08:00',
            'shift_end'   => '18:00',
            'is_confirmed' => true,
        ]);
    }

    /** Staff on shift with notifications enabled receives notification */
    public function test_on_shift_staff_receives_notification(): void
    {
        $role = $this->makeRole('staff');
        $staff = $this->makeSmsStaff($role, '+9607100001');
        $this->putOnShift($staff, Carbon::now());

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $phones = $recipients->pluck('phone');
        $this->assertContains('+9607100001', $phones);
    }

    /** Staff off shift is not included */
    public function test_off_shift_staff_excluded(): void
    {
        $role = $this->makeRole('staff');
        $staff = $this->makeSmsStaff($role, '+9607200002');
        // No shift scheduled

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $phones = $recipients->pluck('phone');
        $this->assertNotContains('+9607200002', $phones);
    }

    /** Staff with notifications disabled does not receive */
    public function test_staff_with_notifications_disabled_excluded(): void
    {
        $role = $this->makeRole('staff');
        $staff = $this->makeSmsStaff($role, '+9607300003');
        $this->putOnShift($staff, Carbon::now());

        StaffNotificationPref::create([
            'user_id'               => $staff->id,
            'notifications_enabled' => false,
        ]);

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $phones = $recipients->pluck('phone');
        $this->assertNotContains('+9607300003', $phones);
    }

    /** Staff with order_type filter only receives matching types */
    public function test_staff_order_type_filter(): void
    {
        $role = $this->makeRole('staff');
        $staff = $this->makeSmsStaff($role, '+9607400004');
        $this->putOnShift($staff, Carbon::now());

        StaffNotificationPref::create([
            'user_id'               => $staff->id,
            'notifications_enabled' => true,
            'order_types'           => ['delivery'],
        ]);

        // Test: takeaway order should NOT match
        $takeawayOrder = $this->makeSmsOrder('takeaway');
        $recipients = $this->router->resolve($takeawayOrder, 'new_order', Carbon::now());
        $this->assertNotContains('+9607400004', $recipients->pluck('phone'));

        // Test: delivery order SHOULD match
        $deliveryOrder = $this->makeSmsOrder('delivery');
        $recipients = $this->router->resolve($deliveryOrder, 'new_order', Carbon::now());
        $this->assertContains('+9607400004', $recipients->pluck('phone'));
    }

    /** Fallback is used when no staff matches */
    public function test_fallback_used_when_no_staff_on_shift(): void
    {
        $role = $this->makeRole('manager');
        $manager = $this->makeSmsStaff($role, '+9607500005');

        StaffNotificationPref::create([
            'user_id'     => $manager->id,
            'is_fallback' => true,
            'fallback_priority' => 10,
        ]);

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $this->assertNotEmpty($recipients);
        $fallback = $recipients->where('fallback_used', true)->first();
        $this->assertNotNull($fallback);
        $this->assertEquals('+9607500005', $fallback['phone']);
    }

    /** Staff without phone is excluded */
    public function test_staff_without_phone_excluded(): void
    {
        $role = $this->makeRole('staff');
        $staff = User::create([
            'name'      => 'No Phone Staff',
            'email'     => 'nophone@test.mv',
            'phone'     => null,
            'password'  => bcrypt('secret'),
            'role_id'   => $role->id,
            'is_active' => true,
        ]);
        $this->putOnShift($staff, Carbon::now());

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $phones = $recipients->pluck('phone');
        $this->assertNotContains(null, $phones);
        $this->assertNotContains('', $phones);
    }

    /** Active external SmsContact receives notification */
    public function test_external_contact_receives_notification(): void
    {
        SmsContact::create([
            'name'       => 'On-call Manager',
            'phone'      => '+9607600006',
            'type'       => 'external',
            'is_enabled' => true,
            'active_days' => ['mon', 'tue', 'wed', 'thu', 'fri'],
        ]);

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $phones = $recipients->pluck('phone');
        $this->assertContains('+9607600006', $phones);
    }

    /** Multiple staff on shift all receive notifications */
    public function test_multiple_staff_on_shift_all_receive(): void
    {
        $role = $this->makeRole('staff');
        $staff1 = $this->makeSmsStaff($role, '+9607700007');
        $staff2 = $this->makeSmsStaff($role, '+9607700008');
        $this->putOnShift($staff1, Carbon::now());
        $this->putOnShift($staff2, Carbon::now());

        $order = $this->makeSmsOrder();
        $recipients = $this->router->resolve($order, 'new_order', Carbon::now());

        $phones = $recipients->pluck('phone');
        $this->assertContains('+9607700007', $phones);
        $this->assertContains('+9607700008', $phones);
    }
}
