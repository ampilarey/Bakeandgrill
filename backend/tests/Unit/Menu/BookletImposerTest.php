<?php

declare(strict_types=1);

namespace Tests\Unit\Menu;

use App\Domains\Menu\Services\BookletImposer;
use PHPUnit\Framework\TestCase;

/**
 * The order pages go down on the sheets of a booklet. Get this wrong and
 * the stapled book reads 1, 4, 3, 2 — which nobody notices until the
 * whole run is printed.
 */
class BookletImposerTest extends TestCase
{
    public function test_eight_pages_fold_into_two_sheets(): void
    {
        $sheets = (new BookletImposer)->sheets(8);

        $this->assertSame([
            [8, 1], [2, 7],
            [6, 3], [4, 5],
        ], $sheets);
    }

    public function test_a_count_that_is_not_a_multiple_of_four_pads_before_the_back_cover(): void
    {
        $imposer = new BookletImposer;

        // Cover, three inner pages, back cover: the two blanks go before the
        // back cover, so it stays on the outside of the book.
        $this->assertSame([1, 2, 3, 4, null, null, null, 5], $imposer->padded(5));
        $this->assertSame([1, 2, 3, 4], $imposer->padded(4));
        $this->assertSame([1, null, null, 2], $imposer->padded(2));

        $this->assertSame([
            [5, 1], [2, null],
            [null, 3], [4, null],
        ], $imposer->sheets(5));
    }

    public function test_every_page_lands_exactly_once(): void
    {
        foreach ([1, 4, 6, 9, 13, 20] as $count) {
            $placed = [];
            foreach ((new BookletImposer)->sheets($count) as [$left, $right]) {
                foreach ([$left, $right] as $page) {
                    if ($page !== null) {
                        $placed[] = $page;
                    }
                }
            }
            sort($placed);
            $this->assertSame(range(1, $count), $placed, "Every one of {$count} pages, once");
        }
    }
}
