<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Sms\Jobs\SendScheduledSmsJob;
use App\Domains\Sms\Services\SmsSchedulerService;
use App\Models\SmsScheduledMessage;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class SmsSchedulerTest extends TestCase
{
    use RefreshDatabase;

    private SmsSchedulerService $scheduler;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scheduler = app(SmsSchedulerService::class);
        Queue::fake();
        Carbon::setTestNow(Carbon::parse('2026-04-20 10:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow(null);
        parent::tearDown();
    }

    private function makeScheduled(array $attrs = []): SmsScheduledMessage
    {
        return SmsScheduledMessage::create(array_merge([
            'name' => 'Test message',
            'to_type' => 'phone',
            'to_phone' => '+9607999000',
            'body' => 'Hello!',
            'is_recurring' => false,
            'status' => 'active',
            'next_send_at' => Carbon::now()->subMinute(),
        ], $attrs));
    }

    /** One-time due message is dispatched and marked completed */
    public function test_one_time_message_dispatched_and_completed(): void
    {
        $msg = $this->makeScheduled();

        $count = $this->scheduler->dispatchDue(Carbon::now());

        $this->assertEquals(1, $count);
        Queue::assertPushed(SendScheduledSmsJob::class);

        $msg->refresh();
        $this->assertEquals('completed', $msg->status);
        $this->assertNull($msg->next_send_at);
    }

    /** Paused message is NOT dispatched */
    public function test_paused_message_is_skipped(): void
    {
        $this->makeScheduled(['status' => 'paused']);

        $count = $this->scheduler->dispatchDue(Carbon::now());

        $this->assertEquals(0, $count);
        Queue::assertNothingPushed();
    }

    /** Future message not yet due is skipped */
    public function test_future_message_not_dispatched(): void
    {
        $this->makeScheduled(['next_send_at' => Carbon::now()->addHour()]);

        $count = $this->scheduler->dispatchDue(Carbon::now());

        $this->assertEquals(0, $count);
        Queue::assertNothingPushed();
    }

    /** Recurring daily message gets next_send_at advanced by 1 day */
    public function test_recurring_daily_advances_next_send_at(): void
    {
        $msg = $this->makeScheduled([
            'is_recurring' => true,
            'recurrence_type' => 'daily',
            'recurrence_time' => '10:00',
            'next_send_at' => Carbon::now()->subMinute(),
        ]);

        $this->scheduler->dispatchDue(Carbon::now());

        $msg->refresh();
        $this->assertEquals('active', $msg->status);
        $this->assertNotNull($msg->next_send_at);
        $this->assertTrue($msg->next_send_at->isAfter(Carbon::now()));
    }

    /** computeNextSendAt returns correct next time for weekly recurrence */
    public function test_compute_next_send_at_weekly(): void
    {
        $msg = new SmsScheduledMessage([
            'is_recurring' => true,
            'recurrence_type' => 'weekly',
            'recurrence_days' => ['mon'],
            'recurrence_time' => '09:00',
        ]);

        // Starting from Wednesday, next monday should be returned
        $after = Carbon::parse('2026-04-22 10:00:00'); // Wednesday
        $next = $msg->computeNextSendAt($after);

        $this->assertNotNull($next);
        $this->assertEquals('Mon', $next->format('D'));
        $this->assertEquals('09:00', $next->format('H:i'));
    }
}
