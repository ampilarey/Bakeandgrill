{{-- The customer's purchase order on an invoice made from one (owner, 2026-11-15).
     $tag and $class let the web page and the two PDFs each use their own rows. --}}
@php $tag = $tag ?? 'div'; $class = $class ?? 'pdf-meta-value'; $style = $style ?? ''; @endphp
@if ($invoice->po_number)
    <{{ $tag }} class="{{ $class }}" @if($style) style="{{ $style }}" @endif data-po-number>PO No.: <strong>{{ $invoice->po_number }}</strong></{{ $tag }}>
@endif
@if ($invoice->delivery_date)
    <{{ $tag }} class="{{ $class }}" @if($style) style="{{ $style }}" @endif>Delivery: {{ $invoice->delivery_date->format('d M Y') }}</{{ $tag }}>
@endif
@if ($invoice->deliver_to)
    <{{ $tag }} class="{{ $class }}" @if($style) style="{{ $style }}" @endif>Deliver to: {{ $invoice->deliver_to }}</{{ $tag }}>
@endif
