<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Sms\Jobs\SendStaffNotificationJob;
use App\Models\Order;
use App\Models\StaffNotificationLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class StaffNotificationDeduplicationTest extends TestCase
{
    use RefreshDatabase;

    private function makeSmsOrder(): Order
    {
        return Order::create([
            'order_number' => 'BG-DEDUP-' . uniqid(),
            'type'         => 'takeaway',
            'status'       => 'pending',
            'total'        => 100,
            'total_laar'   => 10000,
        ]);
    }

    /** Running the job twice for the same event+phone sends SMS only once */
    public function test_job_does_not_send_duplicate_for_same_idempotency_key(): void
    {
        // Create a real SmsLog so foreign-key constraints are satisfied
        $smsLog = \App\Models\SmsLog::create([
            'to'         => '+9607111111',
            'message'    => 'Test message',
            'type'       => 'staff_notification',
            'status'     => 'sent',
            'sent_at'    => now(),
        ]);

        $mockSmsService = $this->createMock(SmsService::class);
        $mockSmsService->expects($this->once())->method('send')->willReturn($smsLog);
        $this->app->instance(SmsService::class, $mockSmsService);

        $order = $this->makeSmsOrder();

        $job = new SendStaffNotificationJob(
            orderId: $order->id,
            eventType: 'new_order',
            phone: '+9607111111',
            message: 'Test message',
            recipientType: 'staff',
            recipientId: null,
            fallbackUsed: false,
        );

        // First run — should send
        $job->handle($mockSmsService);

        // Manually mark as sent (simulating success)
        StaffNotificationLog::where('order_id', $order->id)->update(['status' => 'sent']);

        // Second run with same parameters — should be skipped due to idempotency
        $job2 = new SendStaffNotificationJob(
            orderId: $order->id,
            eventType: 'new_order',
            phone: '+9607111111',
            message: 'Test message duplicate',
            recipientType: 'staff',
            recipientId: null,
            fallbackUsed: false,
        );
        $job2->handle($mockSmsService);
    }

    /** A log record is created when the job runs */
    public function test_log_record_created_on_dispatch(): void
    {
        $smsLog2 = \App\Models\SmsLog::create([
            'to' => '+9607222222', 'message' => 'New order notification',
            'type' => 'staff_notification', 'status' => 'sent', 'sent_at' => now(),
        ]);

        $mockSmsService = $this->createMock(SmsService::class);
        $mockSmsService->method('send')->willReturn($smsLog2);
        $this->app->instance(SmsService::class, $mockSmsService);

        $order = $this->makeSmsOrder();

        $job = new SendStaffNotificationJob(
            orderId: $order->id,
            eventType: 'new_order',
            phone: '+9607222222',
            message: 'New order notification',
            recipientType: 'staff',
            recipientId: 42,
            fallbackUsed: false,
        );

        $job->handle($mockSmsService);

        $this->assertDatabaseHas('staff_notification_logs', [
            'order_id'       => $order->id,
            'event_type'     => 'new_order',
            'phone'          => '+9607222222',
            'recipient_type' => 'staff',
        ]);
    }

    /** Fallback_used flag is stored correctly */
    public function test_fallback_flag_stored_in_log(): void
    {
        $smsLog3 = \App\Models\SmsLog::create([
            'to' => '+9607333333', 'message' => 'Fallback alert',
            'type' => 'staff_notification', 'status' => 'sent', 'sent_at' => now(),
        ]);

        $mockSmsService = $this->createMock(SmsService::class);
        $mockSmsService->method('send')->willReturn($smsLog3);
        $this->app->instance(SmsService::class, $mockSmsService);

        $order = $this->makeSmsOrder();

        $job = new SendStaffNotificationJob(
            orderId: $order->id,
            eventType: 'no_staff_found',
            phone: '+9607333333',
            message: 'Fallback alert',
            recipientType: 'fallback',
            recipientId: null,
            fallbackUsed: true,
        );

        $job->handle($mockSmsService);

        $this->assertDatabaseHas('staff_notification_logs', [
            'order_id'       => $order->id,
            'event_type'     => 'no_staff_found',
            'fallback_used'  => true,
            'recipient_type' => 'fallback',
        ]);
    }
}
