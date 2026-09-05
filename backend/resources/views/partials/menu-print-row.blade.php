@php
    /**
     * One line of the printed menu.
     *
     * Shared by all three layouts because the *content* of a row does not
     * change between them — only how much of it is worth showing, and how
     * large. Three near-identical row templates would drift the moment one of
     * them learned about a new field.
     *
     * @var \App\Models\Item $item
     * @var string $printStyle
     * @var bool $showDhivehi
     * @var array{price: float, was: ?float, from: bool}|null $price
     * @var list<array{name: string, price: float, was: ?float}> $sizes
     */
    $money = static fn ($n) => number_format((float) $n, 2);
    $withDetails = $printStyle === 'full';
    $dv = trim((string) ($item->name_dv ?? ''));
    $description = trim((string) ($item->short_description ?: $item->description ?: ''));
    $tags = collect($item->dietary_tags ?? [])
        ->map(fn ($t) => trim((string) $t))
        ->filter()
        ->all();

    /*
     * A sized item carries base_price 0, so its own price line would read
     * "0.00". The sizes below carry the real money; the headline stays a
     * "from" only when there is no size list to print.
     */
    $hasSizes = $sizes !== [];
    $headline = $price;
@endphp

<div class="row">
    <div class="row__line">
        <span class="row__name">
            {{ $item->card_name ?: $item->name }}
        </span>
        @if ($showDhivehi && $dv !== '')
            {{-- Beside the name, not on a line of its own: a Dhivehi name
                 floating to the right margin reads as a separate entry. --}}
            <span class="row__dv">{{ $dv }}</span>
        @endif
        @if (!$hasSizes && $headline)
            <span class="row__dots" aria-hidden="true"></span>
            <span class="row__price">
                @if (!empty($headline['was']))
                    <span class="row__was">{{ $money($headline['was']) }}</span>
                @endif
                {{ $money($headline['price']) }}
            </span>
        @endif
    </div>

    @if ($withDetails && $description !== '')
        <p class="row__desc">{{ $description }}</p>
    @endif

    @if ($hasSizes)
        <ul class="row__sizes">
            @foreach ($sizes as $size)
                <li>
                    <span>{{ $size['name'] }}</span>
                    <span class="row__dots" aria-hidden="true"></span>
                    <span class="row__price">
                        @if (!empty($size['was']))
                            <span class="row__was">{{ $money($size['was']) }}</span>
                        @endif
                        {{ $money($size['price']) }}
                    </span>
                </li>
            @endforeach
        </ul>
    @endif

    @if ($withDetails && $tags !== [])
        <div class="row__tags">{{ implode(' · ', $tags) }}</div>
    @endif
</div>
