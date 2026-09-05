@php
    /**
     * One dish on the printed menu.
     *
     * A table rather than flexbox: this file is rendered by a browser and by
     * dompdf, and dompdf lays out tables faithfully and flexbox not at all.
     * The dot leader is a full-width cell with a dotted bottom border, which
     * both renderers draw the same way.
     *
     * Shared by all three layouts because the *content* of a dish does not
     * change between them — only how much of it is worth showing, and how
     * large. Three near-identical templates would drift the moment one of them
     * learned about a new field.
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
     * "0.00". The sizes below carry the real money; the headline price is
     * printed only when there is no size list to print.
     */
    $hasSizes = $sizes !== [];
@endphp

<div class="dish">
    <table class="row">
        <tr>
            <td class="row__name">{{ $item->card_name ?: $item->name }}</td>
            @if ($showDhivehi && $dv !== '')
                {{-- Beside the name, not on a line of its own: a Dhivehi name
                     alone on the right margin reads as a separate entry. --}}
                <td class="row__dv">{{ $dv }}</td>
            @endif
            <td class="row__dots"></td>
            @if (!$hasSizes && $price)
                <td class="row__price">
                    @if (!empty($price['was']))
                        <span class="row__was">{{ $money($price['was']) }}</span>
                    @endif
                    {{ $money($price['price']) }}
                </td>
            @endif
        </tr>
    </table>

    @if ($withDetails && $description !== '')
        <p class="row__desc">{{ $description }}</p>
    @endif

    @foreach ($sizes as $size)
        <table class="row row__size">
            <tr>
                <td class="row__name">{{ $size['name'] }}</td>
                <td class="row__dots"></td>
                <td class="row__price">
                    @if (!empty($size['was']))
                        <span class="row__was">{{ $money($size['was']) }}</span>
                    @endif
                    {{ $money($size['price']) }}
                </td>
            </tr>
        </table>
    @endforeach

    @if ($withDetails && $tags !== [])
        <div class="row__tags">{{ implode(' · ', $tags) }}</div>
    @endif
</div>
