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
    public function test_a_word_is_reversed_with_each_fili_just_before_its_letter(): void
    {
        // މާލެ = މ ާ ލ ެ ; visual left-to-right: ެ ލ ާ މ (mark, then its letter).
        $this->assertSame("\u{07AC}\u{078D}\u{07A7}\u{0789}", ThaanaVisual::order("\u{0789}\u{07A7}\u{078D}\u{07AC}"));
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

    /**
     * 2026-10-12: Noto's fili drifted off wide letters in the PDF, because
     * dompdf ignores the anchors the font positions them by. A composed face
     * (scripts/thaana-composed-font.py) carries each letter + fili as one
     * glyph, and the PDF text names those.
     */
    public function test_with_a_composed_face_each_letter_and_its_fili_become_one_pair_glyph(): void
    {
        $pairs = json_decode((string) file_get_contents(base_path('../fixtures/thaana_pairs.json')), true);
        $this->assertSame(ThaanaVisual::PAIR_BASE, $pairs['base']);
        foreach ($pairs['examples'] as $from => $to) {
            [$letter, $mark] = array_map(fn ($h) => hexdec($h), explode('+', $from));
            $this->assertSame(mb_chr(hexdec($to), 'UTF-8'), ThaanaVisual::pair($letter, $mark), $from);
        }
        // BAA (U+0784, the 5th letter) + ABAFILI (the first mark) = U+E040.
        $this->assertSame("\u{E040}", ThaanaVisual::pair(0x0784, 0x07A6));
        // Not a letter, not a mark, or a mark where the letter should be: no pair.
        $this->assertNull(ThaanaVisual::pair(0x0041, 0x07A6));
        $this->assertNull(ThaanaVisual::pair(0x0784, 0x0784));
        $this->assertNull(ThaanaVisual::pair(0x07A6, 0x07A6));

        // މާލެ: visual order puts ލެ first, each pair as its glyph.
        $this->assertSame(
            ThaanaVisual::pair(0x078D, 0x07AC) . ThaanaVisual::pair(0x0789, 0x07A7),
            ThaanaVisual::order("\u{0789}\u{07A7}\u{078D}\u{07AC}", true),
        );
        // A letter without a fili stays itself; Latin keeps its order; the plain face is untouched.
        $this->assertSame("\u{0784}" . ThaanaVisual::pair(0x0789, 0x07A7), ThaanaVisual::order("\u{0789}\u{07A7}\u{0784}", true));
        $this->assertStringContainsString('-18°C', ThaanaVisual::order("\u{0789}\u{07A7} -18°C", true));
        $this->assertSame("\u{07A7}\u{0789}", ThaanaVisual::order("\u{0789}\u{07A7}"));
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
