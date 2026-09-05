@php
    /**
     * The menu, for paper.
     *
     * Owner, 2026-09-05: "make a print option. Make different options. Short
     * version, details ect." Then: "Enhance the layout of the print page. Add
     * logo. Make visual. Add pdf share option."
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
     */
    $money = static fn ($n) => number_format((float) $n, 2);
    $forPdf = $forPdf ?? false;
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $brand }} — menu</title>
    <style>
        @page { margin: 12mm; }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            padding: 0 0 3rem;
            background: #f4f1ec;
            color: #1c1408;
            font-family: Georgia, 'Times New Roman', serif;
            line-height: 1.4;
        }

        /* ── The toolbar. Never printed, never in the PDF. ───────────── */
        .toolbar {
            position: sticky;
            top: 0;
            z-index: 5;
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            align-items: center;
            padding: 0.75rem 1rem;
            background: #fff;
            border-bottom: 1px solid #d9d2c8;
            font-family: system-ui, -apple-system, sans-serif;
        }

        .toolbar__label {
            font-size: 0.8125rem;
            font-weight: 700;
            color: #6b5d4f;
            margin-right: 0.25rem;
        }

        .toolbar a,
        .toolbar button {
            font: inherit;
            font-size: 0.875rem;
            font-weight: 600;
            padding: 0.45rem 0.9rem;
            border: 1.5px solid #d9d2c8;
            border-radius: 8px;
            background: #fff;
            color: #1c1408;
            text-decoration: none;
            cursor: pointer;
        }

        .toolbar a.is-on {
            border-color: #d4813a;
            background: #d4813a;
            color: #fff;
        }

        .toolbar__spacer { margin-left: auto; }

        .toolbar__pdf {
            border-color: #1c1408;
            background: #1c1408;
            color: #fff;
        }

        .toolbar__print {
            border-color: #d4813a;
            background: #d4813a;
            color: #fff;
        }

        .sheet {
            max-width: 210mm;
            margin: 1.25rem auto;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 1px 10px rgba(0, 0, 0, 0.08);
        }

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
        .cat {
            break-inside: avoid-column;
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

        .cat--sub {
            background: transparent;
            border-left: 0;
            padding-left: 0;
            font-size: 0.85rem;
            text-transform: none;
            letter-spacing: 0.02em;
            font-style: italic;
            color: #6b5d4f;
            margin: 10px 0 4px;
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

        /* The dot leader is a cell with a dotted underline: flexbox would look
           the same in a browser and collapse in dompdf. */
        .row__dots {
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
        .foot__qr { width: 76px; text-align: right; }
        .foot__qr img { width: 68px; height: 68px; }
        .foot strong { color: #1c1408; font-size: 0.8rem; }
        .foot p { margin: 0 0 2px; }

        .empty { text-align: center; color: #6b5d4f; padding: 3rem 0; }

        /* ── Short: a dense two-column price list ────────────────────── */
        .style-short .body { column-count: 2; column-gap: 9mm; }
        .style-short .row { font-size: 0.9rem; }

        /* ── Full: one column, room to describe a dish ───────────────── */
        .style-full .row { margin-bottom: 2px; }
        .style-full .dish { margin-bottom: 9px; break-inside: avoid; page-break-inside: avoid; }

        /* ── Wall: large type, read from across a counter ────────────── */
        .style-wall { font-size: 1.3rem; }
        .style-wall .masthead h1 { font-size: 2.8rem; }
        .style-wall .masthead__logo { width: 96px; height: 96px; }
        .style-wall .cat { font-size: 1.4rem; margin-top: 22px; }
        .style-wall .row { margin-bottom: 9px; }

        @media print {
            body { background: #fff; padding: 0; }
            .no-print { display: none !important; }
            .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
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
@endif
    </style>
</head>
<body class="style-{{ $printStyle }}">

@unless ($forPdf)
    <div class="toolbar no-print">
        <span class="toolbar__label">Layout</span>
        @foreach ($printStyles as $style)
            @php
                $labels = ['short' => 'Short list', 'full' => 'With details', 'wall' => 'Large / wall'];
                $query = ['style' => $style] + ($showDhivehi ? ['dv' => 1] : []);
            @endphp
            <a href="{{ route('menu.print', $query) }}"
               class="{{ $printStyle === $style ? 'is-on' : '' }}">{{ $labels[$style] ?? $style }}</a>
        @endforeach

        <a href="{{ route('menu.print', ['style' => $printStyle] + ($showDhivehi ? [] : ['dv' => 1])) }}"
           class="{{ $showDhivehi ? 'is-on' : '' }}">ދިވެހި</a>

        <span class="toolbar__spacer"></span>
        <a class="toolbar__pdf" data-testid="menu-print-pdf"
           href="{{ route('menu.print.pdf', ['style' => $printStyle] + ($showDhivehi ? ['dv' => 1] : [])) }}">
            ⬇ PDF
        </a>
        <button type="button" class="toolbar__print" onclick="window.print()">🖨 Print</button>
    </div>
@endunless

<div class="sheet">
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

    <p class="masthead__meta">
        {{ $menuItemCount }} {{ \Illuminate\Support\Str::plural('item', $menuItemCount) }}
        · All prices in MVR
    </p>

    @if ($menuCategories->isEmpty())
        <p class="empty">Nothing on the menu to print yet.</p>
    @else
        <div class="body">
            @foreach ($menuCategories as $group)
                @php
                    /*
                     * `groupByParent` ends with a bucket for items whose
                     * category is switched off or missing, and that bucket's
                     * category is null. The website menu heads it "More"; this
                     * read `->name` off it and returned a 500 the first time
                     * somebody opened the page.
                     */
                    $heading = $group['category']?->name ?: 'More';
                    $hasRows = $group['items']->isNotEmpty() || $group['subcategories'] !== [];
                @endphp

                @if ($hasRows)
                    <h2 class="cat">{{ $heading }}</h2>
                @endif

                @foreach ($group['items'] as $item)
                    @include('partials.menu-print-row', [
                        'item' => $item,
                        'printStyle' => $printStyle,
                        'showDhivehi' => $showDhivehi,
                        'price' => $menuPriceByItemId[$item->id] ?? null,
                        'sizes' => $menuVariantPricesByItemId[$item->id] ?? [],
                    ])
                @endforeach

                @foreach ($group['subcategories'] as $sub)
                    <h3 class="cat cat--sub">{{ $sub['category']->name }}</h3>
                    @foreach ($sub['items'] as $item)
                        @include('partials.menu-print-row', [
                            'item' => $item,
                            'printStyle' => $printStyle,
                            'showDhivehi' => $showDhivehi,
                            'price' => $menuPriceByItemId[$item->id] ?? null,
                            'sizes' => $menuVariantPricesByItemId[$item->id] ?? [],
                        ])
                    @endforeach
                @endforeach
            @endforeach
        </div>
    @endif

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
            </td>
            <td class="foot__qr">
                {{-- The printed sheet ages; this is the copy that never does. --}}
                <img src="{{ $menuQr }}" alt="Scan for the menu online">
                <div style="font-size:0.6rem;letter-spacing:0.04em">{{ $menuUrl }}</div>
            </td>
        </tr>
    </table>
</div>

</body>
</html>
