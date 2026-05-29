@php
    $scAmount = (float) ($order->service_charge_amount ?? 0);
    $scLabel = $order->service_charge_label ?? 'Service charge';
    $scType = $order->service_charge_type ?? 'percent';
    $scValue = $order->service_charge_value;
    $showSc = $scAmount > 0.0001
        && filter_var(\App\Models\SiteSetting::get('show_service_charge_on_receipts', '1'), FILTER_VALIDATE_BOOLEAN);
    if ($showSc && $scType === 'percent' && $scValue !== null) {
        $formatted = rtrim(rtrim(number_format((float) $scValue, 2), '0'), '.');
        $scLineLabel = $scLabel . ' ' . $formatted . '%';
    } else {
        $scLineLabel = $scLabel;
    }
    $amountText = 'MVR ' . number_format($scAmount, 2);
@endphp
@if ($showSc)
    @if ($asPdf ?? false)
        <div class="pdf-totals-row"><span>{{ $scLineLabel }}</span><span>{{ $amountText }}</span></div>
    @else
        <p><span>{{ $scLineLabel }}</span><span>{{ $amountText }}</span></p>
    @endif
@endif
