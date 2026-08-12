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
        $this->assertTrue(
            PageBlock::query()
                ->where('app', 'website')
                ->where('page', 'home')
                ->where('block_type', 'mode_cards')
                ->where('is_enabled', true)
                ->exists(),
            'CustomerSurfaceMigrator must seed website mode_cards.',
        );

        $html = $this->get('/')->assertOk()->getContent();

        $this->assertStringContainsString('data-home-block="mode_cards"', $html);
        $this->assertStringContainsString('home-mode-cards', $html);
        $this->assertStringContainsString('data-testid="mode-entry-delivery"', $html);
        $this->assertStringContainsString('data-testid="mode-entry-pickup"', $html);
        $this->assertStringContainsString('data-testid="mode-entry-dine_in"', $html);
        $this->assertStringContainsString('Eat here', $html);
        $this->assertStringNotContainsString('>Dine-in</a>', $html);
        $this->assertStringContainsString('/images/modes/mode-delivery.jpg', $html);
        $this->assertStringContainsString('/images/modes/mode-pickup.jpg', $html);
        $this->assertStringContainsString('min-width: 0', $html);
        $this->assertStringNotContainsString('calc(50% - 0.5rem)', $html);
    }
}
