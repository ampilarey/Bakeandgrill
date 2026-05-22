@extends('layouts.document')

@section('doc_width', '520px')
@section('title', 'Order not found')

@section('content')
<div class="doc-card">
    <h1 class="doc-title">Order not found</h1>
    <p class="doc-subtitle">This tracking link may have expired or the order was removed.</p>
    <p style="margin-top:1rem;color:var(--muted);font-size:0.9375rem;line-height:1.5;">
        If you just placed an order, wait a minute and try again. Otherwise message us on WhatsApp with your phone number and we’ll look it up.
    </p>
    <div style="margin-top:1.25rem;display:flex;gap:0.625rem;flex-wrap:wrap;">
        <a class="doc-btn doc-btn-primary" href="{{ \App\Models\SiteSetting::get('business_whatsapp', 'https://wa.me/9609120011') }}" target="_blank" rel="noopener">WhatsApp us</a>
        <a class="doc-btn" href="/order/menu">Back to menu</a>
    </div>
</div>
@endsection
