{{-- Shared menu-style price: "12.50/-" (no MVR). Optional struck original. --}}
@php
    $sale = (float) ($sale ?? 0);
    $was = isset($was) && $was !== null ? (float) $was : null;
@endphp
<span class="price-sale">{{ number_format($sale, 2) }}/-</span>
@if($was !== null && $was > $sale)
    <span class="price-was">{{ number_format($was, 2) }}/-</span>
@endif
@php $gstNote = \App\Support\GstShelfNote::text(); @endphp
@if($gstNote !== '')
    <span class="price-gst-note" style="display:block;font-size:0.72rem;font-weight:600;color:var(--muted, #8B7355);">{{ $gstNote }}</span>
@endif
