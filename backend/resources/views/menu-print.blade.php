@php
    /**
     * The menu, for paper.
     *
     * Owner, 2026-09-05: "make a print option. Make different options. Short
     * version, details ect."
     *
     * Standalone rather than an extension of the site layout: a printed menu
     * has no navigation, no cart, no cookie notice and no footer, and
     * inheriting a layout only to hide most of it leaves those things one CSS
     * rule away from turning up on somebody's paper.
     */
    $money = static fn ($n) => number_format((float) $n, 2);
    $brand = trim((string) (content('site_name', '') ?: config('app.name', 'Bake & Grill')));
    $isRtlName = static fn ($dv) => is_string($dv) && trim($dv) !== '';
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>{{ $brand }} — menu to print</title>
    <style>
        :root {
            --ink: #1c1408;
            --muted: #6b5d4f;
            --rule: #d9d2c8;
            --accent: #d4813a;
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            padding: 0 0 3rem;
            background: #f4f1ec;
            color: var(--ink);
            font-family: Georgia, 'Times New Roman', serif;
            line-height: 1.4;
        }

        /* ── The toolbar. Never printed. ─────────────────────────────── */
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
            border-bottom: 1px solid var(--rule);
            font-family: system-ui, -apple-system, sans-serif;
        }

        .toolbar__label {
            font-size: 0.8125rem;
            font-weight: 700;
            color: var(--muted);
            margin-right: 0.25rem;
        }

        .toolbar a,
        .toolbar button {
            font: inherit;
            font-size: 0.875rem;
            font-weight: 600;
            padding: 0.45rem 0.9rem;
            border: 1.5px solid var(--rule);
            border-radius: 8px;
            background: #fff;
            color: var(--ink);
            text-decoration: none;
            cursor: pointer;
        }

        .toolbar a.is-on {
            border-color: var(--accent);
            background: var(--accent);
            color: #fff;
        }

        .toolbar .toolbar__print {
            margin-left: auto;
            border-color: var(--accent);
            background: var(--accent);
            color: #fff;
        }

        .sheet {
            max-width: 210mm;
            margin: 1.25rem auto;
            padding: 14mm;
            background: #fff;
            box-shadow: 0 1px 10px rgba(0, 0, 0, 0.08);
        }

        .masthead {
            text-align: center;
            border-bottom: 2px solid var(--ink);
            padding-bottom: 0.6rem;
            margin-bottom: 1.1rem;
        }

        .masthead h1 {
            margin: 0;
            font-size: 1.9rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .masthead p {
            margin: 0.35rem 0 0;
            font-size: 0.75rem;
            color: var(--muted);
            font-family: system-ui, -apple-system, sans-serif;
        }

        .cat {
            /* Never orphan a category heading at the foot of a page. */
            break-inside: avoid-column;
            break-after: avoid;
            margin: 1.1rem 0 0.5rem;
            font-size: 1.05rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            border-bottom: 1px solid var(--rule);
            padding-bottom: 0.2rem;
        }

        .cat--sub {
            font-size: 0.9rem;
            text-transform: none;
            letter-spacing: 0.02em;
            border-bottom: 0;
            color: var(--muted);
            margin-top: 0.7rem;
        }

        .row {
            break-inside: avoid;
            margin: 0 0 0.45rem;
        }

        .row__line {
            display: flex;
            align-items: baseline;
            gap: 0.4rem;
        }

        .row__name { font-weight: 700; }

        /* Dot leaders, so a name and its price read as one line. */
        .row__dots {
            flex: 1 1 auto;
            border-bottom: 1px dotted var(--rule);
            transform: translateY(-0.25em);
        }

        .row__price {
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            font-weight: 700;
        }

        .row__was {
            font-weight: 400;
            font-size: 0.8em;
            color: var(--muted);
            text-decoration: line-through;
            margin-right: 0.3rem;
        }

        .row__dv {
            font-size: 0.95em;
            color: var(--muted);
            direction: rtl;
            unicode-bidi: isolate;
            white-space: nowrap;
        }

        .row__desc {
            margin: 0.1rem 0 0;
            font-size: 0.8125rem;
            color: var(--muted);
        }

        .row__sizes {
            margin: 0.2rem 0 0;
            padding: 0;
            list-style: none;
            font-size: 0.85rem;
        }

        .row__sizes li {
            display: flex;
            align-items: baseline;
            gap: 0.4rem;
            padding-left: 1rem;
        }

        .row__tags {
            font-size: 0.7rem;
            color: var(--muted);
            font-family: system-ui, -apple-system, sans-serif;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .foot {
            margin-top: 1.5rem;
            padding-top: 0.5rem;
            border-top: 1px solid var(--rule);
            font-size: 0.7rem;
            color: var(--muted);
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: space-between;
            gap: 1rem;
        }

        .empty {
            text-align: center;
            color: var(--muted);
            padding: 3rem 0;
        }

        /* ── Short: a dense two-column price list ────────────────────── */
        .style-short .body { column-count: 2; column-gap: 10mm; }
        .style-short .row__sizes { font-size: 0.8rem; }

        /* ── Full: one column, room for descriptions ─────────────────── */
        .style-full .row { margin-bottom: 0.7rem; }

        /* ── Wall: large type, read from across a counter ────────────── */
        .style-wall { font-size: 1.35rem; }
        .style-wall .masthead h1 { font-size: 2.6rem; }
        .style-wall .cat { font-size: 1.5rem; margin-top: 1.5rem; }
        .style-wall .row { margin-bottom: 0.7rem; }
        .style-wall .row__sizes { font-size: 1rem; }

        @media print {
            body { background: #fff; }
            .no-print { display: none !important; }
            .sheet {
                max-width: none;
                margin: 0;
                padding: 0;
                box-shadow: none;
            }
            /* Colour-managed printers otherwise drop the rules and greys. */
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }

        @page { margin: 14mm; }
    </style>
</head>
<body class="style-{{ $printStyle }}">

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

    <button type="button" class="toolbar__print" onclick="window.print()">🖨 Print</button>
</div>

<div class="sheet">
    <header class="masthead">
        <h1>{{ $brand }}</h1>
        <p>
            {{ $menuItemCount }} {{ \Illuminate\Support\Str::plural('item', $menuItemCount) }}
            · Prices in MVR
            · Printed {{ $printedAt->format('j M Y') }}
        </p>
    </header>

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
                     * reads `->name` off it and returned a 500 on the live site
                     * the first time somebody opened the page.
                     */
                    $parent = $group['category'];
                    $heading = $parent?->name ?: 'More';
                @endphp

                @if ($group['items']->isNotEmpty() || collect($group['subcategories'])->isNotEmpty())
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

    <div class="foot">
        <span>{{ $brand }}</span>
        <span>Printed {{ $printedAt->format('j M Y, H:i') }}</span>
    </div>
</div>

</body>
</html>
