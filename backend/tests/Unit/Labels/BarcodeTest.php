<?php

declare(strict_types=1);

namespace Tests\Unit\Labels;

use App\Domains\Labels\Barcode;
use PHPUnit\Framework\TestCase;

/** The sticker's EAN barcode (2026-10-12): check digits, module patterns, the SVG. */
class BarcodeTest extends TestCase
{
    public function test_a_check_digit_is_added_to_twelve_or_seven_digits_and_checked_on_thirteen_or_eight(): void
    {
        $this->assertSame('5901234123457', Barcode::normalise('590123412345'));
        $this->assertSame('5901234123457', Barcode::normalise('5901234123457'));
        $this->assertSame('5901234123457', Barcode::normalise('590 1234 12345 7'));
        $this->assertSame('96385074', Barcode::normalise('9638507'));
        $this->assertSame('96385074', Barcode::normalise('96385074'));
        // A wrong check digit, or the wrong number of digits, is refused.
        $this->assertNull(Barcode::normalise('5901234123450'));
        $this->assertNull(Barcode::normalise('12345'));
        $this->assertNull(Barcode::problem(''));
        $this->assertStringContainsString('12 or 13 digits', (string) Barcode::problem('12345'));
        $this->assertStringContainsString('last digit', (string) Barcode::problem('5901234123450'));
    }

    public function test_the_modules_follow_the_ean_tables(): void
    {
        $m13 = Barcode::modules('5901234123457');
        $this->assertSame(95, strlen($m13));
        $this->assertStringStartsWith('101', $m13);
        $this->assertStringEndsWith('101', $m13);
        $this->assertSame('01010', substr($m13, 45, 5));
        // First digit 5 → LGGLLG for the left half: digit 9 in L is 0001011, digit 0 in G is 0100111.
        $this->assertSame('0001011', substr($m13, 3, 7));
        $this->assertSame('0100111', substr($m13, 10, 7));
        $this->assertSame(67, strlen(Barcode::modules('96385074')));
    }

    public function test_the_svg_is_a_data_uri_with_quiet_zones_and_the_digits_are_grouped(): void
    {
        $uri = Barcode::svgDataUri('5901234123457');
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $uri);
        $svg = base64_decode(substr($uri, strlen('data:image/svg+xml;base64,')));
        $this->assertStringContainsString('viewBox="0 0 109 100"', $svg, '95 modules plus a 7-module quiet zone each side');
        $this->assertStringContainsString('width="109" height="100"', $svg);
        $this->assertStringContainsString('<rect x="7" y="0" width="1" height="100"/>', $svg, 'the first guard bar after the quiet zone');
        $this->assertSame('5 901234 123457', Barcode::text('5901234123457'));
        $this->assertSame('9638 5074', Barcode::text('96385074'));
    }
}
