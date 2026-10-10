<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\UiIcon;
use PHPUnit\Framework\TestCase;

/** Drawn icons in place of emoji on the website (UI audit, 2026-10-10). */
class UiIconTest extends TestCase
{
    public function test_typed_emoji_map_to_icons_with_or_without_the_variation_selector(): void
    {
        $this->assertSame('utensils', UiIcon::forEmoji('🍽️'));
        $this->assertSame('utensils', UiIcon::forEmoji('🍽'));
        $this->assertSame('shopping-bag', UiIcon::forEmoji('🏪'));
        $this->assertNull(UiIcon::forEmoji('🦄'));
    }

    public function test_a_known_leading_emoji_becomes_the_icon(): void
    {
        $this->assertSame(['icon' => 'message-circle', 'text' => 'WhatsApp'], UiIcon::split('💬 WhatsApp'));
        $this->assertSame(['icon' => null, 'text' => '🦄 Unicorn'], UiIcon::split('🦄 Unicorn'));

        $html = UiIcon::label('📍 Find Us')->toHtml();
        $this->assertStringContainsString('<svg class="ui-icon"', $html);
        $this->assertStringContainsString('<span>Find Us</span>', $html);
        $this->assertStringNotContainsString('📍', $html);
    }

    public function test_label_draws_the_fallback_and_escapes_the_wording(): void
    {
        $html = UiIcon::label('Opening <hours>', 'clock')->toHtml();
        $this->assertStringContainsString('<svg class="ui-icon"', $html);
        $this->assertStringContainsString('Opening &lt;hours&gt;', $html);
        $this->assertSame('Plain', UiIcon::label('Plain')->toHtml());
    }

    public function test_the_order_app_knows_the_same_emoji(): void
    {
        // Keep in step with apps/online-order-web/src/utils/emojiIcon.tsx.
        $ts = (string) file_get_contents(__DIR__.'/../../../../apps/online-order-web/src/utils/emojiIcon.tsx');
        $this->assertNotSame('', $ts);
        $body = preg_match('/const EMOJI_ICONS[^{]*\{(.*?)\n\};/s', $ts, $m) ? $m[1] : '';
        preg_match_all("/'([^']+)':\s*[A-Z]/u", $body, $keys);
        $orderApp = $keys[1];
        sort($orderApp);

        $website = array_keys((new \ReflectionClass(UiIcon::class))->getConstant('EMOJI'));
        $website = array_map('strval', $website);
        sort($website);

        $this->assertSame($website, $orderApp);
    }

    public function test_every_mapped_emoji_has_a_drawn_shape(): void
    {
        $map = (new \ReflectionClass(UiIcon::class))->getConstant('EMOJI');
        foreach ($map as $emoji => $icon) {
            $this->assertTrue(UiIcon::has($icon), "{$emoji} maps to {$icon}, which has no shape");
        }
    }
}
