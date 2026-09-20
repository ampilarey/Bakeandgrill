<?php

declare(strict_types=1);

namespace App\Domains\Menu\Services;

use setasign\Fpdi\Fpdi;

/**
 * Turns a run of A5 pages into A4 landscape sheets, two pages a side, in
 * the order that folds into a booklet.
 *
 * Owner, 2026-09-21: "sometimes we will be downloading and printing menu to
 * make as a book or booklet." A booklet is a stack of sheets folded once
 * and stapled in the middle, so the pages on one sheet are not neighbours:
 * the outermost sheet of an eight-page booklet carries pages 8 and 1 on its
 * front and 2 and 7 on its back. Print two-sided, flip on the short edge,
 * fold the stack in half.
 *
 * The page count is padded to a multiple of four with blanks before the
 * last page, so the back cover stays the back cover.
 */
class BookletImposer
{
    public const SHEET_W = 297.0;

    public const SHEET_H = 210.0;

    public const PAGE_W = 148.5;

    /**
     * @param string $pdf A PDF of A5 portrait pages (dompdf output).
     * @return string A PDF of A4 landscape sheets.
     */
    public function impose(string $pdf): string
    {
        $source = tempnam(sys_get_temp_dir(), 'booklet');
        if ($source === false) {
            throw new \RuntimeException('Could not open a temporary file for the booklet.');
        }

        try {
            file_put_contents($source, $pdf);

            $out = new Fpdi('L', 'mm', 'A4');
            $out->SetAutoPageBreak(false);
            $out->SetTitle('Menu booklet');
            $count = $out->setSourceFile($source);

            foreach ($this->sheets($count) as [$left, $right]) {
                $out->AddPage('L', 'A4');
                $this->place($out, $left, 0.0);
                $this->place($out, $right, self::PAGE_W);
            }

            return $out->Output('S');
        } finally {
            @unlink($source);
        }
    }

    /**
     * The order the pages go down on the sheets: for N pages (padded to a
     * multiple of four), sheet k is [N-2k, 1+2k] on its front and
     * [2+2k, N-1-2k] on its back. Null is a blank.
     *
     * @return list<array{0: ?int, 1: ?int}>
     */
    public function sheets(int $pageCount): array
    {
        $pages = $this->padded($pageCount);
        $n = count($pages);
        $sides = [];
        for ($k = 0; $k < $n / 4; $k++) {
            $sides[] = [$pages[$n - 1 - 2 * $k], $pages[2 * $k]];
            $sides[] = [$pages[1 + 2 * $k], $pages[$n - 2 - 2 * $k]];
        }

        return $sides;
    }

    /**
     * The source pages in reading order with blanks added before the last
     * page until the count is a multiple of four.
     *
     * @return list<?int>
     */
    public function padded(int $pageCount): array
    {
        if ($pageCount < 1) {
            return [null, null, null, null];
        }
        $pages = range(1, $pageCount);
        $last = array_pop($pages);
        while ((count($pages) + 1) % 4 !== 0) {
            $pages[] = null;
        }
        $pages[] = $last;

        return $pages;
    }

    private function place(Fpdi $out, ?int $page, float $x): void
    {
        if ($page === null) {
            return;
        }
        $template = $out->importPage($page);
        $out->useTemplate($template, ['x' => $x, 'y' => 0.0, 'width' => self::PAGE_W, 'height' => self::SHEET_H]);
    }
}
