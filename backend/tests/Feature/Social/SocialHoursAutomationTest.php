<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageNotices;
use App\Domains\Social\Services\OpeningHoursAutoPoster;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The opening-hours automation (the last unbuilt item of the original
 * plan): a closure added or the weekly hours changed becomes a post for
 * approval and a line on the TV board, worked out from the same hours
 * and closures the website shows. Only news is posted.
 */
class SocialHoursAutomationTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        Carbon::setTestNow('2026-09-24 12:00:00'); // a Thursday
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $this->hours(['open' => '07:00', 'close' => '22:00'], [5 => ['open' => '14:00', 'close' => '22:00']]);
        SiteSetting::set('social_auto_hours_enabled', '1');
        SiteSetting::set('social_auto_hours_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::bust();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @param array<int, array<string, string>> $overrides */
    private function hours(array $everyDay, array $overrides = []): void
    {
        $rows = [];
        for ($d = 0; $d < 7; $d++) {
            $rows[$d] = ($overrides[$d] ?? $everyDay) + ['closed' => false];
        }
        SiteSetting::set('business_hours_json', json_encode($rows));
        SiteSetting::bust();
    }

    /** @param array<string, string> $closures */
    private function closures(array $closures): void
    {
        SiteSetting::set('business_closures_json', json_encode((object) $closures));
        SiteSetting::bust();
    }

    private function poster(): OpeningHoursAutoPoster
    {
        return app(OpeningHoursAutoPoster::class);
    }

    public function test_the_first_look_records_and_says_nothing_then_a_new_closure_is_announced_once(): void
    {
        $this->assertNull($this->poster()->run(), 'first sight: remember, say nothing');
        $this->assertNull($this->poster()->run());
        $this->assertSame(0, SocialPost::count());

        $this->closures(['2026-09-26' => 'Staff outing']);
        $post = $this->poster()->run();

        $this->assertNotNull($post);
        $this->assertSame(SocialPost::STATUS_AWAITING_APPROVAL, $post->status);
        $this->assertSame('auto_hours', $post->source);
        $this->assertSame('closure:2026-09-26', $post->source_ref);
        $this->assertSame(
            "We're closed on Saturday 26 September (Staff outing). Back Sunday at 7:00 AM.\nOur hours: " . url('/hours'),
            $post->caption(),
        );
        $this->assertSame(url('/hours'), $post->snapshot['link_url']);
        $this->assertSame(1, SocialPostDelivery::where('social_post_id', $post->id)->count());

        $notices = SignageNotices::all();
        $this->assertCount(1, $notices);
        $this->assertSame("We're closed on Saturday 26 September (Staff outing). Back Sunday at 7:00 AM.", $notices[0]['text']);
        $this->assertSame('warning', $notices[0]['look']);
        $this->assertStringStartsWith('2026-09-26T23:59:59', $notices[0]['expires_at']);

        $this->assertNull($this->poster()->run(), 'nothing changed since');
        $this->assertSame(1, SocialPost::count());
    }

    public function test_closures_in_the_past_or_removed_are_not_news(): void
    {
        $this->poster()->run();
        $this->closures(['2026-09-20' => 'Was closed']);
        $this->assertNull($this->poster()->run(), 'a closure already behind us');
        $this->closures([]);
        $this->assertNull($this->poster()->run(), 'a closure taken off');
        $this->assertSame(0, SocialPost::count());
        $this->assertCount(0, SignageNotices::all());

        // Today counts, with "today" and tomorrow's opening time.
        $this->closures(['2026-09-24' => 'Eid']);
        $post = $this->poster()->run();
        $this->assertNotNull($post);
        $this->assertStringStartsWith("We're closed today (Eid). Back tomorrow at 2:00 PM.", $post->caption(), 'Friday opens at 14:00');
    }

    public function test_changed_hours_are_announced_with_the_week_summary_and_an_info_notice(): void
    {
        $this->poster()->run();
        $this->hours(['open' => '08:00', 'close' => '23:00'], [5 => ['open' => '14:00', 'close' => '23:00']]);

        $post = $this->poster()->run();
        $this->assertNotNull($post);
        $this->assertStringStartsWith('hours:', (string) $post->source_ref);
        $this->assertSame(
            "Our opening hours: Sun–Thu 8:00 AM–11:00 PM, Fri 2:00 PM–11:00 PM, Sat 8:00 AM–11:00 PM.\nOrder ahead: " . url('/hours'),
            $post->caption(),
        );
        $notices = SignageNotices::all();
        $this->assertCount(1, $notices);
        $this->assertSame('info', $notices[0]['look']);
        $this->assertStringStartsWith('New opening hours: Sun–Thu 8:00 AM', $notices[0]['text']);
        $this->assertStringStartsWith('2026-10-01T12:00:00', $notices[0]['expires_at']);
    }

    public function test_ramadan_hours_get_the_greeting_and_the_celebrate_look(): void
    {
        $this->poster()->run();
        // Evening-forward windows on most days read as Ramadan hours.
        $this->hours(['open' => '17:00', 'close' => '01:00'], [5 => ['open' => '18:00', 'close' => '01:00']]);

        $post = $this->poster()->run();
        $this->assertNotNull($post);
        $this->assertStringStartsWith('Ramadan Kareem! Our opening hours: ', $post->caption());
        $this->assertSame('celebrate', SignageNotices::all()[0]['look']);
        $this->assertStringStartsWith('Ramadan hours: ', SignageNotices::all()[0]['text']);
    }

    public function test_off_means_quiet_and_the_tv_notice_can_be_turned_off_on_its_own(): void
    {
        SiteSetting::set('social_auto_hours_enabled', '0');
        SiteSetting::bust();
        $this->poster()->run();
        $this->closures(['2026-09-27' => 'Holiday']);
        $this->assertNull($this->poster()->run());

        // Switching on later does not dig up the change it slept through.
        SiteSetting::set('social_auto_hours_enabled', '1');
        SiteSetting::set('social_auto_hours_signage', '0');
        SiteSetting::bust();
        $this->assertNull($this->poster()->run());

        $this->closures(['2026-09-27' => 'Holiday', '2026-09-28' => 'Holiday too']);
        $post = $this->poster()->run();
        $this->assertNotNull($post);
        $this->assertCount(0, SignageNotices::all(), 'TV notice off');

        // No channels: the TV board still gets its line when asked for.
        SiteSetting::set('social_auto_hours_signage', '1');
        SiteSetting::set('social_auto_hours_channel_ids', '[]');
        SiteSetting::bust();
        $this->closures(['2026-09-27' => 'Holiday', '2026-09-28' => 'Holiday too', '2026-09-29' => 'Third']);
        $this->assertNull($this->poster()->run());
        $this->assertCount(1, SignageNotices::all());
        $this->assertSame(1, SocialPost::count());
    }

    public function test_the_command_watches_on_every_tick_and_the_settings_round_trip(): void
    {
        $this->artisan('social:run-automations')->assertSuccessful();
        $this->closures(['2026-09-30' => 'Stocktake']);
        $this->artisan('social:run-automations')
            ->expectsOutputToContain('Automation hours: post')
            ->assertSuccessful();
        $this->assertSame(1, SocialPost::where('source', 'auto_hours')->count());

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->putJson('/api/admin/social/automation', [
            'kind' => 'hours', 'template_hours' => 'Hours: {hours}', 'signage' => false, 'template' => 'Closed {day} {reason}. {back}',
        ])->assertOk();
        $this->assertSame('Hours: {hours}', $res->json('automations.hours.template_hours'));
        $this->assertFalse($res->json('automations.hours.signage'));
        $this->assertSame('Closed {day} {reason}. {back}', $res->json('automations.hours.template'));
        $this->assertTrue($res->json('automations.hours.enabled'));

        $this->putJson('/api/admin/social/automation', ['kind' => 'hours', 'signage' => 'sometimes'])->assertStatus(422);
    }
}
