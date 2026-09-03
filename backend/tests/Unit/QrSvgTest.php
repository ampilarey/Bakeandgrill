<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\QrSvg;
use PHPUnit\Framework\TestCase;

class QrSvgTest extends TestCase
{
    public function test_renders_an_svg_and_a_data_uri_for_it(): void
    {
        $svg = QrSvg::svg('https://bakeandgrill.mv/receipts/abc', 120);
        $this->assertStringStartsWith('<?xml', $svg);
        $this->assertStringContainsString('<svg', $svg);

        $uri = QrSvg::dataUri('https://bakeandgrill.mv/receipts/abc', 120);
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $uri);
        $this->assertStringContainsString('<svg', base64_decode(substr($uri, strlen('data:image/svg+xml;base64,'))));
    }
}
