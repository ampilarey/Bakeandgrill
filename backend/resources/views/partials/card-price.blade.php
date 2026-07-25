{{-- Shared menu-style price: "12.50/-" (no MVR). Optional struck original. --}}
@php
    $sale = (float) ($sale ?? 0);
    $was = isset($was) && $was !== null ? (float) $was : null;
@endphp
<span class="price-sale">{{ number_format($sale, 2) }}/-</span>
@if($was !== null && $was > $sale)
    <span class="price-was">{{ number_format($was, 2) }}/-</span>
@endif
