<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Models\PageBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PageBlockRenderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        HomeLayoutMigrator::migrate();
    }

    public function test_website_home_loads_blocks_in_a_single_query(): void
    {
        Cache::flush();
        DB::flushQueryLog();
        DB::enableQueryLog();

        $this->get('/')->assertOk();

        $blockQueries = collect(DB::getQueryLog())
            ->filter(fn (array $q) => str_contains($q['query'], 'page_blocks'))
            ->count();

        $this->assertSame(1, $blockQueries, 'Expected exactly one page_blocks query per home render.');
    }

    public function test_unknown_block_type_renders_nothing_and_does_not_error(): void
    {
        PageBlock::create([
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'spaceship_from_future',
            'position' => 0,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => [],
        ]);
        // Put unknown first so walker hits it early.
        PageBlock::query()->where('block_type', '!=', 'spaceship_from_future')
            ->where('app', 'website')
            ->update(['position' => DB::raw('position + 1')]);

        Cache::flush();
        $this->get('/')->assertOk()->assertSee('hero-banner', false);
    }

    public function test_trust_strip_still_renders_when_website_hero_block_is_disabled(): void
    {
        PageBlock::query()
            ->where('app', 'website')
            ->where('block_type', 'hero')
            ->update(['is_enabled' => false]);
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringNotContainsString('class="hero-banner"', $html, 'Disabled hero must not render.');
        // Legacy behaviour: the trust strip is independent of the hero and
        // must keep its historical placement even when the hero is off.
        $this->assertStringContainsString('class="trust-strip"', $html);
    }

    public function test_empty_page_blocks_degrades_without_blank_page(): void
    {
        PageBlock::query()->delete();
        Cache::flush();

        $html = $this->get('/')->assertOk()->getContent();
        $this->assertNotSame('', trim(strip_tags($html)));
        // Stage F: no legacy section order any more. An empty layout renders
        // the required chrome only — trust strip plus the layout brand footer —
        // and never a blank page.
        $this->assertStringContainsString('class="trust-strip"', $html);
        $this->assertStringContainsString('site-footer', $html);
        $this->assertStringNotContainsString('class="cta-band-inner"', $html, 'Empty layout must not resurrect removed sections.');
        $this->assertStringNotContainsString('class="proof-strip"', $html, 'Empty layout must not resurrect removed sections.');
    }

    public function test_public_page_blocks_endpoint_returns_enabled_known_blocks(): void
    {
        PageBlock::create([
            'app' => 'order_app',
            'page' => 'home',
            'block_type' => 'ghost_type',
            'position' => 99,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => [],
        ]);

        $res = $this->getJson('/api/page-blocks?app=order_app')->assertOk();
        $types = collect($res->json('blocks'))->pluck('block_type')->all();
        $this->assertNotContains('ghost_type', $types);
        $this->assertContains('mode_cards', $types);
        $this->assertContains('brand_footer', $types);
    }

    public function test_preview_token_required_for_draft_layout_and_public_unaffected(): void
    {
        $publicTypes = collect($this->getJson('/api/page-blocks?app=order_app')->json('blocks'))
            ->pluck('block_type')
            ->all();

        $this->getJson('/api/page-blocks?app=order_app&preview_token=not-a-real-token')
            ->assertStatus(403);

        $this->assertSame(
            $publicTypes,
            collect($this->getJson('/api/page-blocks?app=order_app')->json('blocks'))
                ->pluck('block_type')
                ->all(),
        );
    }
}
