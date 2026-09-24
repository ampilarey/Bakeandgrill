<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Jobs\NudgeExpiringCateringQuotes;
use App\Jobs\SendCateringThankYous;
use App\Models\CateringRequest;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Ops audit, 2026-09-25: a nudge before a quote expires; a thank-you the day after the event. */
class CateringNudgeAndThankYouTest extends TestCase
{
    use RefreshDatabase;

    private function request(array $over): CateringRequest
    {
        return CateringRequest::create(array_merge([
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha', 'phone' => '7777001', 'occasion' => 'event', 'headcount' => 20,
            'event_date' => now()->addDays(5)->toDateString(), 'status' => 'awaiting_customer', 'quote_version' => 1,
        ], $over));
    }

    public function test_a_quote_expiring_within_a_day_is_nudged_once(): void
    {
        $soon = $this->request(['quote_expires_at' => now()->addHours(6)]);
        $this->request(['phone' => '7777002', 'quote_expires_at' => now()->addDays(3)]);
        $this->request(['phone' => '7777003', 'quote_expires_at' => now()->subHour()]); // already past: the expiry job's business
        $this->request(['phone' => '7777004', 'status' => 'quoted', 'quote_expires_at' => now()->addHours(2)]);

        (new NudgeExpiringCateringQuotes)->handle(app(\App\Domains\Catering\Services\CateringLifecycleNotifier::class));
        (new NudgeExpiringCateringQuotes)->handle(app(\App\Domains\Catering\Services\CateringLifecycleNotifier::class));

        $texts = SmsLog::where('type', 'catering_lifecycle_customer')->get();
        $this->assertCount(1, $texts);
        $this->assertSame('+9607777001', $texts->first()->to);
        $this->assertStringContainsString("quote {$soon->reference} is open until", (string) $texts->first()->message);
        $this->assertNotNull($soon->fresh()->quote_nudged_at);
    }

    public function test_the_day_after_a_catered_event_the_customer_is_thanked_once(): void
    {
        $done = $this->request(['status' => 'confirmed', 'event_date' => now()->subDay()->toDateString()]);
        $this->request(['phone' => '7777002', 'status' => 'confirmed', 'event_date' => now()->toDateString()]);
        $this->request(['phone' => '7777003', 'status' => 'cancelled', 'event_date' => now()->subDay()->toDateString()]);

        (new SendCateringThankYous)->handle(app(\App\Domains\Catering\Services\CateringLifecycleNotifier::class));
        (new SendCateringThankYous)->handle(app(\App\Domains\Catering\Services\CateringLifecycleNotifier::class));

        $texts = SmsLog::where('type', 'catering_lifecycle_customer')->get();
        $this->assertCount(1, $texts);
        $this->assertSame('+9607777001', $texts->first()->to);
        $this->assertStringContainsString("Thank you for having Bake & Grill cater {$done->reference}", (string) $texts->first()->message);
        $this->assertNotNull($done->fresh()->thank_you_sent_at);
    }
}
