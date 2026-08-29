<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Reporting\Services\PublicSiteStats;
use App\Models\CateringRequest;
use App\Models\Customer;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Public "social proof" counters: per-surface control (website vs order
 * app), separate counters per type, off by default, rounded-down display,
 * zero-hiding, cache busting, the admin gate, and the rendered strip.
 */
class PublicStatsTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $counters */
    private function enable(string $surface, array $counters): void
    {
        app(PublicSiteStats::class)->updateSettings($surface, [
            'enabled' => true,
            'counters' => array_fill_keys($counters, true),
        ]);
    }

    public function test_disabled_by_default_on_both_surfaces(): void
    {
        $this->makePaidOrder();

        foreach (['web', 'order'] as $surface) {
            $res = $this->getJson('/api/public-stats?surface=' . $surface)->assertOk();
            $this->assertFalse($res->json('enabled'), $surface);
            $this->assertSame([], $res->json('stats'), $surface);
        }
    }

    public function test_surfaces_are_managed_independently(): void
    {
        $this->makePaidOrder();
        Customer::factory()->create();

        // Website shows orders only; order app shows customers only.
        $this->enable('web', ['orders']);
        $this->enable('order', ['customers']);

        $webKeys = collect($this->getJson('/api/public-stats?surface=web')->json('stats'))->pluck('key');
        $orderKeys = collect($this->getJson('/api/public-stats?surface=order')->json('stats'))->pluck('key');

        $this->assertSame(['orders'], $webKeys->all());
        $this->assertSame(['customers'], $orderKeys->all());
    }

    public function test_order_types_are_separate_counters_not_combined(): void
    {
        // 2 retail, 1 catering event — must appear as two separate stats.
        $this->makePaidOrder();
        $this->makePaidOrder();
        CateringRequest::create([
            'contact_name' => 'Big Office',
            'phone' => '7900011',
            'occasion' => 'event',
            'status' => 'completed',
        ]);
        $this->enable('web', ['orders', 'wholesale', 'catering']);

        $stats = collect($this->getJson('/api/public-stats?surface=web')->json('stats'));

        $orders = $stats->firstWhere('key', 'orders');
        $catering = $stats->firstWhere('key', 'catering');
        $this->assertSame(2, $orders['value'], 'retail only — never combined with other types');
        $this->assertSame('Orders served', $orders['label']);
        $this->assertSame(1, $catering['value']);
        $this->assertSame('Events catered', $catering['label']);
        // Wholesale is enabled but zero → hides itself.
        $this->assertNull($stats->firstWhere('key', 'wholesale'));
    }

    public function test_displays_are_rounded_down_with_a_plus(): void
    {
        $service = app(PublicSiteStats::class);
        $method = new \ReflectionMethod($service, 'friendly');
        $this->assertSame('3', $method->invoke($service, 3));
        $this->assertSame('120+', $method->invoke($service, 127));
        $this->assertSame('12,500+', $method->invoke($service, 12543));
        $this->assertSame('1,000', $method->invoke($service, 1000));
    }

    public function test_settings_change_busts_the_surface_cache(): void
    {
        $this->makePaidOrder();
        $this->getJson('/api/public-stats?surface=web')->assertOk()->assertJson(['enabled' => false]);

        $this->enable('web', ['orders']);

        $this->assertTrue($this->getJson('/api/public-stats?surface=web')->json('enabled'));
    }

    public function test_settings_endpoint_is_gated_and_round_trips_both_surfaces(): void
    {
        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);
        $this->getJson('/api/admin/public-stats-settings')->assertStatus(403);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/admin/public-stats-settings', [
            'web' => ['enabled' => true, 'counters' => ['orders' => true, 'catering' => true]],
            'order' => ['enabled' => false],
        ])->assertOk()
            ->assertJsonPath('settings.web.enabled', true)
            ->assertJsonPath('settings.web.counters.catering', true)
            ->assertJsonPath('settings.order.enabled', false);

        $res = $this->getJson('/api/admin/public-stats-settings')->assertOk();
        $this->assertTrue($res->json('settings.web.counters.orders'));
        $this->assertFalse($res->json('settings.order.enabled'));
        $this->assertSame('Events catered', $res->json('counters.catering'));
    }

    public function test_home_page_uses_the_web_surface(): void
    {
        $this->makePaidOrder();

        // Only the ORDER surface enabled → website still shows nothing.
        $this->enable('order', ['orders']);
        $this->get('/')->assertOk()->assertDontSee('data-testid="public-stats"', false);

        $this->enable('web', ['orders']);
        $this->get('/')->assertOk()
            ->assertSee('data-testid="public-stats"', false)
            ->assertSee('Orders served');
    }

    public function test_revenue_is_never_offered_publicly(): void
    {
        $this->makePaidOrder(null, ['total_laar' => 123456]);
        $this->enable('web', array_keys(PublicSiteStats::COUNTERS));
        SiteSetting::set('public_stats_web_show_revenue', '1'); // hostile/mistaken key
        SiteSetting::bust();

        $content = $this->getJson('/api/public-stats?surface=web')->getContent();
        $this->assertStringNotContainsString('revenue', strtolower($content));
        $this->assertStringNotContainsString('1234', $content);
    }
}
