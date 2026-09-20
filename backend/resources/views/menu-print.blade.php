@php
    /**
     * The menu, for paper.
     *
     * Owner, 2026-09-05: "make a print option. Make different options. Short
     * version, details ect." Then: "Enhance the layout of the print page. Add
     * logo. Make visual. Add pdf share option." And 2026-09-21: "paper size
     * options, a5, a4, a3. Portrait, landscape, logo and branding in each
     * page without taking more space … printing menu to make as a book or
     * booklet."
     *
     * Standalone rather than an extension of the site layout: a printed menu
     * has no navigation, no cart, no cookie notice and no footer, and
     * inheriting a layout only to hide most of it leaves those things one CSS
     * rule away from turning up on somebody's paper.
     *
     * Rendered by a browser *and* by dompdf, off this one file. That is why
     * rows are tables rather than flexbox and why nothing depends on CSS
     * variables: dompdf supports neither, and two templates to keep in step
     * would drift the first time one of them learned a new field.
     *
     * The running header and footer are the one place the two renderers
     * part ways. A browser repeats a table's <thead> and <tfoot> on every
     * printed page, so the sheet sits in a table with the brand line above
     * and the foot line below. dompdf does not repeat a <tfoot>, but it does
     * paint a `position: fixed` block on every page and lets the controller
     * write text after layout — so the PDF's header is a fixed block and its
     * footer, with the page numbers only the PDF can know, is drawn by
     * MenuPageController::renderPdf.
     */
    $money = static fn ($n) => number_format((float) $n, 2);
    $forPdf = $forPdf ?? false;
    $booklet = $booklet ?? false;
    $columns = max(1, (int) ($columns ?? 1));
    $paper = $paper ?? 'a4';
    $orient = $orient ?? 'portrait';
    $pageSize = $pageSize ?? 'A4 portrait';
    $pageWidthMm = $pageWidthMm ?? 210;
    $dhivehiFontFile = $dhivehiFontFile ?? null;
    $brandHours = $brandHours ?? [];
    $complaintLine = $complaintLine ?? '';
    $complaintQr = $complaintQr ?? '';
    $styleLabels = ['short' => 'Short list', 'full' => 'With details', 'wall' => 'Large / wall'];
    // Every toolbar link carries the whole choice, so switching the paper
    // keeps the layout and the language, and the other way round.
    $printQuery = static function (array $over = []) use ($printStyle, $paper, $orient, $showDhivehi): array {
        $q = ['style' => $printStyle, 'paper' => $paper, 'orient' => $orient] + ($showDhivehi ? ['dv' => 1] : []);
        foreach ($over as $k => $v) {
            if ($v === null) {
                unset($q[$k]);
            } else {
                $q[$k] = $v;
            }
        }

        return $q;
    };
    // Type sizes follow the paper: A5 is read in the hand, A3 across a room.
    $scale = match ($paper) { 'a5' => 0.88, 'a3' => 1.18, default => 1 };
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $brand }} — menu</title>
    <style>
        /* The paper the sheet is laid out for; the browser's print dialog and
           dompdf both read it. The PDF leaves room above and below for the
           running header and footer, which sit in the margin. */
        @page { size: {{ $pageSize }}; margin: {{ $forPdf ? '20mm 12mm 18mm' : '10mm 12mm 11mm' }}; }

        * { box-sizing: border-box; }

        html { font-size: {{ 16 * $scale }}px; }

        body {
            margin: 0;
            padding: 0 0 3rem;
            background: #f4f1ec;
            color: #1c1408;
            font-family: Georgia, 'Times New Roman', serif;
            line-height: 1.4;
        }
@if ($forPdf && $dhivehiFontFile)
        /* Thaana. The PDF's own fonts have none, so a sheet asked for in
           Dhivehi came out as boxes. Embedded from disk, never fetched. */
        @font-face {
            font-family: 'BakeDhivehi';
            font-style: normal;
            font-weight: 400;
            src: url('{{ $dhivehiFontFile }}') format('truetype');
        }
@endif

        /* ── The toolbar. Never printed, never in the PDF. ───────────── */
        .toolbar {
            position: sticky;
            top: 0;
            z-index: 5;
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            align-items: center;
            padding: 0.6rem 1rem;
            background: #fff;
            border-bottom: 1px solid #d9d2c8;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 16px;
        }

        .toolbar__group {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.2rem 0.35rem;
            border-radius: 10px;
            background: #f4f1ec;
        }

        .toolbar__label {
            font-size: 0.75rem;
            font-weight: 700;
            color: #6b5d4f;
            margin: 0 0.15rem 0 0.3rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .toolbar a,
        .toolbar button {
            font: inherit;
            font-size: 0.875rem;
            font-weight: 600;
            /* Tall enough to hit on a phone; the row was 31px. */
            display: inline-flex;
            align-items: center;
            min-height: 40px;
            padding: 0.45rem 0.8rem;
            border: 1.5px solid #d9d2c8;
            border-radius: 8px;
            background: #fff;
            color: #1c1408;
            text-decoration: none;
            cursor: pointer;
        }

        .toolbar__group a { min-height: 34px; padding: 0.3rem 0.65rem; }

        .toolbar a.is-on {
            border-color: #d4813a;
            background: #d4813a;
            color: #fff;
        }

        /*
         * Written as `.toolbar a.toolbar__back` on purpose: `.toolbar a` above
         * is the more specific selector, so a bare `.toolbar__back` block loses
         * every property it shares with it and the rule reads as if it works.
         *
         * Kept as a pill like the rest — same tap target, and on a phone this
         * is the control somebody reaches for when they are stuck, so it should
         * not be the smallest thing on the row. Muted text and a gap after it
         * so it does not read as a fourth layout choice.
         */
        .toolbar a.toolbar__back {
            color: #6b5d4f;
            margin-right: 0.4rem;
        }

        .toolbar__spacer { margin-left: auto; }

        .toolbar__pdf,
        .toolbar__booklet {
            border-color: #1c1408;
            background: #1c1408;
            color: #fff;
        }

        .toolbar a.toolbar__booklet { background: #fff; color: #1c1408; }

        .toolbar__print {
            border-color: #d4813a;
            background: #d4813a;
            color: #fff;
        }

        .toolbar__share {
            border-color: #1c1408;
            background: #1c1408;
            color: #fff;
        }

        .toolbar__share[disabled] { opacity: 0.6; }

        .toolbar__hint {
            width: 100%;
            margin: -0.2rem 0 0;
            font-size: 0.75rem;
            color: #6b5d4f;
        }

        /* ── The page: running header, sheet, running footer ─────────── */
        .page { width: 100%; border-collapse: collapse; }
        .page > thead > tr > td,
        .page > tfoot > tr > td,
        .page > tbody > tr > td { padding: 0; }

        .sheet {
            max-width: {{ $pageWidthMm }}mm;
            margin: 1.25rem auto;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 1px 10px rgba(0, 0, 0, 0.08);
        }

        /* The brand line on every page. Owner: "logo and branding in each
           page without taking more space" — one 7mm line, logo and name at
           the left, what the sheet is at the right, a hairline under. On
           screen it is hidden: the page has its masthead and toolbar. */
        .run {
            width: 100%;
            border-collapse: collapse;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 0.68rem;
            color: #6b5d4f;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .run td { padding: 0; vertical-align: middle; }
        .run--head { border-bottom: 1px solid #d9d2c8; }
        .run--head td { padding-bottom: 2mm; }
        .run--foot { border-top: 1px solid #d9d2c8; }
        .run--foot td { padding-top: 2mm; }
        .run__logo {
            width: 7mm; height: 7mm; border-radius: 50%;
            object-fit: cover; vertical-align: middle; margin-right: 2mm;
        }
        .run__brand { font-weight: 700; color: #1c1408; }
        .run__right { text-align: right; }
        .run--screen { display: none; }

        /* ── Masthead ────────────────────────────────────────────────── */
        .masthead { text-align: center; }

        .masthead__logo {
            width: 74px;
            height: 74px;
            border-radius: 50%;
            object-fit: cover;
            margin-bottom: 6px;
        }

        .masthead h1 {
            margin: 0;
            font-size: 2rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .masthead__tagline {
            margin: 4px 0 0;
            font-size: 0.8rem;
            font-style: italic;
            color: #6b5d4f;
        }

        /* A finial and a rule, stacked. The pretty version — a diamond
           knocked out of the middle of the line — needs negative positioning
           and a glyph dompdf may not carry, and it landed on top of the
           tagline in the PDF. Stacked reads as deliberate in both renderers. */
        .rule-mark {
            margin: 8px 0 3px;
            text-align: center;
            color: #d4813a;
            font-size: 13px;
            line-height: 1;
            letter-spacing: 4px;
        }

        .rule-line {
            border-top: 2px solid #1c1408;
            margin-bottom: 12px;
        }

        .masthead__meta {
            margin: 0 0 4px;
            font-size: 0.7rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #6b5d4f;
            font-family: system-ui, -apple-system, sans-serif;
        }

        /* ── Sections ────────────────────────────────────────────────── */
        .section { break-inside: avoid-column; }
        .lead { break-inside: avoid; page-break-inside: avoid; }

        .cat {
            break-after: avoid;
            page-break-after: avoid;
            margin: 16px 0 8px;
            padding: 3px 8px;
            background: #f4efe8;
            border-left: 4px solid #d4813a;
            font-size: 1rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .section:first-child .cat { margin-top: 4px; }

        /* A sub-category is a run-in line, not a second heading: small caps
           over a short rule, so it reads as part of its category. */
        .cat--sub {
            background: transparent;
            border-left: 0;
            border-bottom: 1px solid #d9d2c8;
            padding: 0 0 2px;
            font-size: 0.72rem;
            letter-spacing: 0.12em;
            font-weight: 700;
            color: #8a7a68;
            margin: 10px 0 5px;
        }

        /* ── One dish ────────────────────────────────────────────────── */
        .row {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 5px;
            break-inside: avoid;
            page-break-inside: avoid;
        }

        /*
         * Cell padding is set per class *and* scoped to `.row`, because
         * `.row td` (a class plus an element) out-specifies a bare class —
         * which is why the Dhivehi name sat flush against the English one
         * however much padding it was given.
         */
        .row td { padding: 0; vertical-align: bottom; }

        .row td.row__name { font-weight: 700; white-space: nowrap; }

        .row__star { color: #d4813a; font-size: 0.85em; }

        /* The dot leader is a cell with a dotted underline: flexbox would look
           the same in a browser and collapse in dompdf. */
        .row td.row__dots {
            width: 100%;
            border-bottom: 1px dotted #cfc6b8;
        }

        .row td.row__price {
            text-align: right;
            font-weight: 700;
            white-space: nowrap;
            padding-left: 8px;
        }

        .row__was {
            font-weight: 400;
            font-size: 0.8em;
            color: #6b5d4f;
            text-decoration: line-through;
            padding-right: 4px;
        }

        .row td.row__dv {
            font-weight: 400;
            font-size: 0.95em;
            color: #6b5d4f;
            direction: rtl;
            unicode-bidi: isolate;
            padding-left: 14px;
            white-space: nowrap;
            font-family: 'BakeDhivehi', 'A_Faruma', 'MV Faseyha', 'DejaVu Sans', serif;
        }

        .row__desc {
            margin: 1px 0 0;
            font-size: 0.8rem;
            color: #6b5d4f;
        }

        .row__size td { font-size: 0.85em; }
        .row__size td.row__name { font-weight: 400; padding-left: 14px; }
        .row__size td.row__price { font-weight: 400; }

        .row__tags {
            font-size: 0.65rem;
            color: #8a7a68;
            font-family: system-ui, -apple-system, sans-serif;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-top: 1px;
        }

        /* ── Footer ──────────────────────────────────────────────────── */
        .foot {
            margin-top: 18px;
            padding-top: 10px;
            border-top: 2px solid #1c1408;
            width: 100%;
            border-collapse: collapse;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 0.72rem;
            color: #6b5d4f;
        }

        .foot td { vertical-align: middle; padding: 0; }
        .foot__qr { width: 80px; text-align: center; padding-left: 10px; }
        .foot__qr img { width: 62px; height: 62px; }
        /* Wraps inside its own cell: "COMPLAINT? SCAN" and "MENU ONLINE" set
           side by side on one line read as a single run-on phrase. */
        .foot__qr-label { font-size: 0.55rem; line-height: 1.2; letter-spacing: 0.03em; text-transform: uppercase; }
        .foot__complain { margin-top: 3px; font-style: italic; }
        .foot strong { color: #1c1408; font-size: 0.8rem; }
        .foot p { margin: 0 0 2px; }

        .empty { text-align: center; color: #6b5d4f; padding: 3rem 0; }

        /* ── Columns. The count follows the paper (see printColumns). ─── */
        .body { column-count: {{ $columns }}; column-gap: 9mm; }
        .cols { width: 100%; border-collapse: collapse; }
        .cols td.col { vertical-align: top; padding: 0 4.5mm; }
        .cols td.col:first-child { padding-left: 0; }
        .cols td.col:last-child { padding-right: 0; }
        .cols td.col + td.col { border-left: 1px solid #ece6dc; }

        /* ── Short: a dense price list ───────────────────────────────── */
        .style-short .row { font-size: 0.9rem; }

        /* ── Full: room to describe a dish ───────────────────────────── */
        .style-full .row { margin-bottom: 2px; }
        .style-full .dish { margin-bottom: 9px; break-inside: avoid; page-break-inside: avoid; }

        /* ── Wall: large type, read from across a counter ────────────── */
        .style-wall { font-size: 1.3rem; }
        .style-wall .masthead h1 { font-size: 2.8rem; }
        .style-wall .masthead__logo { width: 96px; height: 96px; }
        .style-wall .cat { font-size: 1.4rem; margin-top: 22px; }
        .style-wall .row { margin-bottom: 9px; }

        /* ── Booklet covers (PDF only) ───────────────────────────────── */
        .cover {
            width: 100%;
            height: 168mm;
            border-collapse: collapse;
            text-align: center;
            page-break-after: always;
        }
        .cover td { vertical-align: middle; padding: 0; }
        .cover__logo { width: 38mm; height: 38mm; border-radius: 50%; object-fit: cover; }
        .cover h1 { margin: 6mm 0 0; font-size: 2.1rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .cover__tagline { margin: 2mm 0 0; font-style: italic; color: #6b5d4f; }
        .cover__word {
            margin: 12mm auto 0;
            padding: 3mm 0;
            width: 40mm;
            border-top: 2px solid #1c1408;
            border-bottom: 2px solid #1c1408;
            font-size: 1rem;
            letter-spacing: 0.3em;
            text-transform: uppercase;
        }
        .cover__date { margin: 6mm 0 0; font-size: 0.7rem; color: #6b5d4f; font-family: system-ui, -apple-system, sans-serif; }
        .back { page-break-before: always; }
        /* The back cover is the last page; a break after it would add a blank one. */
        .back .cover { page-break-after: auto; }
        /* dompdf top-aligns this table after the break; a deliberate margin
           sits the back cover a third of the way down rather than at the top. */
        .back .cover td { vertical-align: top; padding-top: 34mm; }
        .back .foot { border-top: 0; margin-top: 0; padding-top: 0; font-size: 0.85rem; }
        .back .back__codes { width: 70mm; margin: 8mm auto 0; }
        .back .foot__qr { width: 50%; text-align: center; padding: 0 2mm; }
        .back .foot__qr img { width: 26mm; height: 26mm; }
        .back .foot__complain { margin-top: 3mm; font-size: 0.8rem; }
        .back h2 { margin: 0 0 3mm; font-size: 1.1rem; letter-spacing: 0.1em; text-transform: uppercase; }
        .back p { margin: 0 0 1.5mm; }

@unless ($forPdf)
        /*
         * On a phone. Owner, 2026-09-06: "Still print mobile view need
         * enhancements."
         *
         * This is a page laid out for paper that people also read on a phone
         * — to check a price, or to send the PDF on. At 390px the short list's
         * two columns collided (a long dish name cannot wrap when its row is
         * `nowrap`, so it ran straight through the next column), the masthead
         * filled half the screen before any food, and the wall layout pushed
         * the page sideways.
         *
         * Deliberately `@media screen` *and* skipped entirely for the PDF:
         * dompdf treats the document as screen media and does not evaluate
         * width conditions, so a mobile block left in the stylesheet would
         * quietly reformat every PDF.
         */
        @media screen and (max-width: 700px) {
            body { padding-bottom: 1.5rem; }

            .toolbar {
                gap: 6px;
                padding: 8px 10px;
            }

            /* The buttons say what they are; the group labels are a row of
               screen a phone cannot spare. */
            .toolbar__label { display: none; }
            .toolbar__spacer { margin-left: 0; }
            .toolbar__hint { display: none; }

            /* The word stays even though the rest of the row is tight: an
               arrow on its own is a guess about where it goes. */
            .toolbar a.toolbar__back { margin-right: 0.2rem; }

            .toolbar a,
            .toolbar button {
                font-size: 0.78rem;
                padding: 0.35rem 0.6rem;
                border-radius: 6px;
            }

            .sheet {
                margin: 8px;
                padding: 18px 16px;
                border-radius: 6px;
            }

            /* One column. Two on a 390px screen is a collision, not a layout. */
            .body { column-count: 1; }

            .masthead__logo { width: 52px; height: 52px; }
            .masthead h1 { font-size: 1.35rem; letter-spacing: 0.04em; }
            .masthead__tagline { font-size: 0.75rem; }
            .rule-mark { margin: 6px 0 2px; }
            .rule-line { margin-bottom: 10px; }

            /*
             * The line between a dish and its price.
             *
             * Owner, 2026-09-06: "in mobile menu print page there is no lines
             * so difficult to read the price". I had hidden the leader dots
             * here, which took away the one thing carrying the eye across.
             *
             * Putting them back column-style made it worse: the leader cell
             * asks for all the width, so on a narrow screen the *name* gets
             * squeezed and "Mas Huni" wraps onto two lines. So on a phone the
             * rule goes under the whole row instead — name left, price right,
             * one dotted line joining them. A4 keeps its leader dots, where
             * there is room for them to work.
             */
            .row td.row__name { white-space: normal; }
            .row td.row__dots { display: none; }

            .row--priced {
                border-bottom: 1px dotted #cfc6b8;
                padding-bottom: 1px;
            }

            .row, .row--priced { margin-bottom: 7px; }

            .style-short .row,
            .style-full .row { font-size: 0.95rem; }

            .style-wall { font-size: 1.05rem; }
            .style-wall .masthead h1 { font-size: 1.5rem; }
            .style-wall .cat { font-size: 1.1rem; }

            .cat { font-size: 0.9rem; letter-spacing: 0.06em; }

            /* Address above, QR below, both readable. Stacking releases the
               QR cell's width, so cap it — a code the width of the screen is
               no easier to scan than one you can cover with a thumb. */
            .foot, .foot tbody, .foot tr, .foot td { display: block; width: auto; }
            .foot__qr { text-align: left; padding-top: 10px; }
            .foot__qr img { width: 88px; height: 88px; }
        }
@endunless

        @media print {
            body { background: #fff; padding: 0; }
            .no-print { display: none !important; }
            .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
            .run--screen { display: table; }
            /* Colour-managed printers otherwise drop the bands and rules. */
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
@if ($forPdf)
        /*
         * dompdf never applies `@media print`, so the on-screen chrome — the
         * tinted desk the sheet sits on, its shadow, its own margins — was
         * painting a grey band across the top and bottom of every page.
         */
        body { background: #fff; padding: 0; }
        .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
        /* The brand line, in the top margin of every page. */
        .run--fixed { position: fixed; top: -13mm; left: 0; right: 0; }
@endif
    </style>
</head>
<body class="style-{{ $printStyle }} paper-{{ $paper }} orient-{{ $orient }}">

@unless ($forPdf)
    <div class="toolbar no-print">
        {{--
          A way back to the menu. Owner, 2026-09-06: "when i go to print in
          blade menu, there is no go back option. I checked the mobile view."
          There was not one — the toolbar offered three layouts, Dhivehi, Share,
          PDF and Print, and no way out. On a phone with no browser chrome the
          page was a dead end.

          A plain link rather than history.back(): this page is shared and
          bookmarked, so "back" is frequently nowhere. /menu is always true.
        --}}
        <a class="toolbar__back" data-testid="menu-print-back" href="{{ route('menu') }}">
            ← <span class="toolbar__back-text">Menu</span>
        </a>

        <span class="toolbar__group" data-testid="menu-print-layouts">
            <span class="toolbar__label">Layout</span>
            @foreach ($printStyles as $style)
                <a href="{{ route('menu.print', $printQuery(['style' => $style])) }}"
                   class="{{ $printStyle === $style ? 'is-on' : '' }}">{{ $styleLabels[$style] ?? $style }}</a>
            @endforeach
        </span>

        {{-- Owner, 2026-09-21: "paper size options, a5, a4, a3. Portrait, landscape." --}}
        <span class="toolbar__group" data-testid="menu-print-papers">
            <span class="toolbar__label">Paper</span>
            @foreach ($printPapers as $size)
                <a href="{{ route('menu.print', $printQuery(['paper' => $size])) }}"
                   class="{{ $paper === $size ? 'is-on' : '' }}">{{ strtoupper($size) }}</a>
            @endforeach
        </span>

        <span class="toolbar__group" data-testid="menu-print-orient">
            <a href="{{ route('menu.print', $printQuery(['orient' => 'portrait'])) }}"
               class="{{ $orient === 'portrait' ? 'is-on' : '' }}">Portrait</a>
            <a href="{{ route('menu.print', $printQuery(['orient' => 'landscape'])) }}"
               class="{{ $orient === 'landscape' ? 'is-on' : '' }}">Landscape</a>
        </span>

        <a href="{{ route('menu.print', $printQuery(['dv' => $showDhivehi ? null : 1])) }}"
           class="{{ $showDhivehi ? 'is-on' : '' }}">ދިވެހި</a>

        <span class="toolbar__spacer"></span>

        {{-- Hidden until the browser says it can share a file, so nobody taps
             a button that does nothing. The PDF link beside it always works. --}}
        <button type="button" class="toolbar__share" id="menuShare"
                data-testid="menu-print-share" hidden>
            ↗ Share
        </button>

        {{-- A5 pages on A4 sheets, in folding order, with covers. --}}
        <a class="toolbar__booklet" data-testid="menu-print-booklet"
           href="{{ route('menu.print.booklet', $printQuery(['paper' => null, 'orient' => null])) }}"
           title="A5 booklet: A4 sheets, two pages a side, in folding order. Print two-sided, flip on the short edge, fold in half.">
            📖 Booklet
        </a>

        <a class="toolbar__pdf" data-testid="menu-print-pdf" id="menuPdfLink"
           href="{{ route('menu.print.pdf', $printQuery()) }}">
            ⬇ PDF
        </a>
        <button type="button" class="toolbar__print" id="menuPrintBtn"
                data-testid="menu-print-button">🖨 Print</button>

        <p class="toolbar__hint">
            {{ strtoupper($paper) }} {{ $orient }}, {{ $columns }} {{ Str::plural('column', $columns) }}.
            Booklet: A5 pages on A4 sheets in folding order — print two-sided, flip on the short edge, fold the stack in half.
        </p>
    </div>

    {{--
      A nonced script, not an `onclick`. The site's CSP is
      `script-src 'self' 'nonce-…'` with no `unsafe-inline`, so the inline
      handler this used to carry was refused by the browser and the Print
      button did nothing on the live site. It worked every time I opened the
      page from a file:// URL, which has no CSP — which is exactly why that
      slipped through.
    --}}
    <script nonce="{{ csp_nonce() }}">
        (function () {
            var printBtn = document.getElementById('menuPrintBtn');
            if (printBtn) {
                printBtn.addEventListener('click', function () { window.print(); });
            }

            var shareBtn = document.getElementById('menuShare');
            var pdfLink = document.getElementById('menuPdfLink');
            if (!shareBtn || !pdfLink || !navigator.canShare) return;

            var filename = @json($pdfFilename);
            var title = @json($brand . ' menu');

            // Probe with an empty file of the right type: `canShare` answers
            // for the *kind* of thing, and asking before fetching means the
            // button never appears on a browser that would refuse it.
            var probe;
            try {
                probe = new File([new Blob([], { type: 'application/pdf' })], filename, { type: 'application/pdf' });
            } catch (e) {
                return;
            }
            if (!navigator.canShare({ files: [probe] })) return;

            shareBtn.hidden = false;

            shareBtn.addEventListener('click', function () {
                var original = shareBtn.textContent;
                shareBtn.disabled = true;
                shareBtn.textContent = 'Preparing…';

                fetch(pdfLink.href)
                    .then(function (res) {
                        if (!res.ok) throw new Error('pdf');
                        return res.blob();
                    })
                    .then(function (blob) {
                        var file = new File([blob], filename, { type: 'application/pdf' });
                        return navigator.share({ files: [file], title: title });
                    })
                    .catch(function (err) {
                        // A cancelled share sheet is not a failure; anything
                        // else falls back to the plain download rather than
                        // leaving somebody with nothing.
                        if (err && err.name === 'AbortError') return;
                        window.location.href = pdfLink.href;
                    })
                    .then(function () {
                        shareBtn.disabled = false;
                        shareBtn.textContent = original;
                    });
            });
        })();
    </script>
@endunless

@php
    // The brand line that runs along the top of every page.
    $runHead = static function (string $extraClass = '') use ($brand, $brandLogo, $printStyle, $styleLabels, $printedAt, $booklet): string {
        $logo = $brandLogo ? '<img class="run__logo" src="' . e($brandLogo) . '" alt="">' : '';
        $what = $booklet ? 'Menu' : 'Menu · ' . ($styleLabels[$printStyle] ?? $printStyle);

        return '<table class="run run--head ' . $extraClass . '" data-testid="menu-print-running-header"><tr>'
            . '<td>' . $logo . '<span class="run__brand">' . e($brand) . '</span></td>'
            . '<td class="run__right">' . e($what) . ' · ' . e($printedAt->format('j M Y')) . '</td>'
            . '</tr></table>';
    };
@endphp

@if ($forPdf)
    {!! $runHead('run--fixed') !!}
@endif

@unless ($forPdf)
<table class="page">
    <thead><tr><td>{!! $runHead('run--screen') !!}</td></tr></thead>
    <tfoot><tr><td>
        <table class="run run--foot run--screen" data-testid="menu-print-running-footer"><tr>
            <td><span class="run__brand">{{ $brand }}</span> · {{ $menuUrl }}</td>
            <td class="run__right">Prices in MVR · may change</td>
        </tr></table>
    </td></tr></tfoot>
    <tbody><tr><td>
@endunless

<div class="sheet">
    @if ($booklet)
        {{-- The front cover: the brand, big, and nothing else. --}}
        <table class="cover" data-testid="menu-print-cover"><tr><td>
            @if ($brandLogo)
                <img class="cover__logo" src="{{ $brandLogo }}" alt="">
            @endif
            <h1>{{ $brand }}</h1>
            @if ($brandTagline !== '')
                <p class="cover__tagline">{{ $brandTagline }}</p>
            @endif
            <div class="cover__word">Menu</div>
            <p class="cover__date">{{ $printedAt->format('F Y') }}</p>
        </td></tr></table>
    @else
    <header class="masthead">
        @if ($brandLogo)
            <img class="masthead__logo" src="{{ $brandLogo }}" alt="">
        @endif
        <h1>{{ $brand }}</h1>
        @if ($brandTagline !== '')
            <p class="masthead__tagline">{{ $brandTagline }}</p>
        @endif
    </header>

    <div class="rule-mark">• • •</div>
    <div class="rule-line"></div>
    @endif

    <p class="masthead__meta">
        {{ $menuItemCount }} {{ \Illuminate\Support\Str::plural('item', $menuItemCount) }}
        · All prices in MVR
    </p>

    @if ($menuCategories->isEmpty())
        <p class="empty">Nothing on the menu to print yet.</p>
    @elseif ($forPdf && $columns > 1)
        {{-- dompdf has no CSS columns: the categories are dealt across a
             table instead, balanced by rows (see dealAcrossColumns). --}}
        <table class="cols" data-testid="menu-print-columns" data-columns="{{ $columns }}">
            @foreach ($columnRows as $cells)
                <tr>
                    @foreach ($cells as $cell)
                        <td class="col">
                            @if ($cell === null)
                            @elseif ($cell['kind'] === 'cat')
                                <h2 class="cat">{{ $cell['text'] }}</h2>
                            @elseif ($cell['kind'] === 'sub')
                                <h3 class="cat cat--sub">{{ $cell['text'] }}</h3>
                            @else
                                @include('partials.menu-print-row', [
                                    'item' => $cell['item'],
                                    'printStyle' => $printStyle,
                                    'showDhivehi' => $showDhivehi,
                                    'price' => $menuPriceByItemId[$cell['item']->id] ?? null,
                                    'sizes' => $menuVariantPricesByItemId[$cell['item']->id] ?? [],
                                ])
                            @endif
                        </td>
                    @endforeach
                </tr>
            @endforeach
        </table>
    @else
        <div class="body" data-testid="menu-print-body" data-columns="{{ $columns }}">
            @include('partials.menu-print-groups', ['groups' => $menuCategories])
        </div>
    @endif

    @if ($booklet)
        {{-- The back cover: where and when, and the code to the live menu. --}}
        <div class="back" data-testid="menu-print-back-cover">
            <table class="cover"><tr><td>
                <h2>{{ $brand }}</h2>
                @if ($brandAddress !== '')
                    <p>{{ $brandAddress }}</p>
                @endif
                @if ($brandPhone !== '')
                    <p>{{ $brandPhone }}</p>
                @endif
                @foreach ($brandHours as $line)
                    <p>{{ $line }}</p>
                @endforeach
                <table class="foot back__codes"><tr>
                    <td class="foot__qr">
                        <img src="{{ $menuQr }}" alt="Scan for the menu online">
                        <div class="foot__qr-label">Menu online</div>
                    </td>
                    <td class="foot__qr" data-testid="menu-print-complaint-qr">
                        <img src="{{ $complaintQr }}" alt="Scan to make a complaint">
                        <div class="foot__qr-label">Complaint? Scan</div>
                    </td>
                </tr></table>
                @if ($complaintLine !== '')
                    <p class="foot__complain">{{ $complaintLine }}</p>
                @endif
                <p style="margin-top:4mm;font-size:0.7rem;color:#6b5d4f">{{ $menuUrl }} · Printed {{ $printedAt->format('j M Y') }} · prices may change</p>
            </td></tr></table>
        </div>
    @else
    <table class="foot">
        <tr>
            <td>
                <p><strong>{{ $brand }}</strong></p>
                @if ($brandAddress !== '')
                    <p>{{ $brandAddress }}</p>
                @endif
                @if ($brandPhone !== '')
                    <p>{{ $brandPhone }}</p>
                @endif
                <p>Printed {{ $printedAt->format('j M Y') }} · prices may change</p>
                @if ($complaintLine !== '')
                    <p class="foot__complain">{{ $complaintLine }}</p>
                @endif
            </td>
            <td class="foot__qr foot__qr--complain" data-testid="menu-print-complaint-qr">
                {{-- The complaint box, straight to the owner (2026-09-21). --}}
                <img src="{{ $complaintQr }}" alt="Scan to make a complaint">
                <div class="foot__qr-label">Complaint? Scan</div>
            </td>
            <td class="foot__qr">
                {{-- The printed sheet ages; this is the copy that never does. --}}
                <img src="{{ $menuQr }}" alt="Scan for the menu online">
                <div class="foot__qr-label">Menu online</div>
            </td>
        </tr>
    </table>
    @endif
</div>

@unless ($forPdf)
    </td></tr></tbody>
</table>
@endunless

</body>
</html>
