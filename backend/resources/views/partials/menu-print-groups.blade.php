{{-- The categories of the printed menu, in order: heading, dishes,
     sub-category run-ins with theirs. Included once per column so the
     browser's CSS columns and the PDF's table columns print the same
     rows. Expects $groups plus the sheet's own view data. --}}
@foreach ($groups as $group)
    @php
        /*
         * `groupByParent` ends with a bucket for items whose category is
         * switched off or missing, and that bucket's category is null.
         * The website menu heads it "Other"; this read `->name` off it and
         * returned a 500 the first time somebody opened the page.
         */
        $heading = $group['category']?->name ?: 'Other';
        $hasRows = $group['items']->isNotEmpty() || $group['subcategories'] !== [];
    @endphp

    @if ($hasRows)
        <div class="section">
        {{-- The heading and the first dish are one block, so a category
             name never sits alone at the foot of a page. --}}
        <div class="lead">
            <h2 class="cat">{{ $heading }}</h2>
            @if ($group['items']->isNotEmpty())
                @include('partials.menu-print-row', [
                    'item' => $group['items']->first(),
                    'printStyle' => $printStyle,
                    'showDhivehi' => $showDhivehi,
                    'price' => $menuPriceByItemId[$group['items']->first()->id] ?? null,
                    'sizes' => $menuVariantPricesByItemId[$group['items']->first()->id] ?? [],
                ])
            @endif
        </div>
        @foreach ($group['items']->slice(1) as $item)
            @include('partials.menu-print-row', [
                'item' => $item,
                'printStyle' => $printStyle,
                'showDhivehi' => $showDhivehi,
                'price' => $menuPriceByItemId[$item->id] ?? null,
                'sizes' => $menuVariantPricesByItemId[$item->id] ?? [],
            ])
        @endforeach

        @foreach ($group['subcategories'] as $sub)
            <div class="lead">
                <h3 class="cat cat--sub">{{ $sub['category']->name }}</h3>
                @if ($sub['items']->isNotEmpty())
                    @include('partials.menu-print-row', [
                        'item' => $sub['items']->first(),
                        'printStyle' => $printStyle,
                        'showDhivehi' => $showDhivehi,
                        'price' => $menuPriceByItemId[$sub['items']->first()->id] ?? null,
                        'sizes' => $menuVariantPricesByItemId[$sub['items']->first()->id] ?? [],
                    ])
                @endif
            </div>
            @foreach ($sub['items']->slice(1) as $item)
                @include('partials.menu-print-row', [
                    'item' => $item,
                    'printStyle' => $printStyle,
                    'showDhivehi' => $showDhivehi,
                    'price' => $menuPriceByItemId[$item->id] ?? null,
                    'sizes' => $menuVariantPricesByItemId[$item->id] ?? [],
                ])
            @endforeach
        @endforeach
        </div>
    @endif
@endforeach
