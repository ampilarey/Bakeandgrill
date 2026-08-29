<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Reporting\Services\PublicSiteStats;
use App\Models\Customer;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Public "social proof" counters: off by default, per-counter toggles,
 * rounded-down display, zero-hiding, cache busting on settings change,
 * the admin gate, and the rendered strips on the website home.
 */
class PublicStatsTest extends TestCase
{
    use RefreshDatabase;

    private function enableAll(): void
    {
        app(PublicSiteStats::class)->updateSettings([
            'enabled' => true,
            'show_orders' => true,
            'show_customers' => true,
            'show_visitors' => true,
        ]);
    }

    public function test_disabled_by_default_and_shows_nothing(): void
    {
        $this->makePaidOrder();

        $res = $this->getJson('/api/public-stats')->assertOk();
        $this->assertFalse($res->json('enabled'));
        $this->assertSame([], $res->json('stats'));
    }

    public function test_only_enabled_counters_appear(): void
    {
        $this->makePaidOrder();
        app(PublicSiteStats::class)->updateSettings([
            'enabled' => true,
            'show_orders' => true,
            'show_customers' => false,
            'show_visitors' => false,
        ]);

        $keys = collect($this->getJson('/api/public-stats')->json('stats'))->pluck('key');
        $this->assertTrue($keys->contains('orders'));
        $this->assertFalse($keys->contains('customers'));
        $this->assertFalse($keys->contains('visitors'));
    }

    public function test_displays_are_rounded_down_with_a_plus(): void
    {
        Customer::factory()->count(3)->create();
        $this->enableAll();

        $service = app(PublicSiteStats::class);
        $method = new \ReflectionMethod($service, 'friendly');
        $this->assertSame('3', $method->invoke($service, 3));
        $this->assertSame('120+', $method->invoke($service, 127));
        $this->assertSame('12,500+', $method->invoke($service, 12543));
        $this->assertSame('1,000', $method->invoke($service, 1000));
    }

    public function test_public_orders_counter_includes_wholesale_and_catering(): void
    {
        $this->makePaidOrder();
        \App\Models\CateringRequest::create([
            'contact_name' => 'Big Office',
            'phone' => '7900011',
            'occasion' => 'event',
            'status' => 'completed',
        ]);
        $this->enableAll();

        $orders = collect($this->getJson('/api/public-stats')->json('stats'))->firstWhere('key', 'orders');
        $this->assertSame(2, $orders['value'], 'retail + catering both count publicly');
    }

    public function test_zero_counters_hide_themselves(): void
    {
        // Orders enabled but none exist; customers exist.
        Customer::factory()->create();
        $this->enableAll();

        $keys = collect($this->getJson('/api/public-stats')->json('stats'))->pluck('key');
        $this->assertFalse($keys->contains('orders'));
        $this->assertTrue($keys->contains('customers'));
    }

    public function test_settings_change_busts_the_public_cache(): void
    {
        $this->makePaidOrder();
        $this->getJson('/api/public-stats')->assertOk()->assertJson(['enabled' => false]);

        $this->enableAll();

        $this->assertTrue($this->getJson('/api/public-stats')->json('enabled'));
    }

    public function test_settings_endpoint_is_gated(): void
    {
        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);
        $this->getJson('/api/admin/public-stats-settings')->assertStatus(403);
        $this->putJson('/api/admin/public-stats-settings', ['enabled' => true])->assertStatus(403);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/admin/public-stats-settings', ['enabled' => true, 'show_orders' => true])
            ->assertOk()
            ->assertJsonPath('settings.enabled', true);
        $this->assertTrue($this->getJson('/api/admin/public-stats-settings')->json('settings.show_orders'));
    }

    public function test_home_page_shows_the_strip_only_when_enabled(): void
    {
        $this->makePaidOrder();

        $this->get('/')->assertOk()->assertDontSee('data-testid="public-stats"', false);

        $this->enableAll();
        $home = $this->get('/')->assertOk();
        $home->assertSee('data-testid="public-stats"', false);
        $home->assertSee('Orders served');
    }

    public function test_revenue_is_never_offered_publicly(): void
    {
        $this->makePaidOrder(null, ['total_laar' => 123456]);
        $this->enableAll();
        SiteSetting::set('public_stats_show_revenue', '1'); // hostile/mistaken key
        SiteSetting::bust();

        $content = $this->getJson('/api/public-stats')->getContent();
        $this->assertStringNotContainsString('revenue', strtolower($content));
        $this->assertStringNotContainsString('1234', $content);
    }
}
