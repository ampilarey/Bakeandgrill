<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ComplaintBoxEntry;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-21, phase B: complaints in practice — the week in one
 * text, a nudge for what sits unread, and who keeps getting named.
 */
class ComplaintAlertsTest extends TestCase
{
    use RefreshDatabase;

    private int $n = 0;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function entry(array $over = []): ComplaintBoxEntry
    {
        $this->n++;
        $createdAt = $over['created_at'] ?? null;
        unset($over['created_at']);
        $e = ComplaintBoxEntry::create(array_merge([
            'reference_number' => 'CB-' . $this->n,
            'categories' => ['staff_behaviour'],
            'about_staff' => null,
            'comment' => 'x',
            'phone' => null,
            'is_anonymous' => true,
            'source' => 'web',
            'status' => 'new',
            'owner_alert_status' => 'sent',
        ], $over));
        if ($createdAt !== null) {
            $e->forceFill(['created_at' => $createdAt])->saveQuietly();
        }

        return $e;
    }

    public function test_the_weekly_summary_counts_the_week_names_who_was_named_and_says_what_is_open(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_complaint_weekly_sms', '1');
        $this->entry(['categories' => ['staff_behaviour'], 'about_staff' => 'Ali']);
        $this->entry(['categories' => ['staff_behaviour', 'slow_service'], 'about_staff' => 'ali', 'status' => 'resolved']);
        $this->entry(['categories' => ['food_quality']]);
        $this->entry(['categories' => ['cleanliness'], 'created_at' => now()->subDays(10)]); // last week's, still open

        Artisan::call('complaints:weekly-summary');

        $body = (string) SmsLog::query()->where('reference_type', 'complaint_weekly_summary')->value('message');
        $this->assertStringContainsString('last 7 days: 3', $body);
        $this->assertStringContainsString('Staff behaviour 2', $body);
        $this->assertStringContainsString('Named: ali ×2', $body);
        $this->assertStringContainsString('Still open: 3', $body);
    }

    public function test_the_weekly_summary_is_off_by_default(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        $this->entry();
        Artisan::call('complaints:weekly-summary');
        $this->assertDatabaseMissing('sms_logs', ['reference_type' => 'complaint_weekly_summary']);
    }

    public function test_a_complaint_left_new_past_the_limit_is_nudged_once_and_again_after_the_same_wait(): void
    {
        $this->makeOwner(['phone' => '9607771234']);
        SiteSetting::set('ops_complaint_stale_days', '2');
        $old = $this->entry(['categories' => ['food_safety'], 'created_at' => now()->subDays(3)]);
        $this->entry();                                                // just in, not yet
        $this->entry(['created_at' => now()->subDays(5), 'status' => 'in_progress']); // taken up, not nudged

        Artisan::call('complaints:remind-stale');
        $this->assertSame(1, SmsLog::query()->where('reference_type', 'complaint_stale_reminder')->count());
        $body = (string) SmsLog::query()->where('reference_type', 'complaint_stale_reminder')->value('message');
        $this->assertStringContainsString('1 complaint unread for over 2 days: CB-1 (Food safety or allergy, 3d)', $body);
        $this->assertNotNull($old->fresh()->stale_reminded_at);

        // The next day: nothing new to say.
        $this->travel(1)->days();
        Artisan::call('complaints:remind-stale');
        $this->assertSame(1, SmsLog::query()->where('reference_type', 'complaint_stale_reminder')->count());

        // Two more days on, still unread: said again.
        $this->travel(2)->days();
        Artisan::call('complaints:remind-stale');
        $this->assertSame(2, SmsLog::query()->where('reference_type', 'complaint_stale_reminder')->count());
    }

    public function test_the_by_staff_view_groups_names_however_they_were_typed(): void
    {
        $this->entry(['about_staff' => 'Ali', 'created_at' => now()->subDays(3)]);
        $this->entry(['about_staff' => ' ali ', 'categories' => ['slow_service'], 'status' => 'resolved']);
        $this->entry(['about_staff' => 'The tall cashier']);
        $this->entry(['about_staff' => null]);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->getJson('/api/complaint-box/by-staff')->assertOk();

        $rows = $res->json('staff');
        // Shown under the spelling the customer used most recently.
        $this->assertSame(['ali', 'The tall cashier'], array_column($rows, 'name'));
        $this->assertSame(2, $rows[0]['total']);
        $this->assertSame(1, $rows[0]['open']);
        $this->assertEqualsCanonicalizing(['Staff behaviour', 'Slow or poor service'], array_column($rows[0]['categories'], 'label'));
        $this->assertSame(1, $res->json('unnamed'));
    }

    public function test_alert_settings_are_read_and_written_by_a_manager(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->getJson('/api/complaint-box/alert-settings')->assertOk()
            ->assertJsonPath('settings.weekly_sms', false)
            ->assertJsonPath('settings.stale_sms', true)
            ->assertJsonPath('settings.stale_days', 2);

        $this->patchJson('/api/complaint-box/alert-settings', ['weekly_sms' => true, 'stale_days' => 5])->assertOk()
            ->assertJsonPath('settings.weekly_sms', true)
            ->assertJsonPath('settings.stale_days', 5);
        $this->assertSame('1', SiteSetting::get('ops_complaint_weekly_sms'));
        $this->assertSame('5', SiteSetting::get('ops_complaint_stale_days'));

        $this->patchJson('/api/complaint-box/alert-settings', ['stale_days' => 0])->assertStatus(422);
    }
}
