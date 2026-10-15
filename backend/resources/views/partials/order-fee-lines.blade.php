{{-- Packaging, small-order and delivery fees between Subtotal and GST (App\Support\OrderFeeLines). --}}
@foreach (\App\Support\OrderFeeLines::for($order ?? null) as $feeLine)
    @if ($asPdf ?? false)
        <div class="pdf-totals-row" data-fee-line><span>{{ $feeLine['label'] }}</span><span>MVR {{ number_format($feeLine['amount'], 2) }}</span></div>
    @else
        <p data-fee-line><span>{{ $feeLine['label'] }}</span><span>MVR {{ number_format($feeLine['amount'], 2) }}</span></p>
    @endif
@endforeach
