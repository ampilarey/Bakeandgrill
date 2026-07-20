<x-mail::message>
# Your event quote {{ $request->reference }}

Hi {{ $request->contact_name ?: 'there' }},

Here is your itemized quote for {{ $request->event_type ?: 'your event' }}@if($request->event_date) on {{ \Illuminate\Support\Carbon::parse($request->event_date)->format('D, j M Y') }}@endif.

| Item | Qty | Unit | Line |
|:-----|----:|-----:|-----:|
@foreach($lines as $line)
| {{ $line->name }} | {{ $line->quantity }} | MVR {{ number_format(($line->unit_price ?? 0), 2) }} | MVR {{ number_format((($line->unit_price ?? 0) * $line->quantity), 2) }} |
@endforeach

**Subtotal:** MVR {{ number_format(($taxPreview['subtotal_laar'] ?? 0) / 100, 2) }}  
**GST:** MVR {{ number_format(($taxPreview['tax_laar'] ?? 0) / 100, 2) }}  
**Total:** MVR {{ number_format(($taxPreview['total_laar'] ?? 0) / 100, 2) }}

@if($request->quote_is_deposit)
**Payment due now (deposit):** MVR {{ number_format(($request->quote_payment_laar ?? 0) / 100, 2) }}
@else
**Payment due now:** MVR {{ number_format(($request->quote_payment_laar ?? 0) / 100, 2) }}
@endif

@if($request->quote_expires_at)
This quote is valid until {{ $request->quote_expires_at->timezone(config('app.timezone'))->format('D, j M Y g:ia') }}.
@endif

<x-mail::button :url="$quoteUrl">
View quote
</x-mail::button>

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
