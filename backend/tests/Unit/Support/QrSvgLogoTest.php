<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\QrSvg;
use PHPUnit\Framework\TestCase;

/**
 * Owner, 2026-09-21: "Why no logo inside the qr code?" It was a second
 * picture the view laid on top, which only two of the five places that
 * print a code ever assembled, and which no PDF could. It goes inside the
 * SVG now, so one picture is the whole code.
 */
class QrSvgLogoTest extends TestCase
{
    /** A 1x1 transparent PNG. */
    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    public function test_the_logo_is_drawn_inside_the_code(): void
    {
        $svg = QrSvg::svg('https://bakeandgrill.mv/complain', 200, logo: self::PNG);

        $this->assertStringContainsString('<image ', $svg);
        $this->assertStringContainsString(self::PNG, $svg);
        // The attribute needs its namespace declared or the document is invalid.
        $this->assertStringContainsString('xmlns:xlink=', $svg);
        $this->assertStringContainsString('xlink:href=', $svg);
        $this->assertStringEndsWith('</svg>', trim($svg));
        $this->assertNotFalse(simplexml_load_string($svg), 'The code with a logo is still well-formed XML');
    }

    public function test_the_mark_sits_in_the_middle_and_leaves_the_code_readable(): void
    {
        $svg = QrSvg::svg('https://bakeandgrill.mv/complain', 200, logo: self::PNG);

        preg_match('#<image x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"#', $svg, $m);
        $this->assertNotEmpty($m, 'The logo is placed by number, not left to the renderer');
        [, $x, $y, $w, $h] = $m;

        // Square, centred, and about a quarter of the width — inside what the
        // highest error correction can lose.
        $this->assertSame($w, $h);
        $this->assertEqualsWithDelta((200 - (float) $w) / 2, (float) $x, 0.01);
        $this->assertEqualsWithDelta((float) $x, (float) $y, 0.01);
        $this->assertLessThanOrEqual(200 * 0.34, (float) $w);
        $this->assertGreaterThan(200 * 0.2, (float) $w);
    }

    public function test_a_logo_it_cannot_embed_leaves_a_bare_code_rather_than_a_broken_box(): void
    {
        // An SVG logo would be an SVG inside an SVG; a URL would have the PDF
        // renderer fetch our own site. Neither is drawn.
        foreach ([null, '', 'https://bakeandgrill.mv/logo.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', '/logo.png'] as $logo) {
            $this->assertNull(QrSvg::embeddable($logo), (string) $logo);
            $this->assertStringNotContainsString('<image ', QrSvg::svg('x', 120, logo: $logo));
        }
    }

    public function test_a_code_asked_for_without_a_logo_is_unchanged(): void
    {
        $plain = QrSvg::svg('https://bakeandgrill.mv/menu', 160);

        $this->assertStringNotContainsString('<image ', $plain);
        $this->assertStringNotContainsString('xmlns:xlink', $plain);
    }
}
