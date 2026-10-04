<?php

declare(strict_types=1);

namespace Tests\Unit\Labels;

use App\Support\ThaanaVisual;
use Tests\TestCase;

/**
 * dompdf draws characters in stored order, left to right, so Thaana came out
 * mirrored in every PDF (2026-10-04). ThaanaVisual hands it visual order.
 */
class ThaanaVisualTest extends TestCase
{
    public function test_a_word_is_reversed_by_letter_keeping_each_fili_on_its_letter(): void
    {
        // މާލެ = މ ާ ލ ެ ; visual left-to-right: ލެ then މާ.
        $this->assertSame("\u{078D}\u{07AC}\u{0789}\u{07A7}", ThaanaVisual::order("\u{0789}\u{07A7}\u{078D}\u{07AC}"));
    }

    public function test_words_come_out_in_reverse_order_with_punctuation_on_its_word(): void
    {
        $a = "\u{0789}\u{07A7}";        // first word
        $b = "\u{078D}\u{07AC}";        // second word
        $comma = "\u{060C}";
        $out = ThaanaVisual::order($a . $comma . ' ' . $b);
        // Visual: second word, space, comma, first word (each reversed).
        $this->assertSame(ThaanaVisual::order($b) . ' ' . $comma . ThaanaVisual::order($a), $out);
    }

    public function test_latin_and_numbers_inside_dhivehi_keep_their_own_order(): void
    {
        $word = "\u{078E}\u{07A6}\u{0787}\u{07A8}"; // ގައި
        $out = ThaanaVisual::order($word . ' -18°C ' . $word);
        $this->assertStringContainsString('-18°C', $out);
        $this->assertStringContainsString('bakeandgrill.mv', ThaanaVisual::order($word . ' bakeandgrill.mv'));
    }

    public function test_brackets_are_mirrored_inside_right_to_left_text(): void
    {
        $w = "\u{0789}\u{07A7}";
        // Logical "(word)" reads right to left: the mirrored pair still encloses it.
        $this->assertSame('(' . ThaanaVisual::order($w) . ')', ThaanaVisual::order('(' . $w . ')'));
    }

    public function test_text_without_thaana_and_empty_text_pass_through(): void
    {
        $this->assertSame('', ThaanaVisual::order(''));
        $this->assertSame('KEEP FROZEN -18°C', ThaanaVisual::order('KEEP FROZEN -18°C'));
    }

    public function test_wrap_breaks_by_measured_width_in_logical_order(): void
    {
        $text = 'ފުށް، ލޮނު، ތެޔޮ، ކާށި، ފިޔާ، އިނގުރު، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް';
        $lines = ThaanaVisual::wrap($text, 10, 40);
        $this->assertGreaterThan(1, count($lines));
        $this->assertSame(preg_replace('/\s+/u', ' ', $text), implode(' ', $lines));
        foreach ($lines as $line) {
            $this->assertLessThanOrEqual(40.0, ThaanaVisual::widthMm($line, 10), $line);
        }
        $this->assertSame([], ThaanaVisual::wrap('  ', 10, 40));
    }
}
