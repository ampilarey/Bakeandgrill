<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Marketing\Support\ItemNameSimilarity;
use PHPUnit\Framework\TestCase;

/**
 * Every name in here is a real one from the menu export
 * (database/seeders/export_items.csv), because the whole value of this rule is
 * how it behaves on the actual products — a rule tuned on invented names would
 * be tuned on nothing.
 */
class ItemNameSimilarityTest extends TestCase
{
    /**
     * The pairs that made this worth building.
     *
     * @return array<string, array{string, string}>
     */
    public static function sameThingTwice(): array
    {
        return [
            'a burger in two sizes' => ['Burger small', 'Burger (big)'],
            'a sandwich in two sizes' => ['Club sandwich S', 'Club sandwich full'],
            'the same product entered twice' => ['G boakibaa', 'G.boakibaa'],
            'a drink in two sizes' => ['Coke small', 'Coke large'],
            'case and spacing only' => ['Cream bun', 'cream  BUN'],
        ];
    }

    /** @dataProvider sameThingTwice */
    public function test_it_refuses_to_suggest_the_same_thing_in_another_size(string $a, string $b): void
    {
        $this->assertTrue(
            ItemNameSimilarity::areNearDuplicates($a, $b),
            "'{$a}' and '{$b}' are the same product — suggesting one for the other reads as a bug",
        );
    }

    /**
     * The pairs that must survive. These are the shop's real baskets, and a
     * rule that suppresses them is worse than no rule.
     *
     * @return array<string, array{string, string}>
     */
    public static function genuinelyDifferent(): array
    {
        return [
            // Two fillings of the same snack. People buy both at once — this is
            // the single most common basket in the shop.
            'two kinds of gulha' => ['F.gulha', 'H.gulha'],
            'two shorteats' => ['Bajiya', 'Cutlet'],
            'a snack and a drink' => ['Bajiya', 'Black tea'],
            'the classic upsell' => ['Burger small', 'Chicken n chips'],
            'two teas' => ['Black tea', 'Cardamom tea'],
            'two cold drinks' => ['Coke small', 'Fanta orange small'],
            'similar but not the same' => ['Bileh ari', 'Bileh gandu'],
            'sandwich vs submarine' => ['Chicken sandwich', 'Chicken submarine'],
        ];
    }

    /** @dataProvider genuinelyDifferent */
    public function test_it_leaves_real_pairings_alone(string $a, string $b): void
    {
        $this->assertFalse(
            ItemNameSimilarity::areNearDuplicates($a, $b),
            "'{$a}' and '{$b}' are different products and must still be allowed to pair",
        );
    }

    public function test_a_size_word_inside_a_name_is_not_stripped(): void
    {
        // Only standalone tokens are size words. Otherwise an item that simply
        // contains those letters loses its identity.
        $this->assertSame('smalltown special', ItemNameSimilarity::baseName('Smalltown Special'));
        $this->assertSame('fullerton cake', ItemNameSimilarity::baseName('Fullerton Cake'));
    }

    public function test_punctuation_becomes_a_boundary_rather_than_vanishing(): void
    {
        // "G.boakibaa" must meet "G boakibaa" in the middle. Deleting the dot
        // outright would give "gboakibaa" and the two would never match.
        $this->assertSame('g boakibaa', ItemNameSimilarity::baseName('G.boakibaa'));
        $this->assertSame('g boakibaa', ItemNameSimilarity::baseName('G boakibaa'));
        // And the same rule must keep these apart.
        $this->assertSame('f gulha', ItemNameSimilarity::baseName('F.gulha'));
        $this->assertSame('h gulha', ItemNameSimilarity::baseName('H.gulha'));
    }

    public function test_a_name_that_is_only_a_size_word_matches_nothing(): void
    {
        // It normalises to empty; treating empty as equal would pair every such
        // item with every other.
        $this->assertSame('', ItemNameSimilarity::baseName('Large'));
        $this->assertFalse(ItemNameSimilarity::areNearDuplicates('Large', 'Small'));
        $this->assertFalse(ItemNameSimilarity::areNearDuplicates('Large', 'Bajiya'));
    }

    public function test_an_empty_or_symbol_only_name_is_handled(): void
    {
        $this->assertSame('', ItemNameSimilarity::baseName(''));
        $this->assertSame('', ItemNameSimilarity::baseName('   '));
        $this->assertSame('', ItemNameSimilarity::baseName('---'));
        $this->assertFalse(ItemNameSimilarity::areNearDuplicates('', ''));
    }

    public function test_a_dhivehi_name_is_not_mangled_into_nothing(): void
    {
        // Thaana is stripped by the a-z0-9 normalisation, so two different
        // Dhivehi names would both reduce to empty — and empty never matches,
        // which is the safe outcome: they stay pairable.
        $this->assertFalse(ItemNameSimilarity::areNearDuplicates('ބަޖިޔާ', 'ގުޅަ'));
    }

    // ── The filter used by the suggestion surfaces ────────────────────────

    public function test_it_drops_only_the_twin_from_a_candidate_list(): void
    {
        $candidates = [
            1 => 'Burger (big)',
            2 => 'Chicken n chips',
            3 => 'Coke small',
        ];

        $this->assertSame(
            [2, 3],
            ItemNameSimilarity::rejectNearDuplicates($candidates, ['Burger small']),
            'the big burger goes; chips and a drink stay',
        );
    }

    public function test_it_checks_against_every_item_in_the_basket(): void
    {
        $candidates = [
            1 => 'Burger (big)',
            2 => 'Coke large',
            3 => 'Bajiya',
        ];

        $this->assertSame(
            [3],
            ItemNameSimilarity::rejectNearDuplicates($candidates, ['Burger small', 'Coke small']),
        );
    }

    public function test_an_empty_basket_rejects_nothing(): void
    {
        $candidates = [1 => 'Burger (big)', 2 => 'Bajiya'];

        $this->assertSame([1, 2], ItemNameSimilarity::rejectNearDuplicates($candidates, []));
    }

    public function test_a_shorteats_basket_keeps_all_its_shorteats(): void
    {
        // The rule this replaced — suppressing same-category pairings — would
        // have emptied this list. That is the normal basket here.
        $candidates = [1 => 'Bajiya', 2 => 'Cutlet', 3 => 'Bis keemia', 4 => 'Egg cutlets'];

        $this->assertSame(
            [1, 2, 3, 4],
            ItemNameSimilarity::rejectNearDuplicates($candidates, ['F.gulha', 'H.gulha']),
        );
    }
}
