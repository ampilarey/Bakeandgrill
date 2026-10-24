<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Reporting\Support\UserAgentInfo;
use App\Domains\Reporting\Support\VisitPath;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The visitor report (owner, 2026-10-24: "Add maximum detail u can get"):
 * each view kept with its page, source, device and country, a secret in an
 * address never kept, the time on a page from the leave beacon, and the
 * report's totals, pages, sources, funnel and live count.
 */
class SiteAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

    private const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

    private const FB_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/en_US;FBAV/420.0]';

    private function hit(array $detail, string $ua = self::IPHONE, string $surface = 'web', ?string $country = 'MV', string $ip = '10.0.0.1'): void
    {
        $headers = ['User-Agent' => $ua] + ($country ? ['CF-IPCountry' => $country] : []);
        $this->withServerVariables(['REMOTE_ADDR' => $ip])
            ->postJson('/api/visits/beacon', ['surface' => $surface] + $detail, $headers)->assertOk();
    }

    public function test_a_view_is_kept_with_its_details_and_no_ip_or_secret(): void
    {
        $this->hit(['path' => '/order/track/AbC123xyz987QWE456?x=1', 'ref' => 'https://l.facebook.com/l.php?u=x', 'sid' => 'sess-aaaa-1111', 'pv' => 'view-aaaa-0001', 'screen' => 390, 'lang' => 'dv-MV', 'returning' => true, 'utm_source' => 'Facebook', 'utm_medium' => 'paid', 'utm_campaign' => 'Ramadan'], self::FB_ANDROID, 'order');

        $row = DB::table('site_visit_events')->first();
        $this->assertSame('/order/track/:token', $row->path, 'a tracking token is never kept');
        $this->assertSame('l.facebook.com', $row->referrer_host);
        $this->assertSame(['mobile', 'Facebook app', 'Android'], [$row->device, $row->browser, $row->os]);
        $this->assertSame(['MV', 'dv-mv', 390], [$row->country, $row->lang, (int) $row->screen_w]);
        $this->assertSame(['facebook', 'paid', 'ramadan'], [$row->utm_source, $row->utm_medium, $row->utm_campaign]);
        $this->assertTrue((bool) $row->returning);
        $this->assertTrue((bool) $row->is_entry);
        $this->assertSame(16, strlen($row->visitor));
        foreach ((array) $row as $value) {
            $this->assertStringNotContainsString('10.0.0.1', (string) $value);
        }

        // The leave beacon records the time on the page, capped at an hour.
        $this->postJson('/api/visits/beacon', ['surface' => 'order', 'type' => 'leave', 'pv' => 'view-aaaa-0001', 'sid' => 'sess-aaaa-1111', 'dur' => 42], ['User-Agent' => self::FB_ANDROID])->assertOk();
        $this->assertSame(42, (int) DB::table('site_visit_events')->value('duration_s'));
        $this->postJson('/api/visits/beacon', ['surface' => 'order', 'type' => 'leave', 'pv' => 'view-aaaa-0001', 'sid' => 'sess-aaaa-1111', 'dur' => 50000], ['User-Agent' => self::FB_ANDROID])->assertOk();
        $this->assertSame(3600, (int) DB::table('site_visit_events')->value('duration_s'));
        // A leave never adds a view.
        $this->assertSame(1, DB::table('site_visit_events')->count());
        $this->assertSame(1, (int) DB::table('site_visits_daily')->sum('views'));
    }

    public function test_an_older_bare_beacon_still_counts_and_bots_are_left_out(): void
    {
        $this->postJson('/api/visits/beacon', ['surface' => 'web'], ['User-Agent' => self::IPHONE])->assertOk();
        $this->hit(['path' => '/'], 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0');
        $this->hit(['path' => '/'], 'WhatsApp/2.23.20 A');

        $this->assertSame(1, (int) DB::table('site_visits_daily')->sum('views'));
        $this->assertSame(0, DB::table('site_visit_events')->count());
    }

    public function test_the_report_adds_up_pages_sources_devices_and_the_order_funnel(): void
    {
        PermissionCatalogSync::sync();
        // Visit A: Google → menu → checkout → order placed, on an iPhone.
        $this->hit(['path' => '/', 'ref' => 'https://www.google.com/', 'sid' => 'sessionAAAA', 'pv' => 'pvA1aaaaaa'], self::IPHONE, 'web', 'MV', '10.0.0.1');
        $this->hit(['path' => '/order/menu', 'ref' => 'https://bakeandgrill.mv/', 'sid' => 'sessionAAAA', 'pv' => 'pvA2aaaaaa'], self::IPHONE, 'order', 'MV', '10.0.0.1');
        $this->hit(['path' => '/order/checkout', 'sid' => 'sessionAAAA', 'pv' => 'pvA3aaaaaa'], self::IPHONE, 'order', 'MV', '10.0.0.1');
        $this->hit(['path' => '/order/orders/123', 'sid' => 'sessionAAAA', 'pv' => 'pvA4aaaaaa'], self::IPHONE, 'order', 'MV', '10.0.0.1');
        // Visit B: straight in on a computer, one page, from India.
        $this->hit(['path' => '/menu', 'sid' => 'sessionBBBB', 'pv' => 'pvB1bbbbbb'], self::WINDOWS, 'web', 'IN', '10.0.0.2');
        $this->postJson('/api/visits/beacon', ['surface' => 'web', 'type' => 'leave', 'pv' => 'pvB1bbbbbb', 'sid' => 'sessionBBBB', 'dur' => 30], ['User-Agent' => self::WINDOWS]);

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $r = $this->getJson('/api/admin/site-analytics?days=7')->assertOk();

        $this->assertSame(5, $r->json('totals.views'));
        $this->assertSame(2, $r->json('totals.visitors'));
        $this->assertSame(2, $r->json('totals.sessions'));
        $this->assertEquals(50.0, $r->json('totals.bounce_rate'), 'one of two visits saw one page');
        $this->assertSame(2, $r->json('live.visitors'));
        $this->assertEqualsCanonicalizing(['Google', 'Direct or app'], array_column($r->json('sources'), 'name'));
        $this->assertSame(1, collect($r->json('devices'))->firstWhere('name', 'desktop')['visitors']);
        $this->assertEqualsCanonicalizing(['MV', 'IN'], array_column($r->json('countries'), 'name'));
        $this->assertSame([2, 2, 1, 1, 1], array_column($r->json('funnel'), 'sessions'));
        $this->assertSame('/order/orders/:id', collect($r->json('exits'))->pluck('path')->first(fn ($p) => $p !== '/menu'));
        $this->assertSame(30, collect($r->json('pages'))->firstWhere('path', '/menu')['avg_s']);
        $this->assertCount(7, $r->json('daily'));
        $this->assertSame(5, array_sum(array_map('array_sum', $r->json('hours'))));
        $this->assertCount(5, $r->json('recent'));
        $this->assertSame('/menu', $r->json('recent.0.path'));

        $web = $this->getJson('/api/admin/site-analytics?days=7&surface=web')->assertOk();
        $this->assertSame(2, $web->json('totals.views'));
    }

    public function test_only_reports_viewers_see_it(): void
    {
        PermissionCatalogSync::sync();
        $this->getJson('/api/admin/site-analytics')->assertUnauthorized();
        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->getJson('/api/admin/site-analytics')->assertForbidden();
    }

    // Owner, 2026-10-24: keep it all; "when data is large add manual del or auto del settings in the admin".
    public function test_detail_is_kept_for_ever_until_a_time_is_set_and_the_daily_totals_always_stay(): void
    {
        $this->hit(['path' => '/']);
        DB::table('site_visit_events')->update(['occurred_at' => now()->subDays(400), 'day' => now()->subDays(400)->toDateString()]);

        $this->artisan('visits:prune')->assertSuccessful();
        $this->assertSame(1, DB::table('site_visit_events')->count(), 'kept for ever by default');

        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/admin/site-analytics/retention', ['keep_days' => 45])->assertUnprocessable();
        $this->putJson('/api/admin/site-analytics/retention', ['keep_days' => 365])->assertOk()->assertJsonPath('storage.keep_days', 365);
        $this->artisan('visits:prune')->assertSuccessful();
        $this->assertSame(0, DB::table('site_visit_events')->count());
        $this->assertSame(1, (int) DB::table('site_visits_daily')->sum('views'));
    }

    public function test_detail_before_a_date_is_deleted_by_hand_and_the_report_says_how_much_is_stored(): void
    {
        PermissionCatalogSync::sync();
        $this->hit(['path' => '/', 'sid' => 'sessionOLD1'], self::IPHONE, 'web', 'MV', '10.0.0.1');
        $this->hit(['path' => '/menu', 'sid' => 'sessionNEW1'], self::WINDOWS, 'web', 'MV', '10.0.0.2');
        DB::table('site_visit_events')->where('session', 'sessionOLD1')->update(['day' => '2026-01-10']);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $r = $this->getJson('/api/admin/site-analytics?days=7')->assertOk();
        $this->assertSame(2, $r->json('storage.views'));
        $this->assertSame('2026-01-10', $r->json('storage.oldest'));
        $this->assertSame(0, $r->json('storage.keep_days'));
        $this->assertFalse($r->json('storage.large'));

        $this->postJson('/api/admin/site-analytics/delete', ['before' => '2026-02-01'])->assertOk()
            ->assertJsonPath('deleted', 1)->assertJsonPath('storage.views', 1);
        $this->assertSame(2, (int) DB::table('site_visits_daily')->sum('views'));

        // Reading the report is not leave to delete it.
        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->postJson('/api/admin/site-analytics/delete', ['before' => '2026-12-01'])->assertForbidden();
        $this->putJson('/api/admin/site-analytics/retention', ['keep_days' => 90])->assertForbidden();
    }

    public function test_paths_user_agents_and_sources_are_read_plainly(): void
    {
        $this->assertSame('/menu/c/chicken-burgers', VisitPath::clean('/menu/c/chicken-burgers?utm=1'));
        $this->assertSame('/order/gift-cards/v/:token', VisitPath::clean('order/gift-cards/v/9f8e7d6c5b4a39281706f5e4'));
        $this->assertSame('/b/:token', VisitPath::clean('/b/K7Q2M9XA'));
        $this->assertNull(VisitPath::referrerHost('https://www.bakeandgrill.mv/menu', 'bakeandgrill.mv'));
        $this->assertSame('Instagram', VisitPath::sourceName('l.instagram.com'));
        $this->assertSame('X (Twitter)', VisitPath::sourceName('t.co'));
        $this->assertSame('tablet', UserAgentInfo::device('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari'));
        $this->assertSame('Samsung Internet', UserAgentInfo::browser('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/25.0 Chrome/121 Mobile Safari/537.36'));
        $this->assertSame('macOS', UserAgentInfo::os('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605'));
    }
}
