<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\System\ErrorTracker;
use App\Models\ErrorEvent;
use App\Models\SmsLog;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Tests\TestCase;

/** A failure in the money code; the class name marks it as one. */
final class BmlPaymentCallbackFailure extends RuntimeException {}

/**
 * Errors counted without an outside service (iruali import plan, feature 17):
 * by kind and day, a payment error tells the owner at once (once an hour per
 * kind), and each morning the owner gets yesterday's list.
 */
class ErrorTrackerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        ErrorTracker::reset();
        PermissionCatalogSync::sync();
        $this->makeOwner(['phone' => '9607771234']);
        CarbonImmutable::setTestNow('2026-10-17 10:00:00');
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        ErrorTracker::reset();
        parent::tearDown();
    }

    private function boom(string $message = 'boom'): RuntimeException
    {
        return new RuntimeException($message);
    }

    public function test_the_same_error_is_one_row_a_day_with_a_count(): void
    {
        ErrorTracker::record(new RuntimeException('first'));
        ErrorTracker::record(new RuntimeException('second'));
        $this->assertSame(2, ErrorEvent::query()->count(), 'two throw sites are two kinds');
        ErrorTracker::record($this->boom('third'));
        ErrorTracker::record($this->boom('fourth'));
        $this->assertSame(3, ErrorEvent::query()->count(), 'one throw site is one kind, whatever the message');

        $e = $this->boom();
        ErrorTracker::record($e);
        ErrorTracker::record($e);
        $row = ErrorEvent::query()->where('fingerprint', ErrorTracker::fingerprint($e))->firstOrFail();
        $this->assertSame(4, $row->count);
        $this->assertSame('tests/Feature/System/ErrorTrackerTest.php', $row->file);
        $this->assertFalse($row->payment);
    }

    public function test_everyday_errors_are_not_counted(): void
    {
        ErrorTracker::record(ValidationException::withMessages(['phone' => 'Required']));
        ErrorTracker::record(new NotFoundHttpException);

        $this->assertSame(0, ErrorEvent::query()->count());
    }

    public function test_an_error_in_a_request_is_counted_through_the_handler(): void
    {
        Route::get('/_test/boom', fn () => throw new RuntimeException('handler boom'));

        $this->get('/_test/boom')->assertStatus(500);

        $this->assertSame('handler boom', ErrorEvent::query()->value('message'));
    }

    public function test_a_payment_error_tells_the_owner_once_an_hour(): void
    {
        $e = new BmlPaymentCallbackFailure('signature mismatch');
        ErrorTracker::record($e);
        ErrorTracker::record($e);

        $this->assertTrue(ErrorEvent::query()->value('payment'));
        $this->assertSame(1, SmsLog::query()->where('type', ErrorTracker::PAYMENT_TYPE)->count());
        $this->assertStringContainsString('payment error', (string) SmsLog::query()->where('type', ErrorTracker::PAYMENT_TYPE)->value('message'));

        CarbonImmutable::setTestNow('2026-10-17 11:05:00');
        ErrorTracker::record($e);
        $this->assertSame(2, SmsLog::query()->where('type', ErrorTracker::PAYMENT_TYPE)->count(), 'an hour later it tells again');
    }

    public function test_the_morning_report_lists_yesterday_and_forgets_old_rows(): void
    {
        $row = fn (string $day, string $class, int $count, bool $payment = false) => ErrorEvent::create([
            'day' => $day, 'fingerprint' => sha1($day . $class), 'exception' => $class, 'message' => 'x',
            'file' => 'app/Foo.php', 'line' => 12, 'count' => $count, 'payment' => $payment,
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        $row('2026-10-16', 'App\\Exceptions\\PrinterDown', 9);
        $row('2026-10-16', 'App\\Domains\\Payments\\BmlTimeout', 3, true);
        $row('2026-10-17', 'App\\Exceptions\\Today', 50);
        $row('2026-09-01', 'App\\Exceptions\\Ancient', 1);

        Artisan::call('errors:digest');

        $body = (string) SmsLog::query()->where('type', ErrorTracker::DIGEST_TYPE)->value('message');
        $this->assertStringContainsString('12 errors on 16 Oct (2 kinds, 1 in payments)', $body);
        $this->assertStringContainsString('9× PrinterDown (Foo.php:12)', $body);
        $this->assertStringNotContainsString('Today', $body, "today's errors wait for tomorrow's report");
        $this->assertFalse(ErrorEvent::query()->where('exception', 'App\\Exceptions\\Ancient')->exists(), 'older than 30 days is forgotten');
    }

    public function test_a_quiet_day_sends_nothing(): void
    {
        Artisan::call('errors:digest');

        $this->assertSame(0, SmsLog::query()->where('type', ErrorTracker::DIGEST_TYPE)->count());
    }

    // Owner, 2026-10-27: the report said "1× Exception (ScheduleRunCommand.php:207)", naming no task.
    public function test_a_failed_scheduled_task_is_named_and_kept_apart_from_other_tasks(): void
    {
        $prune = new \Exception("Scheduled command ['/usr/local/bin/php' 'artisan' visits:prune > '/dev/null' 2>&1] failed with exit code [1].");
        $digest = new \Exception("Scheduled command ['/usr/local/bin/php' 'artisan' errors:digest > '/dev/null' 2>&1] failed with exit code [137].");

        $this->assertSame(['command' => 'visits:prune', 'exit' => 1], ErrorTracker::scheduledTask($prune->getMessage()));
        $this->assertNull(ErrorTracker::scheduledTask('Something else broke'));
        $this->assertNotSame(ErrorTracker::fingerprint($prune), ErrorTracker::fingerprint($digest));

        $this->assertSame(
            'scheduled task errors:digest stopped with exit code 137',
            ErrorTracker::describe(\Exception::class, $digest->getMessage(), 'vendor/laravel/framework/src/Illuminate/Console/Scheduling/ScheduleRunCommand.php', 207),
        );
        $this->assertSame('RuntimeException (Foo.php:9)', ErrorTracker::describe(RuntimeException::class, 'boom', 'app/Foo.php', 9));

        $event = new ErrorEvent(['exception' => \Exception::class, 'message' => $prune->getMessage(), 'file' => 'vendor/x/ScheduleRunCommand.php', 'line' => 207, 'count' => 1, 'payment' => false]);
        $this->assertStringContainsString('1× scheduled task visits:prune stopped with exit code 1', \App\Console\Commands\SendErrorDigest::message([$event], \Illuminate\Support\Carbon::parse('2026-10-26')));
    }
}
