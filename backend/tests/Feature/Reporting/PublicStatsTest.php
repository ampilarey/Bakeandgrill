<?php

declare(strict_types=1);

namespace Tests\Feature\Reporting;

use App\Domains\Content\Blocks\PageBlockRepository;
use App\Domains\Reporting\Services\PublicSiteStats;
use App\Models\CateringRequest;
use App\Models\Customer;
use App\Models\PageBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Public "social proof" counters, configured as a "Public counters" block
 * in the Customer Surface Builder: nothing shows until the block is placed
 * on a surface's home layout, each surface (website / order app) is managed
 * independently through its own block, counters are separate per type,
 * displays are rounded down, zero counters hide, revenue is never offered.
 */
class PublicStatsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Add a public_stats block to a surface's home layout. $show lists the
     * counters to keep ON — every other counter is explicitly turned off.
     * Null means "no show_* keys at all" (the block's defaults: everything on).
     *
     * @param list<string>|null $show
     * @param array<string, mixed> $extraSettings
     */
    private function addBlock(
        string $app,
        ?array $show = null,
        bool $enabled = true,
        array $extraSettings = [],
    ): PageBlock {
        $settings = $extraSettings;
        if ($show !== null) {
            foreach (array_keys(PublicSiteStats::COUNTERS) as $key) {
                $settings["show_{$key}"] = in_array($key, $show, true);
            }
        }

        $block = PageBlock::create([
            'app' => $app,
            'page' => 'home',
            'block_type' => 'public_stats',
            'position' => 90,
            'is_enabled' => $enabled,
            'content_mode' => 'own',
            'settings' => $settings,
        ]);
        PageBlockRepository::bust($app);
        PublicSiteStats::bustCache();

        return $block;
    }

    public function test_no_counters_until_the_block_is_placed(): void
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

        // Website block shows orders only; order-app block customers only.
        $this->addBlock(PageBlock::APP_WEBSITE, ['orders']);
        $this->addBlock(PageBlock::APP_ORDER, ['customers']);

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
        $this->addBlock(PageBlock::APP_WEBSITE, ['orders', 'wholesale', 'catering']);

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

    public function test_missing_counter_settings_default_to_on(): void
    {
        $this->makePaidOrder();
        Customer::factory()->create();

        // A freshly-added block with no show_* keys shows every non-zero counter.
        $this->addBlock(PageBlock::APP_WEBSITE);

        $keys = collect($this->getJson('/api/public-stats?surface=web')->json('stats'))->pluck('key');
        $this->assertSame(['orders', 'customers'], $keys->all());
    }

    public function test_hidden_or_removed_blocks_serve_nothing(): void
    {
        $this->makePaidOrder();

        // Block present but turned off in the builder.
        $block = $this->addBlock(PageBlock::APP_WEBSITE, ['orders'], enabled: false);
        $this->getJson('/api/public-stats?surface=web')->assertOk()->assertJson(['enabled' => false]);

        // Turned on → serves; hidden on both devices → nothing again.
        $block->update(['is_enabled' => true]);
        PageBlockRepository::bust(PageBlock::APP_WEBSITE);
        $this->assertTrue($this->getJson('/api/public-stats?surface=web')->json('enabled'));

        $block->update(['settings' => ['show_desktop' => false, 'show_mobile' => false]]);
        PageBlockRepository::bust(PageBlock::APP_WEBSITE);
        $this->getJson('/api/public-stats?surface=web')->assertOk()->assertJson(['enabled' => false]);
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

    public function test_home_page_renders_the_websites_block_only(): void
    {
        $this->makePaidOrder();

        // Only the ORDER APP has the block → website still shows nothing.
        $this->addBlock(PageBlock::APP_ORDER, ['orders']);
        $this->get('/')->assertOk()->assertDontSee('data-testid="public-stats"', false);

        $this->addBlock(PageBlock::APP_WEBSITE, ['orders']);
        $this->get('/')->assertOk()
            ->assertSee('data-testid="public-stats"', false)
            ->assertSee('Orders served');
    }

    public function test_revenue_is_never_offered_publicly(): void
    {
        $this->makePaidOrder(null, ['total_laar' => 123456]);
        // Hostile/mistaken block setting must not conjure a revenue counter.
        $this->addBlock(PageBlock::APP_WEBSITE, null, extraSettings: ['show_revenue' => true]);

        $content = $this->getJson('/api/public-stats?surface=web')->getContent();
        $this->assertStringNotContainsString('revenue', strtolower($content));
        $this->assertStringNotContainsString('1234', $content);
    }
}
