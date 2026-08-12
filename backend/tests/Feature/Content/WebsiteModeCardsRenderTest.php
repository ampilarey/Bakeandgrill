<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\Blocks\HomeLayoutMigrator;
use App\Models\PageBlock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class WebsiteModeCardsRenderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        HomeLayoutMigrator::migrate();
    }

    public function test_website_home_renders_order_app_style_mode_cards(): void
    {
        // Website legacy defaults omit mode_cards; Surface Builder / admins add it.
        // Seed an enabled row after hero so the public home exercises the partial.
        $heroPos = (int) (PageBlock::query()
            ->where('app', 'website')
            ->where('page', 'home')
            ->where('block_type', 'hero')
            ->value('position') ?? 0);

        PageBlock::query()
            ->where('app', 'website')
            ->where('page', 'home')
            ->where('position', '>', $heroPos)
            ->increment('position');

        PageBlock::create([
            'app' => 'website',
            'page' => 'home',
            'block_type' => 'mode_cards',
            'position' => $heroPos + 1,
            'is_enabled' => true,
            'content_mode' => 'own',
            'settings' => [
                'show_desktop' => true,
                'show_mobile' => true,
                'placement_desktop' => 'home',
                'placement_mobile' => 'home',
            ],
        ]);

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('data-home-block="mode_cards"', $html);
        $this->assertStringContainsString('home-mode-cards', $html);
        $this->assertStringContainsString('data-testid="mode-entry-delivery"', $html);
        $this->assertStringContainsString('data-testid="mode-entry-pickup"', $html);
        $this->assertStringContainsString('data-testid="mode-entry-dine_in"', $html);
        $this->assertStringContainsString('Eat here', $html);
        $this->assertStringNotContainsString('>Dine-in</a>', $html);
        $this->assertStringContainsString('/order/images/mode-delivery.jpg', $html);
        $this->assertStringContainsString('/order/images/mode-pickup.jpg', $html);
    }
}
